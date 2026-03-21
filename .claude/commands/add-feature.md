---
name: add-feature
description: Implement a new feature following all project rules without reading source files
triggers: ["add", "build", "create", "implement", "i want", "can we add", "lets add", "new feature"]
---

Before writing any code, load context from CLAUDE.md (already in context). Do NOT read source files.

**Which files to change** — typically a subset of:
- `server.js` — new API route or query
- `public/index.html` — new HTML structure
- `public/app.js` — new JS function
- `public/style.css` — new styles

**Non-negotiable rules:**
- Exclude CC + Settlement from totals: use `CC_EXCLUDE` constant
- Month sort in SQL: always `MONTH_SORT`, never `ORDER BY month`
- Dark mode: add `body.dark` override for every new background/border/color
- Reuse existing CSS classes before adding new ones
- No build step — vanilla JS/HTML/CSS only

**After implementing**, run `/update-docs` to keep CLAUDE.md + features.md current.

Feature to implement: $ARGUMENTS
