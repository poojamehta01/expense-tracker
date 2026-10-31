// --require loads this in each node:test worker, before any module imports db.js.
// Each process owns its database; neither .env nor a caller's DB_PATH can point tests at real data.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'expense-tracker-test-'));
process.env.DB_PATH = path.join(directory, 'test.db');
Object.assign(process.env, {
  NODE_ENV: 'test', MCP_ENABLED: 'false', BASE_URL: 'http://127.0.0.1:3000',
  GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GEMINI_API_KEY: 'test-key',
  SESSION_SECRET: 'test-session-secret-of-at-least-32-characters', ALLOWED_EMAILS: 'pooja@example.com,kunal@example.com',
});
process.on('exit', () => fs.rmSync(directory, { recursive: true, force: true }));
