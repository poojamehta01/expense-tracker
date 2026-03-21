require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./db');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Trust Railway's reverse proxy so secure cookies work over HTTPS
app.set('trust proxy', 1);

app.use(express.json());

// ─── Session ─────────────────────────────────────────────────────────────────

app.use(session({
  store: new SqliteStore({ client: db }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

// ─── Google OAuth ─────────────────────────────────────────────────────────────

const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BASE_URL}/auth/google/callback`
  },
  (accessToken, refreshToken, profile, done) => {
    const email = profile.emails?.[0]?.value?.toLowerCase();
    if (!email || !ALLOWED_EMAILS.includes(email)) {
      return done(null, false, { message: 'Access denied' });
    }
    return done(null, { email, name: profile.displayName, photo: profile.photos?.[0]?.value });
  }
));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.use(passport.initialize());
app.use(passport.session());

// ─── Auth routes ──────────────────────────────────────────────────────────────

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=access_denied' }),
  (req, res) => res.redirect('/')
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => res.redirect('/login'));
});

// ─── Login page ───────────────────────────────────────────────────────────────

app.get('/login', (req, res) => {
  const error = req.query.error === 'access_denied'
    ? '<p class="error">This Google account is not authorized. Please use your personal account.</p>'
    : '';
  res.send(`<!DOCTYPE html>
<html><head><title>Expense Tracker — Sign In</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #f5f5f7; display: flex; align-items: center;
    justify-content: center; min-height: 100vh; }
  .card { background: white; border-radius: 16px; padding: 48px 40px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08); width: 360px; text-align: center; }
  .icon { font-size: 40px; margin-bottom: 16px; }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 6px; color: #1a1a1a; }
  p.sub { color: #6b7280; font-size: 14px; margin-bottom: 32px; }
  a.google-btn {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    width: 100%; padding: 12px; border: 1px solid #e0e0e0; border-radius: 8px;
    text-decoration: none; color: #1a1a1a; font-size: 15px; font-weight: 500;
    transition: background 0.15s; background: white;
  }
  a.google-btn:hover { background: #f9fafb; }
  a.google-btn svg { flex-shrink: 0; }
  .error { color: #dc2626; font-size: 13px; margin-top: 16px; }
</style></head>
<body><div class="card">
  <div class="icon">💰</div>
  <h1>Expense Tracker</h1>
  <p class="sub">Sign in with your Google account to continue</p>
  <a href="/auth/google" class="google-btn">
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
    </svg>
    Sign in with Google
  </a>
  ${error}
</div></body></html>`);
});

// ─── Auth middleware for all app routes ──────────────────────────────────────

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

// ─── App routes (protected) ───────────────────────────────────────────────────

app.use(requireAuth);
app.use(express.static('public', {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

// Pass current user info to frontend
app.get('/api/me', (req, res) => {
  res.json({ email: req.user.email, name: req.user.name, photo: req.user.photo });
});

// ─── Admin / diagnostics ──────────────────────────────────────────────────────

app.get('/api/admin/db-stats', requireAuth, (req, res) => {
  const pageCount  = db.pragma('page_count',    { simple: true });
  const pageSize   = db.pragma('page_size',      { simple: true });
  const freePages  = db.pragma('freelist_count', { simple: true });
  res.json({
    sizeMB:     ((pageCount * pageSize) / 1048576).toFixed(3),
    freePages,
    walMode:    db.pragma('journal_mode', { simple: true }),
    autoVacuum: db.pragma('auto_vacuum',  { simple: true }),
  });
});

// ─── Transaction API routes ───────────────────────────────────────────────────

// Helper: derive month string from date like "21 March 2026" → "March_2026"
function monthFromDate(dateStr) {
  const parts = dateStr.trim().split(' ');
  if (parts.length >= 3) return `${parts[1]}_${parts[2]}`;
  const now = new Date();
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  return `${months[now.getMonth()]}_${now.getFullYear()}`;
}

// POST /api/transactions — save a batch of reviewed transactions
app.post('/api/transactions', (req, res) => {
  const { transactions } = req.body;
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.status(400).json({ error: 'No transactions provided' });
  }

  const insert = db.prepare(`
    INSERT INTO transactions
      (date, amount, description, payment_method, paid_by, expense_type,
       category, mood, impulse, remarks, month)
    VALUES
      (@date, @amount, @description, @payment_method, @paid_by, @expense_type,
       @category, @mood, @impulse, @remarks, @month)
  `);

  const checkDupe = db.prepare(
    `SELECT COUNT(*) as cnt FROM transactions WHERE date=? AND amount=? AND description=?`
  );

  const insertMany = db.transaction((rows) => {
    const ids = [];
    let skipped = 0;
    for (const tx of rows) {
      const date = tx.date || '';
      const amount = parseFloat(tx.amount) || 0;
      const description = tx.description || '';
      const { cnt } = checkDupe.get(date, amount, description);
      if (cnt > 0) { skipped++; continue; }
      const info = insert.run({
        date,
        amount,
        description,
        payment_method: tx.payment_method || '',
        paid_by: tx.paid_by || '',
        expense_type: tx.expense_type || '',
        category: tx.category || '',
        mood: tx.mood || '',
        impulse: tx.impulse || '',
        remarks: tx.remarks || '',
        month: monthFromDate(date)
      });
      ids.push(info.lastInsertRowid);
    }
    return { ids, skipped };
  });

  try {
    const { ids, skipped } = insertMany(transactions);
    res.json({ saved: ids.length, skipped, ids });
  } catch (err) {
    console.error('Insert error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transactions?month=March_2026
app.get('/api/transactions', (req, res) => {
  const { month } = req.query;
  const rows = month
    ? db.prepare('SELECT * FROM transactions WHERE month = ? ORDER BY date, id').all(month)
    : db.prepare('SELECT * FROM transactions ORDER BY date, id').all();
  res.json({ transactions: rows });
});

// ── Audit helpers ─────────────────────────────────────────────────────────────
const auditWrite = db.prepare(
  'INSERT INTO transaction_audit (tx_id, action, snapshot) VALUES (?, ?, ?)'
);
const auditCleanup = db.prepare(
  "DELETE FROM transaction_audit WHERE changed_at < datetime('now', '-1 day')"
);
function saveAudit(txId, action, snapshot) {
  auditWrite.run(txId, action, JSON.stringify(snapshot));
  auditCleanup.run(); // lazy TTL cleanup
}

// PUT /api/transactions/:id
app.put('/api/transactions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  // Merge incoming fields over the existing row — never blank out omitted fields
  const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  saveAudit(id, 'update', existing);
  const tx = { ...existing, ...req.body };
  const info = db.prepare(`
    UPDATE transactions SET
      date=@date, amount=@amount, description=@description,
      payment_method=@payment_method, paid_by=@paid_by, expense_type=@expense_type,
      category=@category, mood=@mood, impulse=@impulse, remarks=@remarks,
      month=@month
    WHERE id=@id
  `).run({
    id,
    date: tx.date || '',
    amount: parseFloat(tx.amount) || 0,
    description: tx.description || '',
    payment_method: tx.payment_method || '',
    paid_by: tx.paid_by || '',
    expense_type: tx.expense_type || '',
    category: tx.category || '',
    mood: tx.mood || '',
    impulse: tx.impulse || '',
    remarks: tx.remarks || '',
    month: monthFromDate(tx.date || '')
  });
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ updated: true });
});

// DELETE /api/transactions/:id
app.delete('/api/transactions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  saveAudit(id, 'delete', existing);
  db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
  res.json({ deleted: true });
});

// GET /api/audit — recent changes (last 24h)
app.get('/api/audit', (req, res) => {
  auditCleanup.run();
  const rows = db.prepare(
    'SELECT * FROM transaction_audit ORDER BY changed_at DESC LIMIT 100'
  ).all();
  res.json({ entries: rows.map(r => ({ ...r, snapshot: JSON.parse(r.snapshot) })) });
});

// POST /api/audit/:id/restore — restore a snapshot
app.post('/api/audit/:id/restore', (req, res) => {
  const auditRow = db.prepare('SELECT * FROM transaction_audit WHERE id = ?').get(parseInt(req.params.id));
  if (!auditRow) return res.status(404).json({ error: 'Audit entry not found or expired' });
  const snap = JSON.parse(auditRow.snapshot);

  const txExists = db.prepare('SELECT id FROM transactions WHERE id = ?').get(snap.id);
  if (txExists) {
    // Restore by overwriting current values
    db.prepare(`
      UPDATE transactions SET
        date=@date, amount=@amount, description=@description,
        payment_method=@payment_method, paid_by=@paid_by, expense_type=@expense_type,
        category=@category, mood=@mood, impulse=@impulse, remarks=@remarks, month=@month
      WHERE id=@id
    `).run({ ...snap });
  } else {
    // Re-insert deleted row (preserve original id)
    db.prepare(`
      INSERT INTO transactions
        (id, date, amount, description, payment_method, paid_by, expense_type,
         category, mood, impulse, remarks, month, created_at)
      VALUES
        (@id, @date, @amount, @description, @payment_method, @paid_by, @expense_type,
         @category, @mood, @impulse, @remarks, @month, @created_at)
    `).run({ ...snap });
  }

  // Remove audit entry — it's been consumed
  db.prepare('DELETE FROM transaction_audit WHERE id = ?').run(auditRow.id);
  res.json({ restored: true, transaction: snap });
});

// GET /api/trends — multi-month aggregated data
const MONTH_SORT = `
  CAST(substr(month, instr(month,'_')+1) AS INTEGER),
  CASE substr(month,1,instr(month,'_')-1)
    WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3
    WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6
    WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9
    WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12
  END`;

const CC_EXCLUDE = " AND category != 'Credit Card Payment' AND category != 'Settlement'";

app.get('/api/trends', (req, res) => {
  const { person } = req.query;
  let pf = '';
  let pfParams = [];
  if (person === 'Pooja' || person === 'Kunal') { pf = ' AND paid_by = ?'; pfParams = [person]; }
  else if (person === 'Common') { pf = " AND expense_type = 'Common_50_50'"; pfParams = []; }

  // Monthly totals (excluding CC payments)
  const monthlyTotals = db.prepare(
    `SELECT month, COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt
     FROM transactions WHERE 1=1${CC_EXCLUDE}${pf} GROUP BY month ORDER BY ${MONTH_SORT}`
  ).all(...pfParams);

  const months = monthlyTotals.map(r => r.month);
  if (months.length === 0) return res.json({ months: [], monthlyTotals: [], monthlySplit: [], topCategories: { categories: [], byMonth: [] }, categoryBreakdown: { categories: [], byMonth: {}, totals: {} }, creditCardPayments: {}, byPaymentMethod: { methods: [], byMonth: {}, totals: {} } });

  // Pooja vs Kunal split (excluding CC payments)
  const splitRows = db.prepare(
    `SELECT month, paid_by, COALESCE(SUM(amount),0) AS total
     FROM transactions WHERE paid_by IN ('Pooja','Kunal')${CC_EXCLUDE}${pf}
     GROUP BY month, paid_by ORDER BY ${MONTH_SORT}`
  ).all(...pfParams);
  const splitMap = {};
  for (const r of splitRows) {
    if (!splitMap[r.month]) splitMap[r.month] = { Pooja: 0, Kunal: 0 };
    splitMap[r.month][r.paid_by] = r.total;
  }
  const monthlySplit = months.map(m => ({ month: m, Pooja: splitMap[m]?.Pooja || 0, Kunal: splitMap[m]?.Kunal || 0 }));

  // Top 5 categories (excluding CC payments)
  const top5 = db.prepare(
    `SELECT category FROM transactions WHERE category != '' AND category IS NOT NULL${CC_EXCLUDE}${pf}
     GROUP BY category ORDER BY SUM(amount) DESC LIMIT 5`
  ).all(...pfParams).map(r => r.category);

  // Per-month breakdown for those 5
  const placeholders = top5.map(() => '?').join(',');
  const catRows = top5.length ? db.prepare(
    `SELECT month, category, COALESCE(SUM(amount),0) AS total
     FROM transactions WHERE category IN (${placeholders})${pf}
     GROUP BY month, category ORDER BY ${MONTH_SORT}`
  ).all(...top5, ...pfParams) : [];

  const catMap = {};
  for (const r of catRows) {
    if (!catMap[r.month]) { catMap[r.month] = {}; for (const c of top5) catMap[r.month][c] = 0; }
    catMap[r.month][r.category] = r.total;
  }
  const byMonth = months.map(m => {
    const obj = { month: m };
    for (const c of top5) obj[c] = catMap[m]?.[c] || 0;
    return obj;
  });

  // All categories breakdown (excluding CC payments)
  const allCatRows = db.prepare(
    `SELECT month, category, COALESCE(SUM(amount),0) AS total
     FROM transactions WHERE category != '' AND category IS NOT NULL${CC_EXCLUDE}${pf}
     GROUP BY month, category ORDER BY ${MONTH_SORT}`
  ).all(...pfParams);

  const allCatTotals = {};
  const allCatByMonth = {};
  for (const r of allCatRows) {
    if (!allCatByMonth[r.month]) allCatByMonth[r.month] = {};
    allCatByMonth[r.month][r.category] = r.total;
    allCatTotals[r.category] = (allCatTotals[r.category] || 0) + r.total;
  }
  const allCategories = Object.keys(allCatTotals).sort((a, b) => allCatTotals[b] - allCatTotals[a]);

  // Credit card payments (separate — not counted as expense)
  const ccRows = db.prepare(
    `SELECT month, COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt
     FROM transactions WHERE category = 'Credit Card Payment'${pf}
     GROUP BY month ORDER BY ${MONTH_SORT}`
  ).all(...pfParams);
  const creditCardPayments = {};
  for (const r of ccRows) creditCardPayments[r.month] = { total: r.total, cnt: r.cnt };

  // Spend by payment method (excluding CC payments)
  const pmRows = db.prepare(
    `SELECT month, payment_method, COALESCE(SUM(amount),0) AS total
     FROM transactions WHERE payment_method != '' AND payment_method IS NOT NULL${CC_EXCLUDE}${pf}
     GROUP BY month, payment_method ORDER BY ${MONTH_SORT}`
  ).all(...pfParams);
  const pmTotals = {};
  const pmByMonth = {};
  for (const r of pmRows) {
    if (!pmByMonth[r.month]) pmByMonth[r.month] = {};
    pmByMonth[r.month][r.payment_method] = r.total;
    pmTotals[r.payment_method] = (pmTotals[r.payment_method] || 0) + r.total;
  }
  const allMethods = Object.keys(pmTotals).sort((a, b) => pmTotals[b] - pmTotals[a]);

  res.json({
    months, monthlyTotals, monthlySplit, topCategories: { categories: top5, byMonth },
    categoryBreakdown: { categories: allCategories, byMonth: allCatByMonth, totals: allCatTotals },
    creditCardPayments,
    byPaymentMethod: { methods: allMethods, byMonth: pmByMonth, totals: pmTotals }
  });
});

// GET /api/months
app.get('/api/months', (req, res) => {
  const rows = db.prepare('SELECT DISTINCT month FROM transactions ORDER BY month').all();
  res.json({ months: rows.map(r => r.month) });
});

// GET /api/dashboard?month=March_2026
app.get('/api/dashboard', (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'month required' });

  const base = 'FROM transactions WHERE month = ?';

  const totalRow = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt ${base}`).get(month);
  const byCategory = db.prepare(`SELECT category, SUM(amount) AS total ${base} GROUP BY category ORDER BY total DESC LIMIT 10`).all(month);
  const byPaidByRows = db.prepare(`SELECT paid_by, SUM(amount) AS total ${base} GROUP BY paid_by`).all(month);
  const byExpenseType = db.prepare(`SELECT expense_type, SUM(amount) AS total ${base} GROUP BY expense_type ORDER BY total DESC`).all(month);
  const byPaymentMethod = db.prepare(`SELECT payment_method, SUM(amount) AS total ${base} GROUP BY payment_method ORDER BY total DESC`).all(month);
  const dailySpend = db.prepare(`SELECT date, SUM(amount) AS total ${base} GROUP BY date ORDER BY date`).all(month);
  const topMerchants = db.prepare(`SELECT description, SUM(amount) AS total, COUNT(*) AS cnt ${base} GROUP BY description ORDER BY total DESC LIMIT 10`).all(month);

  const byPaidBy = {};
  for (const r of byPaidByRows) byPaidBy[r.paid_by || 'Unknown'] = r.total;

  // Settlement: net amount Kunal owes Pooja (negative = Pooja owes Kunal)
  const settlementRows = db.prepare(
    `SELECT expense_type, paid_by, SUM(amount) AS total ${base}
     AND expense_type IN ('Common_50_50','Pooja_for_Kunal','Kunal_for_Pooja')
     GROUP BY expense_type, paid_by`
  ).all(month);

  let kunalOwesPooja = 0;
  let poojaOwesKunal = 0;
  let commonSpend = 0, poojaForKunal = 0, kunalForPooja = 0;
  for (const r of settlementRows) {
    if (r.expense_type === 'Common_50_50') {
      commonSpend += r.total;
      if (r.paid_by === 'Pooja') kunalOwesPooja += r.total / 2;
      if (r.paid_by === 'Kunal') poojaOwesKunal += r.total / 2;
    } else if (r.expense_type === 'Pooja_for_Kunal') {
      poojaForKunal += r.total;
      kunalOwesPooja += r.total;
    } else if (r.expense_type === 'Kunal_for_Pooja') {
      kunalForPooja += r.total;
      poojaOwesKunal += r.total;
    }
  }
  const netSettlement = kunalOwesPooja - poojaOwesKunal;

  res.json({
    totalSpend: totalRow.total,
    transactionCount: totalRow.cnt,
    byCategory,
    byPaidBy,
    byExpenseType,
    byPaymentMethod,
    dailySpend,
    topMerchants,
    settlement: { kunalOwesPooja, poojaOwesKunal, net: netSettlement, commonSpend, poojaForKunal, kunalForPooja }
  });
});

// ─── Lists API (custom categories / expense types / payment methods) ──────────

const VALID_LIST_NAMES = ['categories', 'expense_types', 'payment_methods'];

app.get('/api/lists', (req, res) => {
  const rows = db.prepare('SELECT id, list_name, value FROM lists ORDER BY id').all();
  const result = { categories: [], expense_types: [], payment_methods: [] };
  for (const r of rows) {
    if (result[r.list_name]) result[r.list_name].push({ id: r.id, value: r.value });
  }
  res.json(result);
});

app.post('/api/lists', (req, res) => {
  const { list_name, value } = req.body;
  if (!list_name || !value || !value.trim()) {
    return res.status(400).json({ error: 'list_name and value required' });
  }
  if (!VALID_LIST_NAMES.includes(list_name)) {
    return res.status(400).json({ error: 'invalid list_name' });
  }
  try {
    const info = db.prepare('INSERT INTO lists (list_name, value) VALUES (?, ?)').run(list_name, value.trim());
    res.json({ id: info.lastInsertRowid, list_name, value: value.trim() });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'already exists' });
    throw err;
  }
});

