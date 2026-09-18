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
    const budgetResult = budgetService.getBudget({ month: period.month, person: 'all' });
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
