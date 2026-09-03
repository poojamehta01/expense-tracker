const PEOPLE = ['Pooja', 'Kunal'];
const KINDS = new Set(['expense', 'investment']);
const EXCLUDED_CATEGORIES = ['Credit Card Payment', 'Settlement', 'Refunded'];
const MONTH_NAMES = new Set([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]);

function serviceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateMonth(month) {
  const match = typeof month === 'string' && /^([A-Za-z]+)_(\d{4})$/.exec(month);
  if (!match || !MONTH_NAMES.has(match[1])) {
    throw serviceError('validation', 'Month must use Month_YYYY');
  }
  return month;
}

function validatePerson(person, { allowAll = false } = {}) {
  if (!PEOPLE.includes(person) && !(allowAll && person === 'all')) {
    throw serviceError('validation', `Person must be ${allowAll ? 'Pooja, Kunal, or all' : 'Pooja or Kunal'}`);
  }
  return person;
}

function lineStatus({ budget, actual, hasMappings }) {
  if (!hasMappings) return 'mapping_needed';
  if (budget === 0) return actual > 0 ? 'unbudgeted' : 'no_activity';
  if (actual === 0) return 'no_activity';
  if (actual > budget) return 'over_budget';
  if (actual / budget >= 0.8) return 'watch';
  return 'on_track';
}

function usage(actual, budget) {
  return budget === 0 ? null : actual / budget;
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw serviceError('validation', `${label} must be a non-empty string`);
  }
  return value.trim();
}

function validateKind(kind) {
  if (!KINDS.has(kind)) throw serviceError('validation', 'Kind must be expense or investment');
  return kind;
}

function validateLines(lines) {
  if (!Array.isArray(lines)) throw serviceError('validation', 'Lines must be an array');
  const seen = new Set();
  return lines.map(line => {
    if (!line || typeof line !== 'object') throw serviceError('validation', 'Budget line must be an object');
    const section = nonEmptyString(line.section, 'Section');
    const category = nonEmptyString(line.category, 'Category');
    const kind = validateKind(line.kind);
    const amount = Number(line.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw serviceError('validation', 'Budget amount must be a finite non-negative number');
    }
    if (!Number.isInteger(line.sort_order) || line.sort_order < 0) {
      throw serviceError('validation', 'Sort order must be a non-negative integer');
    }
    const key = `${section}\u0000${category}`;
    if (seen.has(key)) throw serviceError('validation', 'Duplicate budget line');
    seen.add(key);
    return { section, category, kind, amount, sort_order: line.sort_order };
  });
}

function sectionFromLines(lines) {
  const sections = [];
  const byName = new Map();
  for (const line of lines) {
    let section = byName.get(line.section);
    if (!section) {
      section = { section: line.section, budget: 0, actual: 0, variance: 0, usage: null, lines: [] };
      byName.set(line.section, section);
      sections.push(section);
    }
    section.lines.push(line);
    section.budget += line.budget;
    section.actual += line.actual;
  }
  for (const section of sections) {
    section.lines.sort((a, b) => a.sort_order - b.sort_order || a.category.localeCompare(b.category));
    section.variance = section.budget - section.actual;
    section.usage = usage(section.actual, section.budget);
  }
  return sections;
}

function buildSummary(lines, salary) {
  const expenseLines = lines.filter(line => line.kind === 'expense');
  const investmentLines = lines.filter(line => line.kind === 'investment');
  const expenseBudget = expenseLines.reduce((total, line) => total + line.budget, 0);
  const actualSpending = expenseLines.reduce((total, line) => total + line.actual, 0);
  const plannedInvestments = investmentLines.reduce((total, line) => total + line.budget, 0);
  const actualInvestments = investmentLines.reduce((total, line) => total + line.actual, 0);
  return {
    expenseBudget,
    actualSpending,
    variance: expenseBudget - actualSpending,
    usage: usage(actualSpending, expenseBudget),
    salary,
    netMonthlySavings: salary - actualSpending,
    plannedInvestments,
    actualInvestments,
  };
}

