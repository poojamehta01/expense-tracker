---
name: new-table-section
description: Add a new table section to the Trends tab using existing boilerplate
triggers: ["new table", "add table", "new section in trends", "add section to trends"]
---

HTML in `public/index.html` inside `#tab-trends`:
```html
<div class="table-section" id="trends{Name}Section" style="display:none">
  <div class="table-header-row">
    <h2>{Title}</h2>
    <span class="table-note">{optional note}</span>
  </div>
  <div class="table-wrapper">
    <table id="trends{Name}Table">
      <thead id="trends{Name}Head"></thead>
      <tbody id="trends{Name}Body"></tbody>
      <tfoot id="trends{Name}Foot"></tfoot>
    </table>
  </div>
</div>
```

JS in `public/app.js`, called from `loadTrends()`:
```js
function render{Name}Table(data) {
  // build thead with month columns
  // build tbody rows
  // build tfoot totals row
  document.getElementById('trends{Name}Section').style.display = '';
}
```

CSS: `table-section`, `table-wrapper`, `table` already styled. Add `body.dark` override only if new colors introduced.

Data: add new field to `/api/trends` response if needed (follow MONTH_SORT + CC_EXCLUDE rules).

Table to add: $ARGUMENTS
