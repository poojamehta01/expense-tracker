const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { createMonthlyNotesService } = require('../monthly-notes-service');

function createFixture() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE monthly_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return db;
}

test('notes from both authors are shared within their month only', () => {
  const db = createFixture();
  const service = createMonthlyNotesService(db);

  service.addNote({ month: 'September_2026', author: 'Pooja', body: 'ICICI entered through 12 Sep' });
  service.addNote({ month: 'September_2026', author: 'Kunal', body: 'Amazon card is complete' });
  service.addNote({ month: 'October_2026', author: 'Pooja', body: 'October note' });

  const notes = service.listNotes({ month: 'September_2026' });
  assert.deepEqual(notes.map(note => ({ author: note.author, body: note.body })), [
    { author: 'Pooja', body: 'ICICI entered through 12 Sep' },
    { author: 'Kunal', body: 'Amazon card is complete' },
  ]);
});

test('adding a note trims its body and rejects invalid input', () => {
  const db = createFixture();
  const service = createMonthlyNotesService(db);

  const note = service.addNote({ month: 'September_2026', author: 'Pooja', body: '  Statement checked  ' });
  assert.equal(note.body, 'Statement checked');
  assert.throws(
    () => service.addNote({ month: 'September_2026', author: 'Pooja', body: '   ' }),
    error => error.code === 'validation'
  );
  assert.throws(
    () => service.listNotes({ month: '2026-09' }),
    error => error.code === 'validation'
  );
});

test('only the note author can delete an entry', () => {
  const db = createFixture();
  const service = createMonthlyNotesService(db);
  const note = service.addNote({ month: 'September_2026', author: 'Pooja', body: 'Temporary note' });

  assert.throws(
    () => service.deleteNote({ id: note.id, month: 'September_2026', author: 'Kunal' }),
    error => error.code === 'forbidden'
  );
  assert.throws(
    () => service.deleteNote({ id: note.id, month: 'October_2026', author: 'Pooja' }),
    error => error.code === 'not_found'
  );
  assert.deepEqual(service.deleteNote({ id: note.id, month: 'September_2026', author: 'Pooja' }), { deleted: true });
  assert.deepEqual(service.listNotes({ month: 'September_2026' }), []);
});
