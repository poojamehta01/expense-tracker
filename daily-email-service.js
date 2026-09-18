const INDIA_TIME_ZONE = 'Asia/Kolkata';

function reportingPeriod(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now).reduce((values, part) => {
    if (part.type !== 'literal') values[part.type] = part.value;
    return values;
  }, {});
  const indiaDate = `${parts.year}-${parts.month}-${parts.day}`;
  const previous = new Date(`${indiaDate}T00:00:00.000Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  const reportDate = previous.toISOString().slice(0, 10);
  const displayDate = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(previous);
  const monthName = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    month: 'long',
  }).format(previous);
  return {
    reportDate,
    displayDate,
    month: `${monthName}_${previous.getUTCFullYear()}`,
  };
}

const EXPENSE_EXCLUSIONS = ['Credit Card Payment', 'Settlement', 'Investment', 'Refunded'];

function monthToDateDisplayDates(period) {
  const end = new Date(`${period.reportDate}T00:00:00.000Z`).getUTCDate();
  const dates = [];
  for (let day = 1; day <= end; day += 1) {
    const date = new Date(`${period.reportDate.slice(0, 7)}-${String(day).padStart(2, '0')}T00:00:00.000Z`);
    dates.push(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
    }).format(date));
  }
  return dates;
}

function budgetUsage(actual, budget) {
  return budget === 0 ? null : actual / budget;
}

function boundBudgetToReportDate(budgetResult, db, period, monthDates) {
  if (!budgetResult.hasBudget) return budgetResult;
  const excluded = new Set(EXPENSE_EXCLUSIONS);
  const lateRows = db.prepare(`
    SELECT amount, category, paid_by, date
    FROM transactions
    WHERE month = ? AND date NOT IN (${monthDates.map(() => '?').join(', ')})
  `).all(period.month, ...monthDates);
  const lateUnmapped = new Map();
  for (const row of lateRows) {
    if (excluded.has(row.category) || row.category === null) continue;
    const amount = Number(row.amount);
    let mappedLine = ['Pooja', 'Kunal', 'Household Pool'].includes(row.paid_by)
      ? budgetResult.sections.flatMap(section => section.lines)
        .find(line => line.kind === 'expense' && line.mappings.includes(row.category))
      : null;
    let contributors = [];
    if (mappedLine) {
      contributors = db.prepare(`
        SELECT DISTINCT budget.person AS person
        FROM budgets AS budget
        JOIN budget_category_mappings AS mapping
          ON mapping.section = budget.section
         AND mapping.budget_category = budget.category
         AND mapping.kind = budget.kind
        WHERE budget.month = ? AND budget.person IN ('Pooja', 'Kunal')
          AND budget.kind = 'expense' AND mapping.transaction_category = ?
      `).all(period.month, row.category).map(contributor => contributor.person);
      if (row.paid_by !== 'Household Pool' && !contributors.includes(row.paid_by)) {
        mappedLine = null;
      }
    }
    if (mappedLine) {
      let mappedAmount = amount;
      let unmappedAmount = 0;
      if (row.paid_by === 'Household Pool') {
        mappedAmount = amount * 0.5 * contributors.length;
        unmappedAmount = amount * 0.5 * (2 - contributors.length);
      }
      mappedLine.actual -= mappedAmount;
      mappedLine.variance = mappedLine.budget - mappedLine.actual;
      mappedLine.usage = budgetUsage(mappedLine.actual, mappedLine.budget);
      if (unmappedAmount > 0) {
        lateUnmapped.set(row.category, (lateUnmapped.get(row.category) || 0) + unmappedAmount);
      }
    } else {
      lateUnmapped.set(row.category, (lateUnmapped.get(row.category) || 0) + amount);
    }
  }
  for (const section of budgetResult.sections) {
    section.actual = section.lines.reduce((total, line) => total + line.actual, 0);
    section.variance = section.budget - section.actual;
    section.usage = budgetUsage(section.actual, section.budget);
  }
  const unmappedCategories = budgetResult.unmappedExpenses.categories
    .map(row => ({ category: row.category, total: row.total - (lateUnmapped.get(row.category) || 0) }))
    .filter(row => row.total > 0);
  const lateUnmappedTotal = [...lateUnmapped.values()].reduce((total, value) => total + value, 0);
  budgetResult.unmappedExpenses = {
    categories: unmappedCategories,
    total: Math.max(0, budgetResult.unmappedExpenses.total - lateUnmappedTotal),
  };
  budgetResult.summary.actualSpending = budgetResult.sections
    .filter(section => section.lines.some(line => line.kind === 'expense'))
    .reduce((total, section) => total + section.lines
      .filter(line => line.kind === 'expense')
      .reduce((sum, line) => sum + line.actual, 0), 0) + budgetResult.unmappedExpenses.total;
  budgetResult.summary.variance = budgetResult.summary.expenseBudget - budgetResult.summary.actualSpending;
  budgetResult.summary.usage = budgetUsage(
    budgetResult.summary.actualSpending,
    budgetResult.summary.expenseBudget,
  );
  return budgetResult;
}

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function money(value) {
  return INR.format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function appLink(baseUrl, tab) {
  const cleanBaseUrl = String(baseUrl || '').replace(/\/+$/, '');
  return `${cleanBaseUrl}/?tab=${encodeURIComponent(tab)}`;
}

function renderReminder({ period, baseUrl }) {
  const date = String(period.displayDate);
  const addLink = appLink(baseUrl, 'add');
  const subject = 'Expense Tracker — Daily Reminder';
  const text = [
    `Pooja and Kunal, please finish adding expenses for ${date} before the 9:00 p.m. daily report.`,
    '',
    `Add expenses: ${addLink}`,
  ].join('\n');
  const html = [
    '<!doctype html><html><body>',
    `<p>Pooja and Kunal, please finish adding expenses for <strong>${escapeHtml(date)}</strong> before the 9:00 p.m. daily report.</p>`,
    `<p><a href="${escapeHtml(addLink)}">Add expenses</a></p>`,
    '</body></html>',
  ].join('');
  return { subject, text, html };
}

function renderExpenseRows(expenses, format) {
  if (!expenses.length) return format === 'html'
    ? '<p>No expense transactions recorded.</p>'
    : 'No expense transactions recorded.';
  if (format === 'html') {
    return `<ul>${expenses.map((row) => `<li>${escapeHtml(row.description || 'Unnamed expense')} — ${escapeHtml(row.category || 'Uncategorized')} — ${escapeHtml(row.paid_by || 'Unknown payer')} — ${money(row.amount)}</li>`).join('')}</ul>`;
  }
  return expenses.map((row) => `${row.description || 'Unnamed expense'} — ${row.category || 'Uncategorized'} — ${row.paid_by || 'Unknown payer'} — ${money(row.amount)}`).join('\n');
}

function renderInvestmentRows(investments, format) {
  if (!investments.length) return format === 'html'
    ? '<p>No investments recorded.</p>'
    : 'No investments recorded.';
  if (format === 'html') {
    return `<ul>${investments.map((row) => `<li>${escapeHtml(row.description || 'Unnamed investment')} — ${escapeHtml(row.paid_by || 'Unknown payer')} — ${money(row.amount)}</li>`).join('')}</ul>`;
  }
  return investments.map((row) => `${row.description || 'Unnamed investment'} — ${row.paid_by || 'Unknown payer'} — ${money(row.amount)}`).join('\n');
}

function renderReport(data, { baseUrl }) {
  const { period } = data;
  const date = String(period.displayDate);
  const budget = data.budget || { configured: false };
  const dashboardLink = appLink(baseUrl, 'dashboard');
  const budgetLink = appLink(baseUrl, 'budget');
  const hasExpenses = Number(data.dailyExpenseCount || 0) > 0;
  const hasInvestments = (data.dailyInvestments || []).length > 0;
  const usage = budget.configured && budget.usage != null ? `${Math.round(Number(budget.usage) * 100)}%` : null;
  const budgetLine = !budget.configured
    ? 'No budget configured'
    : Number(budget.remaining) < 0
      ? `Overspent: ${money(Math.abs(budget.remaining))}`
      : `Remaining: ${money(budget.remaining)}`;
  const unmappedLine = budget.configured && Number(budget.unmappedTotal || 0) > 0
    ? `Unmapped expenses: ${money(budget.unmappedTotal)}`
    : null;
  const subject = 'Expense Tracker — Daily Report';
  const text = [
    `Daily report for ${date}`,
    '',
    hasExpenses
      ? `Yesterday's expenses: ${money(data.dailyExpenseTotal)} (${data.dailyExpenseCount} transaction${data.dailyExpenseCount === 1 ? '' : 's'})`
      : `No expenses recorded for ${date}`,
    hasExpenses ? renderExpenseRows(data.dailyExpenses || [], 'text') : null,
    '',
    hasInvestments
      ? `Investments yesterday: ${money(data.dailyInvestmentTotal)}`
      : `No investments recorded for ${date}`,
    hasInvestments ? renderInvestmentRows(data.dailyInvestments || [], 'text') : null,
    '',
    budget.configured
      ? `Month to date: ${money(data.monthExpenseTotal)} of ${money(budget.expenseBudget)}`
      : `Month to date: ${money(data.monthExpenseTotal)}`,
    `Investments month to date: ${money(data.monthInvestmentTotal)}`,
    budgetLine,
    usage ? `${usage} used` : null,
    unmappedLine,
    '',
    `Dashboard: ${dashboardLink}`,
    `Budget: ${budgetLink}`,
  ].filter((line) => line !== null).join('\n');
  const htmlExpenseSection = hasExpenses
    ? `<p><strong>Yesterday's expenses: ${money(data.dailyExpenseTotal)}</strong> (${data.dailyExpenseCount} transaction${data.dailyExpenseCount === 1 ? '' : 's'})</p>${renderExpenseRows(data.dailyExpenses || [], 'html')}`
    : `<p>No expenses recorded for ${escapeHtml(date)}.</p>`;
  const htmlInvestmentSection = hasInvestments
    ? `<p><strong>Investments yesterday: ${money(data.dailyInvestmentTotal)}</strong></p>${renderInvestmentRows(data.dailyInvestments || [], 'html')}`
    : `<p>No investments recorded for ${escapeHtml(date)}.</p>`;
  const htmlBudgetSection = !budget.configured
    ? '<p>No budget configured</p>'
    : `<p>Month to date: ${money(data.monthExpenseTotal)} of ${money(budget.expenseBudget)}</p><p>${escapeHtml(budgetLine)}${usage ? ` (${escapeHtml(usage)} used)` : ''}</p>${unmappedLine ? `<p><strong>${escapeHtml(unmappedLine)}</strong></p>` : ''}`;
  const html = [
    '<!doctype html><html><body>',
    `<h1>Daily report for ${escapeHtml(date)}</h1>`,
    htmlExpenseSection,
    htmlInvestmentSection,
    htmlBudgetSection,
    `<p>Investments month to date: ${money(data.monthInvestmentTotal)}</p>`,
    `<p><a href="${escapeHtml(dashboardLink)}">Dashboard</a> · <a href="${escapeHtml(budgetLink)}">Budget</a></p>`,
    '</body></html>',
  ].join('');
  return { subject, text, html };
}