app.delete('/api/lists/:id', (req, res) => {
  db.prepare('DELETE FROM lists WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Gemini extraction ────────────────────────────────────────────────────────

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const CATEGORIES = [
  'Zepto/Blinkit', 'Credit Card Payment', 'Doctor', 'Donation', 'Entertainment',
  'Fitness', 'Fruits & Veggies', 'Furlenco', 'Gifts', 'Home stuff', 'House Help',
  'Investment', 'Laundry', 'Loan EMI', 'Medicines', 'Monthly Home bills', 'Ola/Uber',
  'Others', 'Outside Food', 'Parking', 'Petrol', 'Porter/Rapido', 'Refunded', 'Rent',
  'Salon', 'Settlement', 'Shopping - bag', 'Shopping - clothes', 'Shopping - electronics',
  'Shopping - gold', 'Shopping - home', 'Shopping - jwellery', 'Shopping - shoes',
  'Shopping - silver', 'Shopping - skin/hair care', 'Subscriptions', 'Unexpected',
  'Wifi/ Phone bills', 'Shopping - hobby', 'Insurance', 'Travel - flights',
  'Car downpayment/ emi', 'Therapy', 'Birthday gift', 'Stays', 'Nutritionist',
  'Books', 'Flowers', 'ESOPS', 'Movies', 'DryClear'
];

const EXPENSE_TYPES = [
  'Pooja_Personal', 'Kunal_Personal', 'Common_50_50',
  'Pooja_for_Kunal', 'Kunal_for_Pooja', 'Kunal_CreditCard_Bill', 'Pooja_CreditCard_Bill'
];

const PAYMENT_METHODS = [
  'Cash', 'ICICI_Credit_Card', 'Amazon_Credit_Card', 'SBI_Credit_Card',
  'HDFC_Credit_Card', 'ABFL_Credit_Card', 'HDFC_Debit_Card', 'Zaggle'
];

function buildExtractionPrompt() {
  const customRows = db.prepare('SELECT list_name, value FROM lists').all();
  const cats = [...CATEGORIES];
  const expTypes = [...EXPENSE_TYPES];
  const payMethods = [...PAYMENT_METHODS];
  for (const r of customRows) {
    if (r.list_name === 'categories' && !cats.includes(r.value)) cats.push(r.value);
    if (r.list_name === 'expense_types' && !expTypes.includes(r.value)) expTypes.push(r.value);
    if (r.list_name === 'payment_methods' && !payMethods.includes(r.value)) payMethods.push(r.value);
  }
  return `You are an expense extraction assistant for an Indian household budget tracker.
Analyze this payment screenshot or bank/credit card statement and extract ALL transactions shown.

For each transaction return a JSON object with exactly these fields:
- date: string in format "D Month YYYY" (e.g. "21 March 2026"). If year is unclear assume 2026.
- amount: number only, no currency symbol (e.g. 358)
- description: short merchant/payee name (e.g. "Uber", "Swiggy", "Zepto")
- category: pick best match from this exact list: ${cats.join(', ')}
- expense_type: pick from: ${expTypes.join(', ')} — default "Pooja_Personal" unless clearly joint or Kunal's
- payment_method: pick from: ${payMethods.join(', ')} — infer from card/app shown in screenshot
- paid_by: "Pooja" or "Kunal" — default "Pooja" unless Kunal is clearly the payer

Category hints:
- Uber, Ola, rapido cab rides → "Ola/Uber"
- Rapido porter/bike delivery → "Porter/Rapido"
- Swiggy, Zomato, restaurant → "Outside Food"
- Zepto, Blinkit → "Zepto/Blinkit"
- Vegetables, fruits, grocery shops → "Fruits & Veggies"
- Airtel, Jio, internet → "Wifi/ Phone bills"
- Amazon, Flipkart (clothes) → "Shopping - clothes"
- Amazon, Flipkart (electronics) → "Shopping - electronics"
- Amazon, Flipkart (home items) → "Shopping - home"
- Netflix, Spotify, Hotstar → "Subscriptions"
- Doctor, hospital, clinic → "Doctor"
- Pharmacy, medicines → "Medicines"
- Gym, cult.fit → "Fitness"
- Salon, haircut → "Salon"

Return ONLY a valid JSON array. No explanation, no markdown, no code blocks.
Example: [{"date":"21 March 2026","amount":358,"description":"Uber","category":"Ola/Uber","expense_type":"Pooja_Personal","payment_method":"HDFC_Credit_Card","paid_by":"Pooja"}]
If no transactions found, return: []`;
}

app.post('/api/extract', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    const base64Data = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const result = await model.generateContent([
      { inlineData: { data: base64Data, mimeType } },
      buildExtractionPrompt()
    ]);

    const text = result.response.text().trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.json({ transactions: [] });

    const transactions = JSON.parse(jsonMatch[0]);
    res.json({ transactions });
  } catch (err) {
    console.error('Extraction error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/extract-text', express.json(), async (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided' });

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    const result = await model.generateContent([
      `The following is one or more SMS / bank notification messages pasted by the user. Extract all transactions from them.\n\n${text.trim()}\n\n${buildExtractionPrompt()}`
    ]);

    const raw = result.response.text().trim();
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.json({ transactions: [] });

    const transactions = JSON.parse(jsonMatch[0]);
    res.json({ transactions });
  } catch (err) {
    console.error('Text extraction error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/salary?month= — get salary entries for all months or a specific month
app.get('/api/salary', (req, res) => {
  const { month } = req.query;
  if (month) {
    const rows = db.prepare('SELECT person, amount, notes FROM salaries WHERE month = ?').all(month);
    const result = { Pooja: 0, Kunal: 0, notes: { Pooja: '', Kunal: '' } };
    for (const r of rows) { result[r.person] = r.amount; result.notes[r.person] = r.notes || ''; }
    return res.json(result);
  }
  // All months history
  const rows = db.prepare(`SELECT person, month, amount, notes FROM salaries ORDER BY ${MONTH_SORT}`).all();
  const byMonth = {};
  for (const r of rows) {
    if (!byMonth[r.month]) byMonth[r.month] = { Pooja: 0, Kunal: 0, notes: { Pooja: '', Kunal: '' } };
    byMonth[r.month][r.person] = r.amount;
    byMonth[r.month].notes[r.person] = r.notes || '';
  }
  res.json({ history: byMonth });
});

// POST /api/salary — upsert salary for a person+month
app.post('/api/salary', (req, res) => {
  const { month, Pooja, Kunal, notes } = req.body;
  if (!month) return res.status(400).json({ error: 'month required' });
  const upsert = db.prepare(`
    INSERT INTO salaries (person, month, amount, notes) VALUES (?, ?, ?, ?)
    ON CONFLICT(person, month) DO UPDATE SET amount = excluded.amount, notes = excluded.notes
  `);
  if (Pooja !== undefined) upsert.run('Pooja', month, Number(Pooja) || 0, notes?.Pooja || '');
  if (Kunal !== undefined) upsert.run('Kunal', month, Number(Kunal) || 0, notes?.Kunal || '');
  res.json({ saved: true });
});

// POST /api/ask — AI-powered financial Q&A
app.post('/api/ask', async (req, res) => {
  const { question, month } = req.body;
  if (!question) return res.status(400).json({ error: 'question required' });

  // Monthly totals (excl CC payments)
  const monthlyRows = db.prepare(
    `SELECT month, COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt
     FROM transactions WHERE category != 'Credit Card Payment'
     GROUP BY month ORDER BY ${MONTH_SORT}`
  ).all();

  // Top 10 categories all-time (excl CC)
  const topCats = db.prepare(
    `SELECT category, COALESCE(SUM(amount),0) AS total
     FROM transactions WHERE category != '' AND category != 'Credit Card Payment'
     GROUP BY category ORDER BY total DESC LIMIT 10`
  ).all();

  // Current month detail
  const currentMonth = month || (monthlyRows.length ? monthlyRows[monthlyRows.length - 1].month : null);
  let monthDetail = '';
  if (currentMonth) {
    const base = `FROM transactions WHERE month = ? AND category != 'Credit Card Payment'`;
    const tot = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt ${base}`).get(currentMonth);
    const cats = db.prepare(`SELECT category, SUM(amount) AS total ${base} GROUP BY category ORDER BY total DESC`).all(currentMonth);
    const split = db.prepare(`SELECT paid_by, SUM(amount) AS total ${base} GROUP BY paid_by`).all(currentMonth);
    const expTypes = db.prepare(`SELECT expense_type, SUM(amount) AS total FROM transactions WHERE month = ? GROUP BY expense_type ORDER BY total DESC`).all(currentMonth);
    monthDetail = `
Current month (${currentMonth}): ₹${Math.round(tot.total).toLocaleString('en-IN')} across ${tot.cnt} transactions
Categories: ${cats.map(c => `${c.category} ₹${Math.round(c.total).toLocaleString('en-IN')}`).join(', ')}
Paid by: ${split.map(s => `${s.paid_by} ₹${Math.round(s.total).toLocaleString('en-IN')}`).join(', ')}
Expense types: ${expTypes.map(e => `${e.expense_type} ₹${Math.round(e.total).toLocaleString('en-IN')}`).join(', ')}`;
  }

  const context = `You are a personal finance assistant for a couple — Pooja and Kunal — who track shared and personal expenses.

Monthly totals (most recent last, Credit Card bill payments excluded):
${monthlyRows.map(r => `- ${r.month}: ₹${Math.round(r.total).toLocaleString('en-IN')} (${r.cnt} txns)`).join('\n')}

Top 10 spending categories all-time:
${topCats.map(c => `- ${c.category}: ₹${Math.round(c.total).toLocaleString('en-IN')}`).join('\n')}
${monthDetail}

Expense types used: Pooja_Personal, Kunal_Personal, Common_50_50 (split 50/50), Pooja_for_Kunal (Pooja paid for Kunal), Kunal_for_Pooja.

Answer the question below. Be specific with numbers. Use ₹ for currency. Keep response concise (under 180 words). If predicting, base it on recent trends.

Question: ${question}`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    const result = await model.generateContent(context);
    res.json({ answer: result.response.text().trim() });
  } catch (err) {
    console.error('Ask AI error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Expense Tracker running at http://localhost:${PORT}\n`);
});
