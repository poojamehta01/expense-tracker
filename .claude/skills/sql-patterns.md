# SQL Patterns — Expense Tracker

## Always use these constants (defined in server.js)

```js
const CC_EXCLUDE = " AND category != 'Credit Card Payment' AND category != 'Settlement'";
const MONTH_SORT = `CASE SUBSTR(month,1,INSTR(month,'_')-1)
  WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3
  WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6
  WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9
  WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12
END`;
```

## Person filter (used in /api/trends)
```js
const { person } = req.query;
let pf = '', pfParams = [];
if (person === 'Pooja') { pf = " AND paid_by='Pooja'"; }
else if (person === 'Kunal') { pf = " AND paid_by='Kunal'"; }
else if (person === 'Common') { pf = " AND expense_type='Common_50_50'"; }
```

## Common query patterns

### Monthly totals (excl. CC + Settlement)
```js
db.prepare(`SELECT month, COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt
  FROM transactions WHERE 1=1${CC_EXCLUDE}${pf}
  GROUP BY month ORDER BY ${MONTH_SORT}`).all(...pfParams)
```

### Per-month per-category breakdown
```js
db.prepare(`SELECT month, category, COALESCE(SUM(amount),0) AS total
  FROM transactions WHERE category != '' AND category IS NOT NULL${CC_EXCLUDE}${pf}
  GROUP BY month, category ORDER BY ${MONTH_SORT}`).all(...pfParams)
```

### Salary upsert (UNIQUE(person, month))
```js
db.prepare(`INSERT INTO salaries (person, month, amount, notes) VALUES (?, ?, ?, ?)
  ON CONFLICT(person, month) DO UPDATE SET amount = excluded.amount, notes = excluded.notes
`).run(person, month, amount, notes)
```

### Transaction audit (called in PUT/DELETE handlers)
```js
db.prepare(`INSERT INTO transaction_audit (tx_id, action, snapshot)
  VALUES (?, ?, ?)`).run(id, 'UPDATE', JSON.stringify(oldRow))
```

## Rules
- NEVER `ORDER BY month` — always use `${MONTH_SORT}`
- ALWAYS apply `CC_EXCLUDE` to any query that aggregates spend
- Use `COALESCE(SUM(amount), 0)` to avoid null totals
- Parameterize all user input — never string-interpolate request values