function createDailyEmailService({ db, budgetService, transport, config, now = () => new Date() }) {
  void transport;
  void config;

  function getReportData() {
    const period = reportingPeriod(now());
    const placeholders = EXPENSE_EXCLUSIONS.map(() => '?').join(', ');
    const expenseWhere = `month = ? AND date = ? AND category NOT IN (${placeholders})`;
    const expenseParams = [period.month, period.displayDate, ...EXPENSE_EXCLUSIONS];
    const dailyExpenses = db.prepare(`
      SELECT id, date, amount, description, payment_method, paid_by, expense_type,
             category, mood, impulse, remarks, month
      FROM transactions
      WHERE ${expenseWhere}
      ORDER BY id
    `).all(...expenseParams);
    const dailyInvestmentRows = db.prepare(`
      SELECT id, date, amount, description, payment_method, paid_by, expense_type,
             category, mood, impulse, remarks, month
      FROM transactions
      WHERE month = ? AND date = ? AND category = 'Investment'
      ORDER BY id
    `).all(period.month, period.displayDate);
    const monthDates = monthToDateDisplayDates(period);
    const monthDatePlaceholders = monthDates.map(() => '?').join(', ');
    const monthExpenseTotal = Number(db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM transactions
      WHERE month = ? AND date IN (${monthDatePlaceholders}) AND category NOT IN (${placeholders})
    `).get(period.month, ...monthDates, ...EXPENSE_EXCLUSIONS).total);
    const monthInvestmentTotal = Number(db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM transactions
      WHERE month = ? AND date IN (${monthDatePlaceholders}) AND category = 'Investment'
    `).get(period.month, ...monthDates).total);
    const budgetResult = boundBudgetToReportDate(
      budgetService.getBudget({ month: period.month, person: 'all' }),
      db,
      period,
      monthDates,
    );
    const budget = budgetResult.hasBudget ? {
      configured: true,
      expenseBudget: budgetResult.summary.expenseBudget,
      actualSpending: budgetResult.summary.actualSpending,
      remaining: budgetResult.summary.variance,
      usage: budgetResult.summary.usage,
      unmappedTotal: budgetResult.unmappedExpenses?.total || 0,
    } : { configured: false };
    return {
      period,
      dailyExpenses,
      dailyExpenseTotal: dailyExpenses.reduce((total, row) => total + Number(row.amount), 0),
      dailyExpenseCount: dailyExpenses.length,
      dailyInvestments: dailyInvestmentRows,
      dailyInvestmentTotal: dailyInvestmentRows.reduce((total, row) => total + Number(row.amount), 0),
      monthExpenseTotal,
      monthInvestmentTotal,
      budget,
    };
  }

  return { getReportData };
}

module.exports = {
  createDailyEmailService,
  reportingPeriod,
  renderReminder,
  renderReport,
};