function combineBudgetResponses(first, second) {
  const responses = [first, second].filter(Boolean);
  if (!responses.length) throw serviceError('validation', 'At least one budget response is required');
  const linesByKey = new Map();
  for (const response of responses) {
    for (const section of response.sections) {
      for (const line of section.lines) {
        const key = `${line.section}\u0000${line.category}\u0000${line.kind}`;
        const current = linesByKey.get(key);
        if (current) {
          current.budget += line.budget;
          current.actual += line.actual;
          current.variance = current.budget - current.actual;
          current.usage = usage(current.actual, current.budget);
          current.hasMappings = current.hasMappings || line.hasMappings;
          current.mappings = [...new Set([...current.mappings, ...line.mappings])];
          current.status = lineStatus(current);
        } else {
          linesByKey.set(key, { ...line, mappings: [...line.mappings] });
        }
      }
    }
  }
  const lines = [...linesByKey.values()];
  const salary = responses.reduce((total, response) => total + response.summary.salary, 0);
  return {
    month: responses[0].month,
    person: 'all',
    hasBudget: responses.some(response => response.hasBudget),
    hasSalary: responses.length === PEOPLE.length && responses.every(response => response.hasSalary),
    summary: buildSummary(lines, salary),
    sections: sectionFromLines(lines),
    unmappedCount: lines.filter(line => !line.hasMappings).length,
  };
}

