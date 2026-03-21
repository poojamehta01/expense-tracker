---
name: new-kpi-card
description: Add a new KPI card row to the Dashboard tab using existing colour palette
triggers: ["new kpi", "add kpi", "new card on dashboard", "add card to dashboard"]
---

HTML after existing `#kpiGrid` in `public/index.html`:
```html
<div class="kpi-grid kpi-{name}-grid" id="kpi{Name}Grid" style="display:none">
  <div class="kpi-card kpi-{name}-{variant}">
    <div class="kpi-label">{Label}</div>
    <div class="kpi-value" id="kpi{Name}{Variant}">—</div>
  </div>
</div>
```

CSS in `public/style.css` (nth-child only works inside #kpiGrid — use explicit classes):
```css
.kpi-{name}-grid { grid-template-columns: repeat(N, 1fr); }
.kpi-{name}-{variant} { border-left-color: #hex !important; background: linear-gradient(135deg, #fff 60%, #tint) !important; }
.kpi-{name}-{variant} .kpi-label { color: #hex !important; }
body.dark .kpi-{name}-{variant} { background: #1e293b !important; }
```

Available colours:
- Purple `#7c3aed` / `#f5f3ff` — Pooja
- Blue `#2563eb` / `#eff6ff` — Kunal / primary
- Teal `#0891b2` / `#ecfeff` — combined / neutral
- Green `#16a34a` / `#f0fdf4` — positive / savings

JS: add `renderXxxKPIs(data)` function, call it from `loadDashboard()` which already fetches in parallel.

Card to add: $ARGUMENTS
