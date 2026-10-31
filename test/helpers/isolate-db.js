// --require loads this in each node:test worker, before any module imports db.js.
// Each process owns its database; neither .env nor a caller's DB_PATH can point tests at real data.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'expense-tracker-test-'));
process.env.DB_PATH = path.join(directory, 'test.db');
process.on('exit', () => fs.rmSync(directory, { recursive: true, force: true }));
