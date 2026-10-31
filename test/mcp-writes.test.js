const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, lists } = require('./helpers/mcp-fixture');
const { createMcpFinance } = require('../mcp/finance');
const { createFinanceService } = require('../finance-service');
const actor = { email: 'pooja@example.com', clientId: 'chat-client' };
const input = { date: '2026-10-02', amount: 40.10, description: 'Lunch', paid_by: 'Pooja', expense_type: 'Pooja_Personal', payment_method: 'Cash', category: 'Outside Food', idempotencyKey: 'add-lunch-1' };
let f, finance, now;
test.beforeEach(() => { f = fixture(); now = new Date('2026-10-31T00:00:00Z'); finance = createMcpFinance({ db: f.db, lists, now: () => now }); });
test.afterEach(() => f.close());

test('add persists once, returns normalization, and journals the authenticated actor', () => {
  const result = finance.add({ ...input, payment_method: 'SBI_Debit_Card' }, actor);
  assert.equal(result.transaction.date, '2026-10-02'); assert.equal(result.transaction.amount, 40.10);
  assert.equal(result.transaction.paid_by, 'Household Pool');
  assert.equal(result.transaction.expense_type, 'Common_50_50');
  assert.ok(result.normalizedFields.includes('paid_by'));
  assert.deepEqual(finance.add({ ...input, payment_method: 'SBI_Debit_Card' }, actor), result);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM transactions').get().n, 1);
  const audit = f.db.prepare('SELECT * FROM mcp_write_audit').get();
  assert.equal(audit.actor_email, actor.email); assert.equal(audit.client_id, actor.clientId);
  assert.equal(audit.operation, 'add_expense');
  assert.equal(JSON.parse(audit.after_snapshot).id, result.transaction.id);
});

test('duplicate detection and replay keys protect retries across clients', () => {
  const result = finance.add(input, actor);
  const duplicate = finance.add({ ...input, idempotencyKey: 'another-key' }, { ...actor, clientId: 'other-client' });
  assert.equal(duplicate.duplicate, true); assert.equal(duplicate.transaction.id, result.transaction.id);
  assert.throws(() => finance.add({ ...input, amount: 41 }, actor), { code: 'conflict' });
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM transactions').get().n, 1);
});

test('updates preserve omitted fields, audit the old row, and replay before checking revision', () => {
  const original = finance.add(input, actor).transaction;
  const change = { id: original.id, revision: original.revision, idempotencyKey: 'edit-lunch-1', patch: { amount: 50.25 } };
  const result = finance.update(change, actor);
  assert.equal(result.transaction.amount, 50.25); assert.equal(result.transaction.description, 'Lunch');
  assert.equal(JSON.parse(f.db.prepare('SELECT snapshot FROM transaction_audit').get().snapshot).amount, 40.10);
  createFinanceService(f.db).updateTransaction(original.id, { remarks: 'website edit' });
  assert.deepEqual(finance.update(change, actor), result);
  assert.throws(() => finance.update({ ...change, idempotencyKey: 'stale-key' }, actor), { code: 'conflict' });
  assert.equal(finance.transaction({ id: original.id }).transaction.remarks, 'website edit');
});

test('invalid money, dates, enums, unknown keys and unauthenticated actors never mutate records', () => {
  for (const patch of [{ amount: 1.001 }, { amount: Infinity }, { amount: 0 }, { amount: '1' }, { amount: 1e13 }, { date: '2026-02-29' }, { category: 'invented' }, { paid_by: 'Unknown' }, { expense_type: 'Unknown' }, { payment_method: 'Unknown' }, { description: '' }, { extra: 1 }, { idempotencyKey: '' }]) {
    assert.throws(() => finance.add({ ...input, ...patch }, actor), { code: 'validation' });
  }
  assert.throws(() => finance.add(input, {}), { code: 'forbidden' });
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM transactions').get().n, 0);
  const original = finance.add(input, actor).transaction;
  for (const patch of [{}, { amount: -1 }, { id: 1 }]) assert.throws(() => finance.update({ id: original.id, revision: original.revision, idempotencyKey: 'bad-edit', patch }, actor), { code: 'validation' });
  assert.equal(finance.transaction({ id: original.id }).transaction.amount, 40.10);
});

test('failed journal insertion rolls back the transaction and its idempotency result', () => {
  // Removing atomicity would leave a financial row after this deliberately failed audit insert.
  finance.add({ ...input, idempotencyKey: 'seed' }, actor);
  f.db.exec("CREATE TRIGGER reject_mcp_audit BEFORE INSERT ON mcp_write_audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
  assert.throws(() => finance.add({ ...input, description: 'Different', idempotencyKey: 'fail' }, actor), /audit unavailable/);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM transactions').get().n, 1);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mcp_idempotency').get().n, 1);
});

test('retry records expire after the documented 30 day window', () => {
  finance.add(input, actor);
  now = new Date('2026-12-01T00:00:00Z');
  finance.add({ ...input, description: 'New month', idempotencyKey: 'new-month' }, actor);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mcp_idempotency').get().n, 1);
});

test('partial edits retain historical months for malformed and ISO legacy dates', () => {
  for (const [index, date] of ['bad', '2024-02-29'].entries()) {
    const id = finance.add({ ...input, description: `Legacy ${index}`, amount: 50, idempotencyKey: `legacy-${index}` }, actor).transaction.id;
    f.db.prepare('UPDATE transactions SET date=?,month=? WHERE id=?').run(date, 'February_2024', id);
    const original = finance.transaction({ id }).transaction;
    const updated = finance.update({ id, revision: original.revision, idempotencyKey: `note-${index}`, patch: { remarks: 'Reviewed' } }, actor);
    assert.equal(updated.transaction.month, 'February_2024');
    assert.equal(updated.transaction.originalDate, date);
    assert.equal(finance.summary({ month: 'February_2024' }).totalSpend, 50);
    assert.equal(finance.summary({ month: 'October_2026' }).totalSpend, 0);
    const moved = finance.update({ id, revision: updated.transaction.revision, idempotencyKey: `move-${index}`, patch: { date: '2024-03-01' } }, actor);
    assert.equal(moved.transaction.month, 'March_2024');
    assert.equal(finance.summary({ month: 'February_2024' }).totalSpend, 0);
  }
});
