# CSS Tokens & Patterns — Expense Tracker

## Custom properties (light mode defaults)
```css
--bg:           #f1f5f9
--white:        #ffffff
--border:       #e2e8f0
--text:         #0f172a
--text-muted:   #64748b
--primary:      #2563eb
--success:      #16a34a
--danger:       #dc2626
--shadow:       0 1px 3px rgba(0,0,0,0.07)
```

## Dark mode overrides (body.dark)
```css
--bg:     #0f172a
--white:  #1e293b
--border: #334155
--text:   #f1f5f9
```

## Dark mode hardcoded values (use when --var isn't enough)
| Purpose | Value |
|---|---|
| Card/surface bg | `#1e293b` |
| Deep bg (inputs) | `#0f172a` |
| Hover bg | `#273548` |
| Border | `#334155` |
| Muted text | `#94a3b8` |
| Body text | `#cbd5e1` |

## KPI card colours (nth-child applies only inside #kpiGrid)
| Slot | Border | Tint bg | Label colour |
|---|---|---|---|
| 1 — Total Spend | `#2563eb` | `#eff6ff` | `#2563eb` |
| 2 — Transactions | `#7c3aed` | `#f5f3ff` | `#7c3aed` |
| 3 — Pooja vs Kunal | `#0891b2` | `#ecfeff` | `#0891b2` |
| 4 — Settlement | `#16a34a` | `#f0fdf4` | `#16a34a` |

For **new KPI rows** outside `#kpiGrid`, use explicit classes (nth-child won't work):
```css
.kpi-foo { border-left-color: #hex !important; background: linear-gradient(135deg, #fff 60%, #tint) !important; }
.kpi-foo .kpi-label { color: #hex !important; }
body.dark .kpi-foo { background: #1e293b !important; }
```

## Reusable component classes
```
.btn-primary          blue filled button
.btn-primary.small    padding: 6px 12px; font-size: 12px
.btn-secondary        outlined button
.btn-danger           red button
.table-section        white card with border-radius, used for all table containers
.table-wrapper        overflow container (add max-height + overflow-y for scrollable)
.table-header-row     flex row: title on left, actions on right
.table-note           small italic muted label
.section-header       collapsible bar (TRENDS, TOP MERCHANTS)
.section-title        uppercase 12px label inside section-header
.section-toggle-icon  ▲/▼ icon
.toolbar-right        flex group for right-aligned toolbar buttons
.cat-search-input     search box (used in Spend by Category)
.kpi-grid             4-col responsive grid for KPI cards
.charts-grid          2-col responsive grid for chart cards
.chip-neutral         grey chip badge
```

## Dark mode checklist — when adding new UI
- [ ] New card/surface: `body.dark .classname { background: #1e293b; }`
- [ ] New border: `body.dark .classname { border-color: #334155; }`
- [ ] New input/select: background `#0f172a`, border `#334155`, color `#f1f5f9`
- [ ] Hover state: `body.dark .classname:hover { background: #273548; }`
- [ ] KPI gradient: `body.dark .kpi-foo { background: #1e293b !important; }`

## Mobile breakpoints
```css
@media (max-width: 900px)  /* kpi-grid: 2 col */
@media (max-width: 640px)  /* single col, reduced padding, smaller fonts */
```
