const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'investments-test-'));
process.env.DB_PATH = path.join(folder, 'test.db');
const db = require('../db');
test.after(() => { db.close(); fs.rmSync(folder, { recursive: true, force: true }); });

// Removing persistence, validation, or update/delete handling must break these checks.
test('investment register persists entries, computes separate totals, and supports corrections', () => {
  const { createInvestmentService } = require('../investment-service');
  const service = createInvestmentService(db);
  assert.deepEqual(service.list().totals, { Pooja: 0, Kunal: 0, combined: 0 });
  const pooja = service.add({ name: '  Mutual funds  ', person: 'Pooja', amount: 125000.25 });
  const kunal = service.add({ name: 'Fixed deposit', person: 'Kunal', amount: 200000 });
  assert.equal(pooja.name, 'Mutual funds');
  const reopened = createInvestmentService(db);
  assert.equal(reopened.list().entries.length, 2);
  assert.deepEqual(reopened.list().totals, { Pooja: 125000.25, Kunal: 200000, combined: 325000.25 });
  service.update(pooja.id, { name: 'Updated fund', person: 'Kunal', amount: 50.10 });
  assert.deepEqual(service.list().totals, { Pooja: 0, Kunal: 200050.10, combined: 200050.10 });
  service.remove(kunal.id);
  assert.deepEqual(service.list().entries.map(x => x.name), ['Updated fund']);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM transactions').get().n, 0);
  service.remove(pooja.id);
});

test('investment register rejects malformed amounts and entries without changing stored data', () => {
  const { createInvestmentService } = require('../investment-service');
  const service = createInvestmentService(db);
  const valid = { name: 'Fund', person: 'Pooja', amount: 10 };
  for (const amount of [0, -1, null, '', '10', true, Infinity, NaN, 1.001, 1.000001, 1e15]) {
    assert.throws(() => service.add({ ...valid, amount }), { code: 'validation' });
  }
  for (const patch of [{ name: ' ' }, { name: 'x'.repeat(201) }, { person: 'Common' }]) {
    assert.throws(() => service.add({ ...valid, ...patch }), { code: 'validation' });
  }
  assert.throws(() => service.update(999, valid), { code: 'not_found' });
  assert.throws(() => service.remove(999), { code: 'not_found' });
  assert.throws(() => service.remove('1 OR 1=1'), { code: 'validation' });
  assert.equal(service.list().entries.length, 0);
});
