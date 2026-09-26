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

test('current values retain paise precision and gains follow edits, owner changes, and deletion', () => {
  const service = require('../investment-service').createInvestmentService(db);
  const p = service.add({ name: 'Fund', person: 'Pooja', amount: 100.10, currentValue: 120.25 });
  const k = service.add({ name: 'Loss', person: 'Kunal', amount: 50.05, currentValue: 0 });
  try {
    assert.equal(p.currentValue, 120.25);
    assert.equal(p.gain, 20.15);
    assert.equal(k.gain, -50.05);
    assert.deepEqual(service.list().valuations.combined, { currentValue: 120.25, gain: -29.90, missing: 0 });
    service.update(p.id, { name: 'Moved', person: 'Kunal', amount: 110.10 });
    assert.equal(service.list().entries.find(x => x.id === p.id).currentValue, 120.25, 'old clients preserve current value');
    assert.deepEqual(service.list().valuations.Pooja, { currentValue: 0, gain: 0, missing: 0 });
    assert.deepEqual(service.list().valuations.Kunal, { currentValue: 120.25, gain: -39.90, missing: 0 });
    service.remove(k.id);
    assert.equal(service.list().valuations.combined.gain, 10.15);
  } finally {
    db.prepare('DELETE FROM investments').run();
  }
});

test('missing current values are unknown, explicit null clears a value, and malformed values are rejected', () => {
  const service = require('../investment-service').createInvestmentService(db);
  const input = { name: 'Fund', person: 'Pooja', amount: 100 };
  const p = service.add(input);
  try {
    assert.equal(p.currentValue, null);
    assert.equal(p.gain, null);
    assert.deepEqual(service.list().valuations.combined, { currentValue: null, gain: null, missing: 1 });
    for (const currentValue of [-1, '', '10', true, Infinity, NaN, 1.001, 1e15]) {
      assert.throws(() => service.update(p.id, { ...input, currentValue }), { code: 'validation' });
    }
    service.update(p.id, { ...input, currentValue: 100 });
    assert.equal(service.list().valuations.Pooja.gain, 0);
    service.update(p.id, { ...input, currentValue: null });
    assert.equal(service.list().valuations.Pooja.currentValue, null);
  } finally {
    service.remove(p.id);
  }
});

test('existing databases migrate safely without inventing values or changing contributions', () => {
  const { execFileSync } = require('node:child_process');
  const legacyPath = path.join(folder, 'legacy.db');
  const Database = require('better-sqlite3');
  const legacy = new Database(legacyPath);
  legacy.exec("CREATE TABLE investments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, person TEXT, amount_paise INTEGER, created_at TEXT); INSERT INTO investments (name,person,amount_paise) VALUES ('Legacy','Pooja',12345)");
  legacy.close();
  const script = `const db=require('./db'); const row=db.prepare('SELECT amount_paise,current_value_paise FROM investments').get(); console.log(JSON.stringify(row)); db.close();`;
  for (let i = 0; i < 2; i++) {
    const output = execFileSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), env: { ...process.env, DB_PATH: legacyPath }, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output), { amount_paise: 12345, current_value_paise: null });
  }
});

test('simultaneous startup safely applies the current-value migration once', async () => {
  const { execFile, execFileSync } = require('node:child_process');
  const { promisify } = require('node:util');
  const sharedPath = path.join(folder, 'concurrent.db');
  const options = { cwd: path.join(__dirname, '..'), env: { ...process.env, DB_PATH: sharedPath }, encoding: 'utf8' };
  execFileSync(process.execPath, ['-e', "require('./db').close()"], options);
  const setup = new (require('better-sqlite3'))(sharedPath);
  setup.exec("ALTER TABLE investments DROP COLUMN current_value_paise; DELETE FROM schema_migrations WHERE version='2026-09-26-investment-current-value-v1'");
  setup.close();
  const script = `const db=require('./db'); console.log(db.pragma('table_info(investments)').filter(row => row.name === 'current_value_paise').length); db.close();`;
  const results = await Promise.all(Array.from({ length: 8 }, () => promisify(execFile)(process.execPath, ['-e', script], options)));
  for (const result of results) assert.equal(result.stdout.trim(), '1');
});
