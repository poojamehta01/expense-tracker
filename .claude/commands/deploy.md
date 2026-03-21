---
name: deploy
description: Deploy the app to Fly.io and remind user to hard refresh
triggers: ["lets push", "deploy", "push it", "ship it", "push to fly", "push changes"]
---

Run:
```bash
fly deploy 2>&1
```

After success, remind the user to hard refresh with **Cmd+Shift+R** to bypass cache.
