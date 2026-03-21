Run the server and verify it starts cleanly:

```bash
node --check server.js && node -e "require('./db'); console.log('DB OK')" && echo "Ready to ship"
```

Then confirm with the user before starting the server with `node server.js`.
