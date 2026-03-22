// Import CSV files into the DB, replacing existing data for those months.
// Run locally:  node scripts/import_csv.js
// Run on Fly:   fly ssh console --command "node /app/scripts/import_csv.js"
const fs = require('fs');
const path = require('path');
const db = require('../db');

const CSV_FILES = [
  { file: 'Kharcha - January_26.csv',  month: 'January_2026'  },
  { file: 'Kharcha - February_26.csv', month: 'February_2026' },
];

function monthFromDate(dateStr) {
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const parts = dateStr.trim().split(' ');
  // e.g. "1 February 2026" → parts[1]="February", parts[2]="2026"
  const mon = parts[1];
  const yr  = parts[2];
  if (!mon || !yr) throw new Error(`Cannot parse date: "${dateStr}"`);
  return `${mon}_${yr}`;
}

function parseCSV(filepath) {
  const lines = fs.readFileSync(filepath, 'utf8').split('\n');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Simple CSV split — fields don't contain commas in this file
    const cols = line.split(',');
    if (cols.length < 9) continue;
    rows.push({
      date:           cols[0].trim(),
      amount:         parseFloat(cols[1].trim()),
      description:    cols[2].trim(),
      payment_method: cols[3].trim(),
      paid_by:        cols[4].trim(),
      expense_type:   cols[5].trim(),
      category:       cols[6].trim(),
      mood:           cols[7].trim(),
      impulse:        cols[8].trim(),
      remarks:        (cols[9] || '').trim(),
    });
  }
  return rows;
}

const del = db.prepare("DELETE FROM transactions WHERE month = ?");
const ins = db.prepare(`
  INSERT INTO transactions
    (date, amount, description, payment_method, paid_by, expense_type, category, mood, impulse, remarks, month)
  VALUES
    (@date, @amount, @description, @payment_method, @paid_by, @expense_type, @category, @mood, @impulse, @remarks, @month)
`);

for (const { file, month } of CSV_FILES) {
  const filepath = path.join(__dirname, '..', file);
  if (!fs.existsSync(filepath)) {
    console.error(`File not found: ${filepath}`);
    continue;
  }

  const rows = parseCSV(filepath);
  const run = db.transaction(() => {
    const deleted = del.run(month);
    console.log(`[${month}] Deleted ${deleted.changes} existing rows`);
    let inserted = 0;
    for (const r of rows) {
      if (!r.date || isNaN(r.amount)) { console.warn('  Skipping bad row:', r); continue; }
      ins.run({ ...r, month });
      inserted++;
    }
    console.log(`[${month}] Inserted ${inserted} rows`);
  });

  run();
}

console.log('Done.');
process.exit(0);
