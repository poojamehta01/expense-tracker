Commit all pending changes and deploy to Fly.io.

**Step 1 — check what's changed:**
```bash
git diff --stat && git status
```

**Step 2 — stage and commit:**
Stage only the relevant source files (never .env or secrets). Write a concise commit message describing what changed. Use:
```bash
git add -p   # or specific files
git commit -m "..."
```

**Step 3 — deploy:**
```bash
fly deploy 2>&1
```

After deploy succeeds, remind the user to hard refresh (**Cmd+Shift+R**) to see latest changes.