function createBudgetService(db, { validCategories = [] } = {}) {
  const replaceLines = db.transaction(({ month, person, lines }) => {
    db.prepare('DELETE FROM budgets WHERE month = ? AND person = ?').run(month, person);
    const insert = db.prepare(`
      INSERT INTO budgets (month, person, section, category, kind, amount, sort_order, created_at, updated_at)
      VALUES (@month, @person, @section, @category, @kind, @amount, @sort_order, datetime('now'), datetime('now'))
    `);
    for (const line of lines) insert.run({ ...line, month, person });
    return { saved: true, count: lines.length };
  });

  function replaceBudget({ month, person, lines }) {
    validateMonth(month);
    validatePerson(person);
    return replaceLines({ month, person, lines: validateLines(lines) });
  }

  function getSingleBudget(month, person) {
    const budgetRows = db.prepare(`
      SELECT section, category, kind, amount, sort_order
      FROM budgets WHERE month = ? AND person = ? ORDER BY id
    `).all(month, person);
    const mappingRows = db.prepare(`
      SELECT section, budget_category, transaction_category, kind
      FROM budget_category_mappings
    `).all();
    const mappings = new Map();
    for (const mapping of mappingRows) {
      const key = `${mapping.section}\u0000${mapping.budget_category}\u0000${mapping.kind}`;
      const current = mappings.get(key) || [];
      current.push(mapping.transaction_category);
      mappings.set(key, current);
    }
    const transactionRows = db.prepare(`
      SELECT paid_by, category, COALESCE(SUM(amount), 0) AS total
      FROM transactions
      WHERE month = ?
        AND paid_by IN ('Pooja','Kunal')
        AND category NOT IN ('Credit Card Payment','Settlement','Refunded')
      GROUP BY paid_by, category
    `).all(month);
    const totals = new Map(transactionRows
      .filter(row => row.paid_by === person)
      .map(row => [row.category, Number(row.total)]));
    const lines = budgetRows.map(row => {
      const mappingKey = `${row.section}\u0000${row.category}\u0000${row.kind}`;
      const lineMappings = mappings.get(mappingKey) || [];
      const actual = lineMappings.reduce((total, category) => total + (totals.get(category) || 0), 0);
      const budget = Number(row.amount);
      return {
        section: row.section,
        category: row.category,
        kind: row.kind,
        budget,
        actual,
        variance: budget - actual,
        usage: usage(actual, budget),
        hasMappings: lineMappings.length > 0,
        mappings: lineMappings,
        sort_order: row.sort_order,
        status: lineStatus({ budget, actual, hasMappings: lineMappings.length > 0 }),
      };
    });
    const salaryRow = db.prepare('SELECT amount FROM salaries WHERE person = ? AND month = ?').get(person, month);
    const salary = salaryRow ? Number(salaryRow.amount) : 0;
    return {
      month,
      person,
      hasBudget: budgetRows.length > 0,
      hasSalary: Boolean(salaryRow),
      summary: buildSummary(lines, salary),
      sections: sectionFromLines(lines),
      unmappedCount: lines.filter(line => !line.hasMappings).length,
    };
  }

  function getBudget({ month, person }) {
    validateMonth(month);
    validatePerson(person, { allowAll: true });
    if (person === 'all') return combineBudgetResponses(getSingleBudget(month, 'Pooja'), getSingleBudget(month, 'Kunal'));
    return getSingleBudget(month, person);
  }

  function replaceMappings({ section, budgetCategory, kind, transactionCategories }) {
    section = nonEmptyString(section, 'Section');
    budgetCategory = nonEmptyString(budgetCategory, 'Budget category');
    validateKind(kind);
    if (!Array.isArray(transactionCategories)) throw serviceError('validation', 'Transaction categories must be an array');
    const knownCategories = new Set(validCategories);
    for (const row of db.prepare(`SELECT value FROM lists WHERE list_name = 'categories'`).all()) knownCategories.add(row.value);
    const categories = transactionCategories.map(category => nonEmptyString(category, 'Transaction category'));
    if (new Set(categories).size !== categories.length) throw serviceError('validation', 'Duplicate transaction category');
    for (const category of categories) {
      if (!knownCategories.has(category)) throw serviceError('validation', `Unknown transaction category: ${category}`);
      const existing = db.prepare(`
        SELECT section, budget_category FROM budget_category_mappings
        WHERE kind = ? AND transaction_category = ?
      `).get(kind, category);
      if (existing && (existing.section !== section || existing.budget_category !== budgetCategory)) {
        throw serviceError('validation', `Transaction category already mapped: ${category}`);
      }
    }
    return db.transaction(() => {
      db.prepare(`DELETE FROM budget_category_mappings WHERE section = ? AND budget_category = ? AND kind = ?`)
        .run(section, budgetCategory, kind);
      const insert = db.prepare(`
        INSERT INTO budget_category_mappings (section, budget_category, transaction_category, kind)
        VALUES (?, ?, ?, ?)
      `);
      for (const category of categories) insert.run(section, budgetCategory, category, kind);
      return { saved: true, count: categories.length };
    })();
  }

  function copyBudget({ sourceMonth, targetMonth, person, replace = false }) {
    validateMonth(sourceMonth);
    validateMonth(targetMonth);
    validatePerson(person, { allowAll: true });
    if (sourceMonth === targetMonth) throw serviceError('validation', 'Source and target months must differ');
    if (typeof replace !== 'boolean') throw serviceError('validation', 'Replace must be a boolean');
    const requestedPeople = person === 'all' ? PEOPLE : [person];
    const sourceRows = db.prepare(`
      SELECT person FROM budgets WHERE month = ? AND person IN (${requestedPeople.map(() => '?').join(', ')}) GROUP BY person
    `).all(sourceMonth, ...requestedPeople);
    if (!sourceRows.length) throw serviceError('not_found', 'Source budget was not found');
    const sourcePeople = sourceRows.map(row => row.person);
    const targetRows = db.prepare(`
      SELECT person FROM budgets WHERE month = ? AND person IN (${sourcePeople.map(() => '?').join(', ')}) GROUP BY person
    `).all(targetMonth, ...sourcePeople);
    if (targetRows.length && !replace) throw serviceError('conflict', 'Target budget already exists');
    return db.transaction(() => {
      if (replace && targetRows.length) {
        db.prepare(`DELETE FROM budgets WHERE month = ? AND person IN (${sourcePeople.map(() => '?').join(', ')})`)
          .run(targetMonth, ...sourcePeople);
      }
      const copy = db.prepare(`
        INSERT INTO budgets (month, person, section, category, kind, amount, sort_order, created_at, updated_at)
        SELECT ?, person, section, category, kind, amount, sort_order, datetime('now'), datetime('now')
        FROM budgets WHERE month = ? AND person = ?
      `);
      let count = 0;
      for (const sourcePerson of sourcePeople) count += copy.run(targetMonth, sourceMonth, sourcePerson).changes;
      return { saved: true, count };
    })();
  }

  return { getBudget, replaceBudget, replaceMappings, copyBudget };
}

module.exports = { createBudgetService, validateMonth, validatePerson, lineStatus, combineBudgetResponses };
