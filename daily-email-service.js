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
    const mappedLine = ['Pooja', 'Kunal', 'Household Pool'].includes(row.paid_by)
      ? budgetResult.sections.flatMap(section => section.lines)
        .find(line => line.kind === 'expense' && line.mappings.includes(row.category))
      : null;
    if (mappedLine) {
      mappedLine.actual -= amount;
      mappedLine.variance = mappedLine.budget - mappedLine.actual;
      mappedLine.usage = budgetUsage(mappedLine.actual, mappedLine.budget);
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

module.exports = { createDailyEmailService, reportingPeriod };
