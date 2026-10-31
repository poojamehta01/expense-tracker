const { createHash } = require('node:crypto');
const { createBudgetService, validateMonth } = require('../budget-service');
const { createInvestmentService } = require('../investment-service');
const { createFinanceService, MONTHS, EXPENSE_EXCLUDE, EXCLUDED_CATEGORIES, EDITABLE } = require('../finance-service');
const fail = (message, code = 'validation') => { throw Object.assign(new Error(message), { code }); };
function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01') return null;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}
function storedDate(value) {
  if (isoDate(value)) return value;
  const match = typeof value === 'string' && /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(value);
  if (!match || !MONTHS.includes(match[2])) return null;
  return isoDate(`${match[3]}-${String(MONTHS.indexOf(match[2]) + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`);
}
function toStoredDate(value) {
  if (!isoDate(value)) fail('Date must be a real ISO calendar date (YYYY-MM-DD)');
  const [year, month, day] = value.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}
function positiveId(value) { if (!Number.isSafeInteger(value) || value < 1) fail('ID must be a positive integer'); return value; }
function person(value = 'all') { if (!['all', 'Pooja', 'Kunal'].includes(value)) fail('Person must be Pooja, Kunal, or all'); return value; }
function revision(row) { return createHash('sha256').update(JSON.stringify([row.id, ...EDITABLE.map(key => row[key]), row.month])).digest('hex'); }
function present(row) { return { ...row, originalDate: row.date, date: storedDate(row.date), revision: revision(row) }; }
const RESPONSIBILITY = {
  Pooja: "CASE WHEN expense_type IN ('Pooja_Personal','Kunal_for_Pooja') THEN amount WHEN expense_type='Common_50_50' THEN amount/2.0 ELSE 0 END",
  Kunal: "CASE WHEN expense_type IN ('Kunal_Personal','Pooja_for_Kunal') THEN amount WHEN expense_type='Common_50_50' THEN amount/2.0 ELSE 0 END",
};
function createMcpFinance({ db, financeService = createFinanceService(db), lists = {}, now = () => new Date() }) {
  db.function('mcp_iso_date', { deterministic: true }, storedDate);
  const budgets = createBudgetService(db, { validCategories: lists.categories || [] });
  const investments = createInvestmentService(db);
  const known = name => [...new Set([...(lists[name] || []), ...db.prepare('SELECT value FROM lists WHERE list_name = ? ORDER BY value').all(name).map(x => x.value)])];
  const getRow = id => { const row = db.prepare('SELECT * FROM transactions WHERE id=?').get(positiveId(id)); if (!row) fail('Transaction not found', 'not_found'); return row; };
  function filter(input = {}, requirePeriod = false) {
    const clauses = []; const values = [];
    if (input.month !== undefined) { validateMonth(input.month); clauses.push('month=?'); values.push(input.month); }
    if (input.startDate !== undefined || input.endDate !== undefined) {
      if (!isoDate(input.startDate) || !isoDate(input.endDate) || input.startDate > input.endDate) fail('Provide a valid inclusive startDate and endDate');
      if (input.month !== undefined) fail('Use a month or a date range, not both');
      clauses.push('mcp_iso_date(date) BETWEEN ? AND ?'); values.push(input.startDate, input.endDate);
    }
    if (requirePeriod && !clauses.length) fail('A month or inclusive date range is required');
    if (input.text !== undefined) {
      if (typeof input.text !== 'string' || input.text.length > 200) fail('Search text must contain at most 200 characters');
      clauses.push("(description LIKE ? ESCAPE '\\' OR remarks LIKE ? ESCAPE '\\')");
      const text = '%' + input.text.replace(/[\\%_]/g, '\\$&') + '%'; values.push(text, text);
    }
    for (const [key, field] of Object.entries({ category: 'category', paymentMethod: 'payment_method', paidBy: 'paid_by', expenseType: 'expense_type' })) {
      if (input[key] !== undefined) {
        if (typeof input[key] !== 'string' || input[key].length > 200) fail(`${key} must be a string of at most 200 characters`);
        clauses.push(`${field}=?`); values.push(input[key]);
      }
    }
    return { where: clauses.length ? clauses.join(' AND ') : '1=1', values };
  }
  function search(input = {}) {
    const { where, values } = filter(input);
    const { limit = 50, offset = 0 } = input;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isSafeInteger(offset) || offset < 0) fail('limit must be 1–200 and offset a nonnegative integer');
    const total = db.prepare(`SELECT COUNT(*) count FROM transactions WHERE ${where}`).get(...values).count;
    const rows = db.prepare(`SELECT * FROM transactions WHERE ${where} ORDER BY mcp_iso_date(date),id LIMIT ? OFFSET ?`).all(...values, limit, offset);
    return { currency: 'INR', filters: input, total, offset, nextOffset: offset + limit < total ? offset + limit : null,
      transactions: rows.map(present), includesExcludedCategories: true };
  }
  function summary(input) {
    const selected = person(input.person);
    const { where, values } = filter(input, true);
    const base = `FROM transactions WHERE ${where}${EXPENSE_EXCLUDE}`;
    const counted = selected === 'all' ? 'amount' : RESPONSIBILITY[selected];
    const totals = db.prepare(`SELECT COALESCE(SUM(${counted}),0) totalSpend, SUM(CASE WHEN (${counted}) != 0 THEN 1 ELSE 0 END) transactionCount,
      SUM(CASE WHEN mcp_iso_date(date) IS NULL THEN 1 ELSE 0 END) invalidDateCount,
      COALESCE(SUM(${RESPONSIBILITY.Pooja}),0) Pooja, COALESCE(SUM(${RESPONSIBILITY.Kunal}),0) Kunal, COALESCE(SUM(amount),0) combined ${base}`).get(...values);
    const grouped = field => db.prepare(`SELECT ${field} label, SUM(${counted}) total ${base} GROUP BY ${field} HAVING total != 0 ORDER BY total DESC,label LIMIT 201`).all(...values);
    const categories = grouped('category'), daily = grouped('mcp_iso_date(date)'), paid = grouped('paid_by');
    return { currency: 'INR', filters: input, person: selected, totalSpend: totals.totalSpend, transactionCount: totals.transactionCount || 0,
      invalidDateCount: totals.invalidDateCount || 0, byResponsibility: { Pooja: totals.Pooja, Kunal: totals.Kunal },
      unassignedResponsibility: totals.combined - totals.Pooja - totals.Kunal,
      byCategory: categories.slice(0, 200).map(x => ({ category: x.label, total: x.total })),
      dailySpend: daily.slice(0, 200).map(x => ({ date: x.label, total: x.total })).sort((a,b) => String(a.date).localeCompare(String(b.date))),
      byPaidBy: paid.slice(0, 200).map(x => ({ paid_by: x.label, total: x.total })),
      responsibilityScope: 'Household responsibility totals always describe the full period; totalSpend and breakdowns use the selected person.',
      truncated: { byCategory: categories.length > 200, dailySpend: daily.length > 200, byPaidBy: paid.length > 200 }, excludedCategories: EXCLUDED_CATEGORIES };
  }
  return {
    context() { return { currency: 'INR', timezone: 'Asia/Kolkata', today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now()),
      categories: known('categories'), expenseTypes: known('expense_types'), paymentMethods: known('payment_methods'), paidBy: ['Pooja','Kunal','Household Pool'], people: ['Pooja','Kunal','all'],
      months: MONTHS, monthFormat: 'October_2026', dateFormat: 'YYYY-MM-DD', excludedCategories: EXCLUDED_CATEGORIES,
      scope: 'Shared household records; person is a filter, not an access boundary.' }; },
    months() {
      const rows = db.prepare('SELECT month FROM transactions UNION SELECT month FROM salaries UNION SELECT month FROM budgets').all();
      const valid = rows.map(x => x.month).filter(x => { try { validateMonth(x); return true; } catch { return false; } });
      const order = m => Number(m.split('_')[1]) * 12 + MONTHS.indexOf(m.split('_')[0]);
      return { months: valid.sort((a,b) => order(a)-order(b)) };
    },
    search, summary,
    transaction({ id }) { return { currency: 'INR', transaction: present(getRow(id)) }; },
    budget({ month, person: selected = 'all' }) { return { currency: 'INR', ...budgets.getBudget({ month, person: selected }) }; },
    budgetTransactions(input) { return { currency: 'INR', ...budgets.getBudgetTransactions({ person: 'all', ...input }) }; },
    settlement({ month }) { validateMonth(month); const value = financeService.getSettlement(month); return { currency: 'INR', month, ...value, owes: value.net > 0 ? 'Kunal owes Pooja' : value.net < 0 ? 'Pooja owes Kunal' : 'Settled', amount: Math.abs(value.net) }; },
    salary({ month, person: selected = 'all' }) {
      validateMonth(month); person(selected);
      const rows = db.prepare('SELECT person,amount,notes FROM salaries WHERE month=?').all(month);
      const people = Object.fromEntries((selected === 'all' ? ['Pooja','Kunal'] : [selected]).map(name => {
        const row = rows.find(x => x.person === name); return [name, { amount: row?.amount ?? null, notes: row?.notes || '', recorded: !!row }];
      }));
      return { currency: 'INR', month, people };
    },
    investments({ person: selected = 'all' } = {}) {
      person(selected); const result = investments.list();
      if (selected !== 'all') { result.entries = result.entries.filter(x => x.person === selected); result.totals = { [selected]: result.totals[selected] }; result.valuations = { [selected]: result.valuations[selected] }; }
      return { currency: 'INR', source: 'Recorded values, not live market prices', ...result };
    },
  };
}
module.exports = { createMcpFinance, isoDate, storedDate, toStoredDate, revision, fail, present, positiveId };
