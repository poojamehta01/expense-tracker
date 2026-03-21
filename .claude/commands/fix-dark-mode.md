---
name: fix-dark-mode
description: Fix white/light backgrounds or wrong colors showing in dark mode
triggers: ["dark mode", "white background", "dark mode fix", "remove white", "looks bad in dark", "dark mode issue"]
---

Dark mode is `body.dark` class. Fix by adding overrides in `public/style.css`.

**Color values to use:**
- Card/surface bg: `#1e293b`
- Deep bg (inputs): `#0f172a`
- Hover bg: `#273548`
- Border: `#334155`
- Muted text: `#94a3b8`

**Common fix patterns:**
```css
body.dark .classname { background: #1e293b; }
body.dark .classname { border-color: #334155; }
body.dark .classname:hover { background: #273548; }
/* KPI cards with !important to override gradient */
body.dark .kpi-foo { background: #1e293b !important; }
/* Inputs */
body.dark input, body.dark select { background: #0f172a; border-color: #334155; color: #f1f5f9; }
```

Element to fix: $ARGUMENTS
