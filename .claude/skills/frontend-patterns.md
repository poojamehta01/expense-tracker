# Frontend Patterns — Expense Tracker

## Tab switching
```js
switchTab('dashboard' | 'add' | 'trends' | 'salary' | 'ask')
// Triggers: loadTrends() on first trends visit, initSalaryTab() on salary
// trendsLoaded gate: reset to false on save/bulk edit/filter change
// _salaryInited gate: reset to false after saveSalary()
```

## Global state to know about
```js
globalPersonFilter   // 'all' | 'Pooja' | 'Kunal' | 'Common'
trendsLoaded         // bool
_catBreakdownData    // { categories, byMonth, totals, months }
_catSortCol          // default 'total'
_catSortDir          // default 'desc'
_salaryInited        // bool
```

## Fetching pattern (parallel)
```js
const [aRes, bRes] = await Promise.all([fetch('/api/a'), fetch('/api/b')]);
const aData = await aRes.json();
const bData = await bRes.json();
```

## Currency formatting
```js
formatCurrency(n)   // → "₹12,450"
esc(str)            // HTML escape — always use for user data in innerHTML
```

## Show/hide sections
```js
document.getElementById('someSectionId').style.display = '';      // show
document.getElementById('someSectionId').style.display = 'none';  // hide
el.classList.add('hidden') / el.classList.remove('hidden')         // alt
```

## Rendering a table (standard pattern)
```js
function renderXxxTable(data) {
  const tbody = document.getElementById('xxxBody');
  tbody.innerHTML = data.rows.map(r => `<tr>
    <td>${esc(r.field)}</td>
    <td>${r.amount ? formatCurrency(r.amount) : '—'}</td>
  </tr>`).join('');
  document.getElementById('xxxSection').style.display = '';
}
```

## Chip combo (enum inline edit)
```js
makeChipCombo(options, currentValue, rowIndex, fieldName)
// Used for: category, payment_method, expense_type, paid_by, mood, impulse
```

## Inline edit (saved transactions list)
```js
startEdit(td, txId, fieldName, currentValue)
// Handles: date (date picker), all enums (chip combo), text (input)
// Calls PUT /api/transactions/:id on confirm
```

## Date helpers
```js
appDateToISO('20 March 2026')   // → '2026-03-20'
isoToAppDate('2026-03-20')      // → '20 March 2026'
```

## Destroying Chart.js charts before re-render
```js
if (chartCategory) chartCategory.destroy();
chartCategory = new Chart(document.getElementById('chartCategory'), { ... });
```

## Savings colour classes (reusable)
```js
const savClass = v => v >= 0 ? 'savings-positive' : 'savings-negative';
el.className = 'salary-kpi-value ' + savClass(value);
// CSS: savings-positive → #16a34a, savings-negative → #dc2626
```
