const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-mcp-'));
  const previous = process.env.DB_PATH;
  process.env.DB_PATH = path.join(directory, 'test.db');
  delete require.cache[require.resolve('../../db')];
  const db = require('../../db');
  delete require.cache[require.resolve('../../db')];
  if (previous === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = previous;
  return { db, directory, close() { db.close(); fs.rmSync(directory, { recursive: true, force: true }); } };
}
const lists = {
  categories: ['Outside Food', 'Rent', 'Investment', 'Refunded', 'Settlement', 'Credit Card Payment'],
  expense_types: ['Pooja_Personal', 'Kunal_Personal', 'Common_50_50', 'Pooja_for_Kunal', 'Kunal_for_Pooja'],
  payment_methods: ['Cash', 'SBI_Debit_Card'],
};
function row(overrides = {}) {
  return { date: '2 October 2026', amount: 40, description: 'Lunch', paid_by: 'Pooja',
    expense_type: 'Pooja_Personal', payment_method: 'Cash', category: 'Outside Food', ...overrides };
}
module.exports = { fixture, lists, row };
