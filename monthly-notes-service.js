function createMonthlyNotesService(db) {
  const validMonth = /^(January|February|March|April|May|June|July|August|September|October|November|December)_\d{4}$/;
  const fail = (message, code = 'validation') => {
    const error = new Error(message);
    error.code = code;
    throw error;
  };
  const requireMonth = month => {
    if (!validMonth.test(month || '')) fail('Month must use Month_YYYY');
  };
  const insert = db.prepare(`
    INSERT INTO monthly_notes (month, author, body)
    VALUES (@month, @author, @body)
  `);
  const list = db.prepare(`
    SELECT id, month, author, body, created_at
    FROM monthly_notes
    WHERE month = ?
    ORDER BY id
  `);

  return {
    addNote(note) {
      requireMonth(note?.month);
      if (!['Pooja', 'Kunal'].includes(note?.author)) fail('Author must be Pooja or Kunal');
      const body = typeof note?.body === 'string' ? note.body.trim() : '';
      if (!body) fail('Note cannot be empty');
      if (body.length > 1000) fail('Note must be 1000 characters or fewer');
      const result = insert.run({ ...note, body });
      return db.prepare(`
        SELECT id, month, author, body, created_at
        FROM monthly_notes
        WHERE id = ?
      `).get(result.lastInsertRowid);
    },
    listNotes({ month }) {
      requireMonth(month);
      return list.all(month);
    },
    deleteNote({ id, month, author }) {
      requireMonth(month);
      const note = db.prepare('SELECT author FROM monthly_notes WHERE id = ? AND month = ?').get(id, month);
      if (!note) fail('Note not found', 'not_found');
      if (note.author !== author) fail('Only the author can delete this note', 'forbidden');
      db.prepare('DELETE FROM monthly_notes WHERE id = ?').run(id);
      return { deleted: true };
    },
  };
}

module.exports = { createMonthlyNotesService };
