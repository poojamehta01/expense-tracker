const { normalizeHouseholdPoolTransaction, calculateSettlement } = require('./household-pool');
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const EXCLUDED_CATEGORIES = ['Credit Card Payment', 'Settlement', 'Investment', 'Refunded'];
const EXPENSE_EXCLUDE = EXCLUDED_CATEGORIES.map(category => ` AND category != '${category}'`).join('');
const EDITABLE = ['date','amount','description','payment_method','paid_by','expense_type','category','mood','impulse','remarks'];
function monthFromDate(dateStr) {
  const parts = dateStr.trim().split(' ');
  if (parts.length >= 3) return `${parts[1]}_${parts[2]}`;
  const now = new Date();
  return `${MONTHS[now.getMonth()]}_${now.getFullYear()}`;
}
function createFinanceService(db, { afterInsert = () => {} } = {}) {
  const insert = db.prepare(`INSERT INTO transactions (${EDITABLE.join(',')},month)
    VALUES (${EDITABLE.map(key => '@' + key).join(',')},@month)`);
  const existing = id => db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  const normalize = input => {
    const tx = normalizeHouseholdPoolTransaction(input);
    const data = Object.fromEntries(EDITABLE.map(key => [key, tx[key] || '']));
    data.amount = parseFloat(tx.amount) || 0;
    data.month = monthFromDate(data.date);
    return data;
  };
  const addTransactions = db.transaction(rows => {
    const ids = []; let skipped = 0;
    for (const input of rows) {
      const data = normalize(input);
      if (db.prepare('SELECT id FROM transactions WHERE date=? AND amount=? AND description=?').get(data.date, data.amount, data.description)) { skipped++; continue; }
      ids.push(Number(insert.run(data).lastInsertRowid));
    }
    if (ids.length) afterInsert();
    return { saved: ids.length, skipped, ids };
  });
  const updateTransaction = db.transaction((id, patch) => {
    const before = existing(id);
    if (!before) throw Object.assign(new Error('Transaction not found'), { code: 'not_found' });
    db.prepare('INSERT INTO transaction_audit (tx_id,action,snapshot) VALUES (?,?,?)').run(id, 'update', JSON.stringify(before));
    db.prepare("DELETE FROM transaction_audit WHERE changed_at < datetime('now', '-1 day')").run();
    const data = normalize({ ...before, ...patch });
    // Legacy date strings may not parse; a note/category edit must not move their accounting month.
    if (!Object.hasOwn(patch, 'date')) data.month = before.month;
    db.prepare(`UPDATE transactions SET ${EDITABLE.map(key => key + '=@' + key).join(',')},month=@month WHERE id=@id`).run({ ...data, id });
    return existing(id);
  });
  function getSettlement(month) {
    return calculateSettlement(db.prepare(`SELECT expense_type, paid_by, SUM(amount) AS total FROM transactions WHERE month = ?
      AND expense_type IN ('Common_50_50','Pooja_for_Kunal','Kunal_for_Pooja') GROUP BY expense_type,paid_by`).all(month));
  }
  function getDashboard(month) {
  const base = 'FROM transactions WHERE month = ?';
  const expenseBase = `${base}${EXPENSE_EXCLUDE}`;

  const totalRow = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt ${expenseBase}`).get(month);
  const investmentRow = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total ${base} AND category = 'Investment'`).get(month);
  const byCategory = db.prepare(`SELECT category, SUM(amount) AS total ${expenseBase} GROUP BY category ORDER BY total DESC LIMIT 10`).all(month);
  const byPaidByRows = db.prepare(`SELECT paid_by, SUM(amount) AS total ${expenseBase} GROUP BY paid_by`).all(month);
  const byExpenseType = db.prepare(`SELECT expense_type, SUM(amount) AS total ${expenseBase} GROUP BY expense_type ORDER BY total DESC`).all(month);
  const byPaymentMethod = db.prepare(`SELECT payment_method, SUM(amount) AS total ${expenseBase} GROUP BY payment_method ORDER BY total DESC`).all(month);
  const dailySpend = db.prepare(`SELECT date, SUM(amount) AS total ${expenseBase} GROUP BY date ORDER BY date`).all(month);
  const topMerchants = db.prepare(`SELECT description, SUM(amount) AS total, COUNT(*) AS cnt ${expenseBase} GROUP BY description ORDER BY total DESC LIMIT 10`).all(month);

  const byPaidBy = {};
  for (const r of byPaidByRows) byPaidBy[r.paid_by || 'Unknown'] = r.total;

  // Actual spend responsibility: Personal + half of Common + paid-for-other
  const etMap = {};
  for (const r of byExpenseType) etMap[r.expense_type] = r.total || 0;
  const commonHalf = (etMap['Common_50_50'] || 0) / 2;
  const byResponsibility = {
    Pooja: (etMap['Pooja_Personal'] || 0) + (etMap['Kunal_for_Pooja'] || 0) + commonHalf,
    Kunal: (etMap['Kunal_Personal'] || 0) + (etMap['Pooja_for_Kunal'] || 0) + commonHalf,
  };

  // Settlement: net amount Kunal owes Pooja (negative = Pooja owes Kunal)
  const settlementRows = db.prepare(
    `SELECT expense_type, paid_by, SUM(amount) AS total ${base}
     AND expense_type IN ('Common_50_50','Pooja_for_Kunal','Kunal_for_Pooja')
     GROUP BY expense_type, paid_by`
  ).all(month);

  const settlement = calculateSettlement(settlementRows);

  return {
    totalSpend: totalRow.total,
    investments: investmentRow.total,
    transactionCount: totalRow.cnt,
    byCategory,
    byPaidBy,
    byResponsibility,
    byExpenseType,
    byPaymentMethod,
    dailySpend,
    topMerchants,
    settlement
  };
  }
  return { addTransactions, updateTransaction, getDashboard, getSettlement };
}
module.exports = { createFinanceService, monthFromDate, MONTHS, EXCLUDED_CATEGORIES, EXPENSE_EXCLUDE, EDITABLE };
