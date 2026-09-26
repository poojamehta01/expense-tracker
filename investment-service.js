function createInvestmentService(db) {
  function fail(message, code = 'validation') {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
  function validate(input) {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 200) fail('Enter an investment name (up to 200 characters).');
    if (!['Pooja', 'Kunal'].includes(input?.person)) fail('Choose Pooja or Kunal.');
    const amount = input?.amount;
    const paise = Math.round(amount * 100);
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 ||
        amount > 1000000000000 || amount !== paise / 100) {
      fail('Enter a positive amount with at most two decimal places (maximum ₹1 lakh crore).');
    }
    const currentValue = input.currentValue;
    const currentPaise = currentValue == null ? null : Math.round(currentValue * 100);
    if (currentValue != null && (typeof currentValue !== 'number' || !Number.isFinite(currentValue) ||
        currentValue < 0 || currentValue > 1000000000000 || currentValue !== currentPaise / 100)) {
      fail('Current value must be zero or more, with at most two decimal places (maximum ₹1 lakh crore).');
    }
    return { name, person: input.person, amount_paise: paise, current_value_paise: currentPaise };
  }
  function requireId(value) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) fail('Invalid investment ID.');
    return id;
  }
  const entry = row => ({ id: row.id, name: row.name, person: row.person, amount: row.amount_paise / 100,
    currentValue: row.current_value_paise == null ? null : row.current_value_paise / 100,
    gain: row.current_value_paise == null ? null : (row.current_value_paise - row.amount_paise) / 100,
  });
  function get(id) {
    const row = db.prepare('SELECT * FROM investments WHERE id = ?').get(id);
    if (!row) fail('Investment not found. Refresh and try again.', 'not_found');
    return entry(row);
  }
  return {
    list() {
      const rows = db.prepare('SELECT * FROM investments ORDER BY id DESC').all();
      const sums = { Pooja: 0, Kunal: 0 };
      for (const row of rows) sums[row.person] += row.amount_paise;
      const valuations = {};
      for (const person of ['Pooja', 'Kunal', 'combined']) {
        const owned = rows.filter(row => person === 'combined' || row.person === person);
        const missing = owned.filter(row => row.current_value_paise == null).length;
        valuations[person] = {
          currentValue: missing ? null : owned.reduce((sum, row) => sum + row.current_value_paise, 0) / 100,
          gain: missing ? null : owned.reduce((sum, row) => sum + row.current_value_paise - row.amount_paise, 0) / 100,
          missing,
        };
      }
      return { entries: rows.map(entry), valuations, totals: { Pooja: sums.Pooja / 100, Kunal: sums.Kunal / 100, combined: (sums.Pooja + sums.Kunal) / 100 } };
    },
    add(input) {
      const value = validate(input);
      const result = db.prepare('INSERT INTO investments (name, person, amount_paise, current_value_paise) VALUES (@name, @person, @amount_paise, @current_value_paise)').run(value);
      return get(result.lastInsertRowid);
    },
    update(value, input) {
      const id = requireId(value);
      const data = validate(input);
      const existing = get(id);
      // An older open tab can still submit the original form without this field.
      if (input.currentValue === undefined) data.current_value_paise = existing.currentValue == null ? null : Math.round(existing.currentValue * 100);
      db.prepare('UPDATE investments SET name = @name, person = @person, amount_paise = @amount_paise, current_value_paise = @current_value_paise WHERE id = @id').run({ ...data, id });
      return get(id);
    },
    remove(value) {
      const id = requireId(value);
      get(id);
      db.prepare('DELETE FROM investments WHERE id = ?').run(id);
      return { deleted: true };
    },
  };
}

function registerInvestmentRoutes(app, service) {
  function handle(res, operation, status = 200) {
    try {
      operation();
      res.status(status).json(service.list());
    } catch (error) {
      const status = error.code === 'validation' ? 400 : error.code === 'not_found' ? 404 : 500;
      if (status === 500) console.error('Investment request failed:', error);
      res.status(status).json({ error: status === 500 ? 'Could not save or load investments. Please try again.' : error.message });
    }
  }
  app.get('/api/investments', (req, res) => handle(res, () => {}));
  app.post('/api/investments', (req, res) => handle(res, () => service.add(req.body), 201));
  app.put('/api/investments/:id', (req, res) => handle(res, () => service.update(req.params.id, req.body)));
  app.delete('/api/investments/:id', (req, res) => handle(res, () => service.remove(req.params.id)));
}
module.exports = { createInvestmentService, registerInvestmentRoutes };
