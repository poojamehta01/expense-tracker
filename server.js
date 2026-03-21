require('dotenv').config();
const express = require('express');
const session = require('express-session');
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
app.use(express.static('public'));

// Pass current user info to frontend
app.get('/api/me', (req, res) => {
  res.json({ email: req.user.email, name: req.user.name, photo: req.user.photo });
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

// PUT /api/transactions/:id
app.put('/api/transactions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const tx = req.body;
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
  const info = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: true });
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
  const impulseRows = db.prepare(`SELECT impulse, SUM(amount) AS total ${base} AND impulse != '' GROUP BY impulse`).all(month);
  const topMerchants = db.prepare(`SELECT description, SUM(amount) AS total, COUNT(*) AS cnt ${base} GROUP BY description ORDER BY total DESC LIMIT 10`).all(month);

  const byPaidBy = {};
  for (const r of byPaidByRows) byPaidBy[r.paid_by || 'Unknown'] = r.total;

  const impulseVsIntentional = {};
  for (const r of impulseRows) impulseVsIntentional[r.impulse] = r.total;

  res.json({
    totalSpend: totalRow.total,
    transactionCount: totalRow.cnt,
    byCategory,
    byPaidBy,
    byExpenseType,
    byPaymentMethod,
    dailySpend,
    impulseVsIntentional,
    topMerchants
  });
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

const EXTRACTION_PROMPT = `You are an expense extraction assistant for an Indian household budget tracker.
Analyze this payment screenshot or bank/credit card statement and extract ALL transactions shown.

For each transaction return a JSON object with exactly these fields:
- date: string in format "D Month YYYY" (e.g. "21 March 2026"). If year is unclear assume 2026.
- amount: number only, no currency symbol (e.g. 358)
- description: short merchant/payee name (e.g. "Uber", "Swiggy", "Zepto")
- category: pick best match from this exact list: ${CATEGORIES.join(', ')}
- expense_type: pick from: ${EXPENSE_TYPES.join(', ')} — default "Pooja_Personal" unless clearly joint or Kunal's
- payment_method: pick from: ${PAYMENT_METHODS.join(', ')} — infer from card/app shown in screenshot
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

app.post('/api/extract', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    const base64Data = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const result = await model.generateContent([
      { inlineData: { data: base64Data, mimeType } },
      EXTRACTION_PROMPT
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

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Expense Tracker running at http://localhost:${PORT}\n`);
});
