function createKunalOwesPoojaService(db) {
  function fail(message, code = 'validation') {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function validate(input) {
    const date = typeof input?.date === 'string' ? input.date.trim() : '';
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : null;
    if (!parsedDate || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== date) {
      fail('Choose a valid expense date.');
    }

    const description = typeof input?.description === 'string' ? input.description.trim() : '';
    if (!description || description.length > 300) fail('Enter a description (up to 300 characters).');

    const amount = input?.amount;
    const amountPaise = Math.round(amount * 100);
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 ||
        amount > 1000000000000 || amount !== amountPaise / 100) {
      fail('Enter a positive amount with at most two decimal places (maximum ₹1 lakh crore).');
    }
    return { date, description, amount_paise: amountPaise };
  }

  function requireId(value) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) fail('Invalid expense ID.');
    return id;
  }

  const entry = row => ({
    id: row.id,
    date: row.expense_date,
    description: row.description,
    amount: row.amount_paise / 100,
    status: row.status,
    settledAt: row.settled_at,
  });

  function get(id) {
    const row = db.prepare('SELECT * FROM kunal_owes_pooja_expenses WHERE id = ?').get(id);
    if (!row) fail('Expense not found. Refresh and try again.', 'not_found');
    return entry(row);
  }

  return {
    list() {
      const rows = db.prepare(`
        SELECT * FROM kunal_owes_pooja_expenses
        ORDER BY expense_date, id
      `).all();
      const totals = db.prepare(`
        SELECT COALESCE(SUM(amount_paise), 0) AS total_paise,
               COUNT(*) AS pending_count
        FROM kunal_owes_pooja_expenses
        WHERE status = 'pending'
      `).get();
      return {
        entries: rows.map(entry),
        totalPending: totals.total_paise / 100,
        pendingCount: totals.pending_count,
      };
    },

    add(input) {
      const value = validate(input);
      const result = db.prepare(`
        INSERT INTO kunal_owes_pooja_expenses (expense_date, description, amount_paise)
        VALUES (@date, @description, @amount_paise)
      `).run(value);
      return get(result.lastInsertRowid);
    },

    update(value, input) {
      const id = requireId(value);
      const data = validate(input);
      get(id);
      db.prepare(`
        UPDATE kunal_owes_pooja_expenses
        SET expense_date = @date, description = @description, amount_paise = @amount_paise
        WHERE id = @id
      `).run({ ...data, id });
      return get(id);
    },

    setStatus(value, status) {
      const id = requireId(value);
      if (!['pending', 'settled'].includes(status)) fail('Choose pending or settled.');
      get(id);
      db.prepare(`
        UPDATE kunal_owes_pooja_expenses
        SET status = ?, settled_at = CASE WHEN ? = 'settled' THEN datetime('now') ELSE NULL END
        WHERE id = ?
      `).run(status, status, id);
      return get(id);
    },

    remove(value) {
      const id = requireId(value);
      get(id);
      db.prepare('DELETE FROM kunal_owes_pooja_expenses WHERE id = ?').run(id);
      return { deleted: true };
    },
  };
}

function registerKunalOwesPoojaRoutes(app, service) {
  function handle(res, operation, successStatus = 200) {
    try {
      operation();
      return res.status(successStatus).json(service.list());
    } catch (error) {
      const status = error.code === 'validation' ? 400 : error.code === 'not_found' ? 404 : 500;
      if (status === 500) console.error('Kunal owes Pooja request failed:', error);
      return res.status(status).json({ error: status === 500 ? 'Could not load or save pending expenses. Please try again.' : error.message });
    }
  }

  app.get('/api/kunal-owes-pooja', (req, res) => handle(res, () => {}));
  app.post('/api/kunal-owes-pooja', (req, res) => handle(res, () => service.add(req.body), 201));
  app.put('/api/kunal-owes-pooja/:id', (req, res) => handle(res, () => service.update(req.params.id, req.body)));
  app.patch('/api/kunal-owes-pooja/:id/status', (req, res) => handle(res, () => service.setStatus(req.params.id, req.body?.status)));
  app.delete('/api/kunal-owes-pooja/:id', (req, res) => handle(res, () => service.remove(req.params.id)));
}

module.exports = { createKunalOwesPoojaService, registerKunalOwesPoojaRoutes };
