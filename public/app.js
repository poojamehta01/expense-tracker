// ─── Data ───────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Zepto/Blinkit','Credit Card Payment','Doctor','Donation','Entertainment',
  'Fitness','Fruits & Veggies','Furlenco','Gifts','Home stuff','House Help',
  'Investment','Laundry','Loan EMI','Medicines','Monthly Home bills','Ola/Uber',
  'Others','Outside Food','Parking','Petrol','Porter/Rapido','Refunded','Rent',
  'Salon','Settlement','Shopping - bag','Shopping - clothes','Shopping - electronics',
  'Shopping - gold','Shopping - home','Shopping - jwellery','Shopping - shoes',
  'Shopping - silver','Shopping - skin/hair care','Subscriptions','Unexpected',
  'Wifi/ Phone bills','Shopping - hobby','Insurance','Travel - flights',
  'Car downpayment/ emi','Therapy','Birthday gift','Stays','Nutritionist',
  'Books','Flowers','ESOPS','Movies','DryClear'
];

const EXPENSE_TYPES = [
  'Pooja_Personal','Kunal_Personal','Common_50_50',
  'Pooja_for_Kunal','Kunal_for_Pooja','Kunal_CreditCard_Bill','Pooja_CreditCard_Bill'
];

const PAYMENT_METHODS = [
  'Cash','ICICI_Credit_Card','Amazon_Credit_Card','SBI_Credit_Card',
  'HDFC_Credit_Card','ABFL_Credit_Card','HDFC_Debit_Card','Zaggle'
];

const MOODS = ['', 'Neutral', 'Happy', 'Sad', 'Angry', 'Anxious', 'Bored'];
const IMPULSE_OPTIONS = ['', 'Impulse', 'Intentional'];

// ─── Chip color map ──────────────────────────────────────────────────────────
const CHIP_MAP = {
  // expense_type
  'Pooja_Personal':        { bg: '#ede9fe', color: '#5b21b6' },
  'Kunal_Personal':        { bg: '#dbeafe', color: '#1e40af' },
  'Common_50_50':          { bg: '#fee2e2', color: '#991b1b' },
  'Pooja_for_Kunal':       { bg: '#fef3c7', color: '#92400e' },
  'Kunal_for_Pooja':       { bg: '#dcfce7', color: '#166534' },
  'Kunal_CreditCard_Bill': { bg: '#f1f5f9', color: '#475569' },
  'Pooja_CreditCard_Bill': { bg: '#fce7f3', color: '#9d174d' },
  // payment_method
  'Cash':                  { bg: '#d1fae5', color: '#065f46' },
  'ICICI_Credit_Card':     { bg: '#e0f2fe', color: '#0369a1' },
  'Amazon_Credit_Card':    { bg: '#ffedd5', color: '#9a3412' },
  'SBI_Credit_Card':       { bg: '#ccfbf1', color: '#0f766e' },
  'HDFC_Credit_Card':      { bg: '#e0e7ff', color: '#3730a3' },
  'ABFL_Credit_Card':      { bg: '#f5f3ff', color: '#6d28d9' },
  'HDFC_Debit_Card':       { bg: '#ffe4e6', color: '#be123c' },
  'Zaggle':                { bg: '#fdf4ff', color: '#86198f' },
  // paid_by
  'Pooja':                 { bg: '#ede9fe', color: '#5b21b6' },
  'Kunal':                 { bg: '#dbeafe', color: '#1e40af' },
  // impulse
  'Impulse':               { bg: '#fee2e2', color: '#991b1b' },
  'Intentional':           { bg: '#dcfce7', color: '#166534' },
};

function chipHtml(val) {
  if (!val) return '<span class="cell-empty">—</span>';
  const c = CHIP_MAP[val];
  const label = String(val).replace(/_/g, ' ');
  if (c) return `<span class="chip" style="background:${c.bg};color:${c.color}">${esc(label)}</span>`;
  // neutral chip for categories and other select values
  return `<span class="chip chip-neutral">${esc(label)}</span>`;
}

// ─── State ──────────────────────────────────────────────────────────────────

let transactions = [];
let chartCategory = null;
let chartDaily = null;
let chartExpenseType = null;
let chartPaymentMethod = null;
let chartMonthlySpend = null;
let chartMonthlySplit = null;
let chartTopCategories = null;
let trendsLoaded = false;

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Restore dark mode preference
  if (localStorage.getItem('darkMode') === '1') {
    document.body.classList.add('dark');
    document.getElementById('darkToggleBtn').textContent = '☀️';
  }
  loadSettings();
  setupUpload();
  initUploadMonthPicker();
  loadUser();
  switchTab('dashboard');
  loadMonths();

  // Close column panel when clicking outside
  document.addEventListener('click', e => {
    const wrap = document.getElementById('colPanel')?.closest('.col-toggle-wrap');
    if (wrap && !wrap.contains(e.target)) {
      document.getElementById('colPanel')?.classList.add('hidden');
    }
  });
});

let currentUserName = 'Pooja'; // default, overwritten after login check

async function loadUser() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) return;
    const user = await res.json();
    // Extract first name and match to known paid_by values
    const firstName = (user.name || '').split(' ')[0];
    if (firstName === 'Kunal') currentUserName = 'Kunal';
    else currentUserName = 'Pooja';
    const el = document.getElementById('userInfo');
    el.innerHTML = `
      ${user.photo ? `<img src="${esc(user.photo)}" alt="${esc(user.name)}" referrerpolicy="no-referrer" />` : ''}
      <span>${esc(user.name)}</span>
      <a href="/auth/logout">Sign out</a>
    `;
  } catch {}
}

function getUploadMonth() {
  return document.getElementById('uploadMonthPicker').value;
}

function onUploadMonthChange() {}

function initUploadMonthPicker() {
  const picker = document.getElementById('uploadMonthPicker');
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const now = new Date();
  const endYear = now.getFullYear();
  picker.innerHTML = '';
  for (let year = 2026; year <= endYear; year++) {
    const maxMonth = (year === endYear) ? now.getMonth() : 11;
    for (let mi = 0; mi <= maxMonth; mi++) {
      const opt = document.createElement('option');
      opt.value = `${MONTHS[mi]}_${year}`;
      opt.textContent = `${MONTHS[mi]} ${year}`;
      picker.appendChild(opt);
    }
  }
  // default to current month
  picker.value = `${MONTHS[now.getMonth()]}_${now.getFullYear()}`;
  onUploadMonthChange();
}


// ─── Tabs ────────────────────────────────────────────────────────────────────

function switchTab(name) {
  ['dashboard', 'add', 'trends'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('hidden', name !== t);
    document.getElementById('tab-btn-' + t).classList.toggle('active', name === t);
  });
  if (name === 'trends' && !trendsLoaded) loadTrends();
}

// ─── Settings ────────────────────────────────────────────────────────────────

function loadSettings() {
  // sheetsUrl preserved in localStorage for optional export
}

// ─── Upload ──────────────────────────────────────────────────────────────────

function setupUpload() {
  const area = document.getElementById('uploadArea');
  const input = document.getElementById('fileInput');

  area.addEventListener('click', (e) => {
    if (e.target.tagName !== 'LABEL') input.click();
  });

  input.addEventListener('change', () => {
    if (input.files.length) handleFiles(Array.from(input.files));
    input.value = '';
  });

  area.addEventListener('dragover', (e) => {
    e.preventDefault();
    area.classList.add('dragover');
  });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith('image/') || f.type === 'application/pdf'
    );
    if (files.length) handleFiles(files);
  });
}

async function handleFiles(files) {
  showLoading(true);
  showError('');
  hideResult();

  const newTx = [];
  for (let i = 0; i < files.length; i++) {
    setLoadingText(`Processing file ${i + 1} of ${files.length}: ${files[i].name}…`);
    try {
      const extracted = await extractFromFile(files[i]);
      const uploadMonth = getUploadMonth(); // e.g. "March_2026"
      const [uMon, uYr] = uploadMonth ? uploadMonth.split('_') : [null, null];
      extracted.forEach(tx => {
        tx.paid_by = currentUserName;
        if (!tx.expense_type || tx.expense_type === 'Pooja_Personal' || tx.expense_type === 'Kunal_Personal') {
          tx.expense_type = currentUserName + '_Personal';
        }
        // if date is missing or has no month/year, pin it to selected month
        if (uMon && uYr && tx.date) {
          const parts = tx.date.trim().split(' ');
          if (parts.length < 3) tx.date = `1 ${uMon} ${uYr}`;
        } else if (uMon && uYr && !tx.date) {
          tx.date = `1 ${uMon} ${uYr}`;
        }
      });
      newTx.push(...extracted);
    } catch (err) {
      showError(`Failed to process "${files[i].name}": ${err.message}`);
    }
  }

  showLoading(false);

  if (newTx.length === 0 && transactions.length === 0) {
    showError('No transactions found. Try a clearer screenshot.');
    return;
  }

  transactions.push(...newTx);
  renderTable();
}

async function extractFromFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/extract', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Server error');
  }
  const data = await res.json();
  return data.transactions || [];
}

// ─── Review Table ─────────────────────────────────────────────────────────────

function renderTable() {
  const section = document.getElementById('tableSection');
  const body = document.getElementById('txBody');
  const count = document.getElementById('txCount');

  body.innerHTML = '';
  transactions.forEach((tx, i) => {
    body.appendChild(buildRow(tx, i));
  });

  count.textContent = `${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`;
  section.classList.remove('hidden');
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildRow(tx, index) {
  const tr = document.createElement('tr');
  tr.dataset.index = index;

  tr.innerHTML = `
    <td><input type="date" value="${appDateToISO(tx.date || '')}" onchange="updateTx(${index},'date',isoToAppDate(this.value))" /></td>
    <td><input type="number" value="${tx.amount || ''}" step="0.01" onchange="updateTx(${index},'amount',parseFloat(this.value))" /></td>
    <td><input type="text" value="${esc(tx.description || '')}" onchange="updateTx(${index},'description',this.value)" /></td>
    <td class="rv-td"></td>
    <td class="rv-td"></td>
    <td class="rv-td"></td>
    <td class="rv-td"></td>
    <td class="rv-td"></td>
    <td class="rv-td"></td>
    <td><input type="text" value="${esc(tx.remarks || '')}" onchange="updateTx(${index},'remarks',this.value)" /></td>
    <td><button class="btn-delete" onclick="deleteRow(${index})" title="Delete">×</button></td>
  `;

  const tds = tr.querySelectorAll('.rv-td');
  tds[0].appendChild(makeChipCombo(PAYMENT_METHODS, tx.payment_method || '', index, 'payment_method'));
  tds[1].appendChild(makeChipCombo(['Pooja','Kunal'], tx.paid_by || '', index, 'paid_by'));
  tds[2].appendChild(makeChipCombo(EXPENSE_TYPES, tx.expense_type || '', index, 'expense_type'));
  tds[3].appendChild(makeChipCombo(CATEGORIES, tx.category || '', index, 'category'));
  tds[4].appendChild(makeChipCombo(MOODS, tx.mood || '', index, 'mood'));
  tds[5].appendChild(makeChipCombo(IMPULSE_OPTIONS, tx.impulse || '', index, 'impulse'));

  return tr;
}

// Chip-based searchable combo for review table
function makeChipCombo(options, current, index, field) {
  const searchable = options.length > 6;
  const wrap = document.createElement('div');
  wrap.className = 'rv-combo';

  // Trigger: shows current value as chip + arrow
  const trigger = document.createElement('div');
  trigger.className = 'rv-combo-trigger';
  trigger.innerHTML = chipHtml(current || '') + '<span class="rv-arrow">▾</span>';

  // Panel: search input + list
  const panel = document.createElement('div');
  panel.className = 'rv-combo-panel hidden';

  let searchInput = null;
  if (searchable) {
    searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'rv-combo-search';
    searchInput.placeholder = 'Search…';
    panel.appendChild(searchInput);
  }

  const list = document.createElement('div');
  list.className = 'rv-combo-list';
  panel.appendChild(list);

  let highlighted = 0;

  const renderOpts = (q) => {
    const qlo = (q || '').toLowerCase();
    const filtered = options.filter(o => !qlo || String(o).replace(/_/g, ' ').toLowerCase().includes(qlo));
    highlighted = 0;
    list.innerHTML = filtered.map((o, i) =>
      `<div class="rv-opt${i === 0 ? ' hi' : ''}${o === current ? ' cur' : ''}" data-val="${esc(o)}">${chipHtml(o)}</div>`
    ).join('');
  };

  const pick = (val) => {
    current = val;
    trigger.innerHTML = chipHtml(val || '') + '<span class="rv-arrow">▾</span>';
    panel.classList.add('hidden');
    updateTx(index, field, val);
  };

  const highlight = (delta) => {
    const opts = [...list.querySelectorAll('.rv-opt')];
    if (!opts.length) return;
    opts[highlighted]?.classList.remove('hi');
    highlighted = Math.max(0, Math.min(opts.length - 1, highlighted + delta));
    opts[highlighted]?.classList.add('hi');
    opts[highlighted]?.scrollIntoView({ block: 'nearest' });
  };

  const open = () => {
    // Close any other open combos first
    document.querySelectorAll('.rv-combo-panel:not(.hidden)').forEach(p => p.classList.add('hidden'));
    renderOpts('');
    panel.classList.remove('hidden');
    if (searchInput) { searchInput.value = ''; searchInput.focus(); }
    else list.focus();
    // Scroll current into view
    setTimeout(() => list.querySelector('.cur')?.scrollIntoView({ block: 'nearest' }), 0);
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.contains('hidden') ? open() : panel.classList.add('hidden');
  });

  panel.addEventListener('mousedown', e => e.preventDefault());
  list.addEventListener('click', e => {
    const opt = e.target.closest('.rv-opt');
    if (opt) pick(opt.dataset.val);
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => renderOpts(searchInput.value));
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') { panel.classList.add('hidden'); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); highlight(1); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); highlight(-1); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        const hi = list.querySelector('.rv-opt.hi');
        if (hi) pick(hi.dataset.val);
      }
    });
    searchInput.addEventListener('blur', () => {
      setTimeout(() => { if (!wrap.contains(document.activeElement)) panel.classList.add('hidden'); }, 150);
    });
  }

  // Close on outside click
  document.addEventListener('click', () => panel.classList.add('hidden'));

  wrap.appendChild(trigger);
  wrap.appendChild(panel);
  return wrap;
}

function makeSelect(options, current, index, field) {
  const opts = options.map(o =>
    `<option value="${esc(o)}" ${o === current ? 'selected' : ''}>${esc(o) || '—'}</option>`
  ).join('');
  return `<select onchange="updateTx(${index},'${field}',this.value)">${opts}</select>`;
}

function updateTx(index, field, value) {
  transactions[index][field] = value;
}

function deleteRow(index) {
  transactions.splice(index, 1);
  if (transactions.length === 0) {
    document.getElementById('tableSection').classList.add('hidden');
  } else {
    renderTable();
  }
}

function addEmptyRow() {
  const uploadMonth = getUploadMonth(); // e.g. "March_2026"
  const [mon, yr] = uploadMonth ? uploadMonth.split('_') : [null, null];
  const now = new Date();
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const defaultDate = mon && yr
    ? `${now.getDate()} ${mon} ${yr}`
    : `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  transactions.push({
    date: defaultDate,
    amount: '',
    description: '',
    payment_method: 'HDFC_Credit_Card',
    paid_by: currentUserName,
    expense_type: currentUserName + '_Personal',
    category: 'Others',
    mood: '',
    impulse: '',
    remarks: ''
  });
  renderTable();
  const rows = document.querySelectorAll('#txBody tr');
  if (rows.length) rows[rows.length - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearAll() {
  if (!confirm('Clear all transactions?')) return;
  transactions = [];
  document.getElementById('tableSection').classList.add('hidden');
  hideResult();
}

// ─── Save to Tracker ──────────────────────────────────────────────────────────

async function saveToTracker() {
  if (transactions.length === 0) {
    alert('No transactions to save.');
    return;
  }

  const saveBtn = document.getElementById('saveBtn');
  const saveBtn2 = document.getElementById('saveBtn2');
  saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
  saveBtn2.disabled = true; saveBtn2.textContent = 'Saving…';

  try {
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Server error');
    }
    const data = await res.json();
    const skipNote = data.skipped > 0 ? ` (${data.skipped} duplicate${data.skipped !== 1 ? 's' : ''} skipped)` : '';
    showResult(`✓ ${data.saved} transaction${data.saved !== 1 ? 's' : ''} saved to Tracker!${skipNote}`, 'success');
    trendsLoaded = false; // refresh trends next time tab is opened
    transactions = [];
    document.getElementById('tableSection').classList.add('hidden');
    // Refresh months list in dashboard
    loadMonths();
  } catch (err) {
    showResult(`Failed to save: ${err.message}`, 'error');
  }

  saveBtn.disabled = false; saveBtn.textContent = 'Save to Tracker';
  saveBtn2.disabled = false; saveBtn2.textContent = 'Save to Tracker →';
}

// ─── Export to Sheets (optional) ─────────────────────────────────────────────

async function exportToSheets() {
  const url = localStorage.getItem('sheetsUrl') || '';
  const month = document.getElementById('monthPicker').value;
  const sheetName = month;

  if (!url) {
    const entered = prompt('Enter your Google Apps Script URL for Sheets export:');
    if (!entered) return;
    localStorage.setItem('sheetsUrl', entered.trim());
  }
  if (!url) {
    return;
  }

  const res = await fetch(`/api/transactions?month=${encodeURIComponent(month)}`);
  const data = await res.json();
  if (!data.transactions || data.transactions.length === 0) {
    alert('No transactions to export for this month.');
    return;
  }

  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: data.transactions, sheetName })
    });
    alert(`✓ ${data.transactions.length} transactions exported to "${sheetName}".`);
  } catch (err) {
    alert(`Export failed: ${err.message}`);
  }
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

async function loadMonths() {
  try {
    const res = await fetch('/api/months');
    const data = await res.json();
    const withData = new Set(data.months || []);

    const picker = document.getElementById('monthPicker');
    const prev = picker.value;
    picker.innerHTML = '';

    // Always show Jan–Dec for every year from 2026 through current year
    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    const now = new Date();
    const endYear = now.getFullYear();

    for (let year = 2026; year <= endYear; year++) {
      const maxMonth = (year === endYear) ? now.getMonth() : 11; // 0-indexed
      for (let mi = 0; mi <= maxMonth; mi++) {
        const key = `${MONTHS[mi]}_${year}`;
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = withData.has(key) ? `${MONTHS[mi]} ${year}` : `${MONTHS[mi]} ${year} —`;
        picker.appendChild(opt);
      }
    }

    // Select: previous selection > current month > last option
    const currentMonth = `${MONTHS[now.getMonth()]}_${now.getFullYear()}`;
    if (prev && [...picker.options].some(o => o.value === prev)) {
      picker.value = prev;
    } else {
      picker.value = currentMonth;
    }

    loadDashboard(picker.value);
  } catch (err) {
    console.error('loadMonths error:', err);
  }
}

async function loadDashboard(month) {
  if (!month) return;

  try {
    const [dashRes, txRes] = await Promise.all([
      fetch(`/api/dashboard?month=${encodeURIComponent(month)}`),
      fetch(`/api/transactions?month=${encodeURIComponent(month)}`)
    ]);

    const dash = await dashRes.json();
    const txData = await txRes.json();

    if (dashRes.ok && dash.transactionCount > 0) {
      document.getElementById('dashboardEmpty').classList.add('hidden');
      renderKPIs(dash);
      renderCategoryChart(dash);
      renderDailyChart(dash);
      renderExpenseTypeChart(dash);
      renderPaymentMethodChart(dash);
      renderTopMerchants(dash);
      // apply collapsed state for charts
      document.getElementById('chartsGrid').style.display = chartsVisible ? '' : 'none';
      document.getElementById('chartsToggleIcon').textContent = chartsVisible ? '▲' : '▼';
    } else {
      document.getElementById('dashboardEmpty').classList.remove('hidden');
      document.getElementById('merchantsSection').style.display = 'none';
      document.getElementById('savedTxSection').style.display = 'none';
    }

    renderTransactionsList(txData.transactions || []);
  } catch (err) {
    console.error('loadDashboard error:', err);
  }
}

let chartsVisible = false;
let merchantsVisible = false;
let txTableVisible = true;

function toggleDark() {
  const dark = document.body.classList.toggle('dark');
  document.getElementById('darkToggleBtn').textContent = dark ? '☀️' : '🌙';
  localStorage.setItem('darkMode', dark ? '1' : '0');
}

function toggleCharts() {
  chartsVisible = !chartsVisible;
  const grid = document.getElementById('chartsGrid');
  const icon = document.getElementById('chartsToggleIcon');
  grid.style.display = chartsVisible ? '' : 'none';
  icon.textContent = chartsVisible ? '▲' : '▼';
}

function toggleMerchants() {
  merchantsVisible = !merchantsVisible;
  document.getElementById('merchantsBody_wrap').style.display = merchantsVisible ? '' : 'none';
  document.getElementById('merchantsToggleIcon').textContent = merchantsVisible ? '▲' : '▼';
}

function toggleTxTable() {
  txTableVisible = !txTableVisible;
  document.getElementById('txTableBody_wrap').style.display = txTableVisible ? '' : 'none';
  document.getElementById('txTableToggleIcon').textContent = txTableVisible ? '▲' : '▼';
}

function renderKPIs(data) {
  document.getElementById('kpiTotal').textContent = formatCurrency(data.totalSpend);
  document.getElementById('kpiCount').textContent = data.transactionCount;

  const pooja = data.byPaidBy['Pooja'] || 0;
  const kunal = data.byPaidBy['Kunal'] || 0;
  document.getElementById('kpiSplit').innerHTML =
    `<span class="split-label">Pooja</span> ${formatCurrency(pooja)}<br>` +
    `<span class="split-label">Kunal</span> ${formatCurrency(kunal)}`;

  const s = data.settlement || { net: 0, kunalOwesPooja: 0, poojaOwesKunal: 0, commonSpend: 0, poojaForKunal: 0, kunalForPooja: 0 };
  const net = s.net;
  let netLine;
  if (Math.abs(net) < 1) {
    netLine = '<span style="color:var(--success);font-size:13px;font-weight:600">All settled ✓</span>';
  } else if (net > 0) {
    netLine = `<span class="split-label">Kunal owes Pooja</span> <strong>${formatCurrency(net)}</strong>`;
  } else {
    netLine = `<span class="split-label">Pooja owes Kunal</span> <strong>${formatCurrency(Math.abs(net))}</strong>`;
  }
  const detailLine = (label, val) =>
    `<div class="sett-row"><span class="split-label">${label}</span><span>${formatCurrency(val)}</span></div>`;
  document.getElementById('kpiSettlement').innerHTML =
    `<div class="sett-net">${netLine}</div>` +
    `<div class="sett-detail">` +
      detailLine('Common', s.commonSpend) +
      detailLine('Pooja→Kunal', s.poojaForKunal) +
      detailLine('Kunal→Pooja', s.kunalForPooja) +
    `</div>`;
}

const CHART_COLORS = [
  '#2563eb','#7c3aed','#db2777','#ea580c','#16a34a',
  '#0891b2','#9333ea','#e11d48','#f59e0b','#10b981'
];

function renderCategoryChart(data) {
  if (chartCategory) chartCategory.destroy();
  const labels = data.byCategory.map(d => d.category);
  const values = data.byCategory.map(d => d.total);
  chartCategory = new Chart(document.getElementById('chartCategory'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: CHART_COLORS,
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { callback: v => '₹' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) } }
      }
    }
  });
}

function renderDailyChart(data) {
  if (chartDaily) chartDaily.destroy();
  const labels = data.dailySpend.map(d => {
    const parts = d.date.split(' ');
    return parts[0]; // just the day number
  });
  const values = data.dailySpend.map(d => d.total);
  chartDaily = new Chart(document.getElementById('chartDaily'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { callback: v => '₹' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) } }
      }
    }
  });
}

function renderExpenseTypeChart(data) {
  if (chartExpenseType) chartExpenseType.destroy();
  const labels = data.byExpenseType.map(d => d.expense_type.replace(/_/g, ' '));
  const values = data.byExpenseType.map(d => d.total);
  chartExpenseType = new Chart(document.getElementById('chartExpenseType'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: CHART_COLORS, borderWidth: 2 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } }
      }
    }
  });
}

function renderPaymentMethodChart(data) {
  if (chartPaymentMethod) chartPaymentMethod.destroy();
  const labels = data.byPaymentMethod.map(d => d.payment_method.replace(/_/g, ' '));
  const values = data.byPaymentMethod.map(d => d.total);
  chartPaymentMethod = new Chart(document.getElementById('chartPaymentMethod'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: CHART_COLORS, borderWidth: 2 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } }
      }
    }
  });
}

function renderTopMerchants(data) {
  const section = document.getElementById('merchantsSection');
  const body = document.getElementById('merchantsBody');
  if (!data.topMerchants || data.topMerchants.length === 0) {
    section.style.display = 'none';
    return;
  }
  body.innerHTML = data.topMerchants.map((m, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(m.description || '—')}</td>
      <td>${formatCurrency(m.total)}</td>
      <td>${m.cnt}</td>
    </tr>
  `).join('');
  section.style.display = '';
  // respect collapsed state
  document.getElementById('merchantsBody_wrap').style.display = merchantsVisible ? '' : 'none';
  document.getElementById('merchantsToggleIcon').textContent = merchantsVisible ? '▲' : '▼';
}

// ─── Transactions Grid ────────────────────────────────────────────────────────

const TX_COLS = [
  { key: 'date',           label: 'Date',           type: 'text'   },
  { key: 'amount',         label: 'Amount',         type: 'number' },
  { key: 'description',    label: 'Description',    type: 'text'   },
  { key: 'category',       label: 'Category',       type: 'select', opts: CATEGORIES },
  { key: 'paid_by',        label: 'Paid By',        type: 'select', opts: ['Pooja','Kunal'] },
  { key: 'expense_type',   label: 'Expense Type',   type: 'select', opts: EXPENSE_TYPES },
  { key: 'payment_method', label: 'Payment Method', type: 'select', opts: PAYMENT_METHODS },
  { key: 'impulse',        label: 'Impulse',        type: 'select', opts: IMPULSE_OPTIONS },
  { key: 'mood',           label: 'Mood',           type: 'select', opts: MOODS },
  { key: 'remarks',        label: 'Remarks',        type: 'text'   },
];

let savedTxList = [];
let txSort = { col: 'date', dir: 'asc' };
let txVisibleCols = ['date', 'amount', 'description', 'category', 'paid_by', 'expense_type', 'payment_method', 'impulse'];
let txFilters = { search: '', category: '', paid_by: '', expense_type: '', payment_method: '', impulse: '' };

const MONTH_NUM = {January:1,February:2,March:3,April:4,May:5,June:6,
                   July:7,August:8,September:9,October:10,November:11,December:12};

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

// "20 March 2026" → "2026-03-20"
function appDateToISO(str) {
  const p = String(str || '').trim().split(' ');
  if (p.length < 3) return '';
  const day = String(parseInt(p[0]) || 1).padStart(2, '0');
  const mon = String(MONTH_NUM[p[1]] || 1).padStart(2, '0');
  return `${p[2]}-${mon}-${day}`;
}

// "2026-03-20" → "20 March 2026"
function isoToAppDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${parseInt(d)} ${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

function parseDateNum(str) {
  // "21 March 2026" → 20260321 for numeric comparison
  const p = String(str || '').trim().split(' ');
  if (p.length < 3) return 0;
  return (parseInt(p[2]) || 0) * 10000 + (MONTH_NUM[p[1]] || 0) * 100 + (parseInt(p[0]) || 0);
}

function clientMonthFromDate(dateStr) {
  const parts = (dateStr || '').trim().split(' ');
  if (parts.length >= 3) return `${parts[1]}_${parts[2]}`;
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const now = new Date();
  return `${months[now.getMonth()]}_${now.getFullYear()}`;
}

let filtersVisible = false;

function resetTxFilters() {
  txFilters = {};
  TX_COLS.forEach(c => { txFilters[c.key] = ''; });
}

function renderTransactionsList(txList) {
  savedTxList = txList || [];
  resetTxFilters();
  filtersVisible = false;
  updateFilterBtn();
  const section = document.getElementById('savedTxSection');
  if (!savedTxList.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  renderColPanel();
  renderGrid();
}

// ─── Per-column filter row ────────────────────────────────────────────────────

function toggleFilterBar() {
  filtersVisible = !filtersVisible;
  if (!filtersVisible) { resetTxFilters(); updateFilterBtn(); }
  renderGrid();
}

function setColFilter(key, value) {
  txFilters[key] = value;
  updateFilterBtn();
  renderGridBody(); // only re-render body — keeps filter inputs focused
}

function clearTxFilters() {
  resetTxFilters();
  updateFilterBtn();
  renderGrid();
}

function updateFilterBtn() {
  const active = Object.values(txFilters).filter(Boolean).length;
  const btn = document.getElementById('filterBtn');
  if (!btn) return;
  btn.textContent = active > 0 ? `Filter (${active}) ▾` : filtersVisible ? 'Filter ▲' : 'Filter ▾';
  btn.classList.toggle('btn-primary', active > 0 || filtersVisible);
  btn.classList.toggle('btn-secondary', active === 0 && !filtersVisible);
}

function getFilteredList() {
  return savedTxList.filter(tx => {
    return TX_COLS.every(col => {
      const f = (txFilters[col.key] || '').toLowerCase().trim();
      if (!f) return true;
      const raw = String(tx[col.key] ?? '');
      // Match against display value (with spaces instead of underscores)
      const display = raw.replace(/_/g, ' ').toLowerCase();
      return display.includes(f) || raw.toLowerCase().includes(f);
    });
  });
}

function renderGrid() {
  renderGridHead();
  renderGridBody();
}

// ─── Portal list cleanup ──────────────────────────────────────────────────────
// cf-dd-list elements are appended to document.body (portal) so overflow:hidden
// ancestors never clip them. Track them here and remove before each head rebuild.
let _cfPortals = [];
function cleanupCfPortals() {
  _cfPortals.forEach(el => el.remove());
  _cfPortals = [];
}

function renderGridHead() {
  cleanupCfPortals();
  const cols = TX_COLS.filter(c => txVisibleCols.includes(c.key));
  const thead = document.getElementById('savedTxHead');
  thead.innerHTML = ''; // clear

  // ── Sort header row (plain innerHTML) ──────────────────────────────────────
  const sortHtml = cols.map(col => {
    const active = txSort.col === col.key;
    const icon = active
      ? `<span class="sort-icon active">${txSort.dir === 'asc' ? '▲' : '▼'}</span>`
      : `<span class="sort-icon idle">↕</span>`;
    return `<th class="sortable${active ? ' sorted' : ''}" onclick="txSortBy('${col.key}')">${col.label}${icon}</th>`;
  }).join('') + '<th class="th-actions"></th>';
  const sortTr = document.createElement('tr');
  sortTr.innerHTML = sortHtml;
  thead.appendChild(sortTr);

  if (!filtersVisible) return;

  // ── Filter row (DOM-built for interactive dropdowns) ───────────────────────
  const filterTr = document.createElement('tr');
  filterTr.className = 'filter-row';

  cols.forEach(col => {
    const th = document.createElement('th');
    th.className = 'filter-th';

    const isDropdown = col.type === 'select' || col.key === 'date';
    if (isDropdown) {
      const opts = col.key === 'date'
        // unique dates from current data, sorted chronologically
        ? [...new Set(savedTxList.map(t => t.date).filter(Boolean))].sort((a, b) => parseDateNum(a) - parseDateNum(b))
        : (col.opts || []);
      th.appendChild(makeCfDropdown(col.key, opts, col.type === 'select'));
    } else {
      // Plain text input for amount, description, remarks
      const input = document.createElement('input');
      input.className = 'cf-input' + (txFilters[col.key] ? ' cf-active' : '');
      input.type = 'text';
      input.placeholder = 'Search…';
      input.value = txFilters[col.key] || '';
      input.addEventListener('input', () => setColFilter(col.key, input.value));
      input.addEventListener('click', e => e.stopPropagation());
      th.appendChild(input);
    }

    filterTr.appendChild(th);
  });

  // Clear all button
  const clearTh = document.createElement('th');
  clearTh.className = 'filter-th';
  const clearBtn = document.createElement('button');
  clearBtn.className = 'cf-clear-btn';
  clearBtn.title = 'Clear all filters';
  clearBtn.textContent = '✕';
  clearBtn.addEventListener('click', clearTxFilters);
  clearTh.appendChild(clearBtn);
  filterTr.appendChild(clearTh);

  thead.appendChild(filterTr);
}

// Searchable dropdown for column filters
// The list is portalled to document.body (position:fixed) so it's never clipped
// by overflow:hidden/auto ancestors (table-wrapper, table-section, etc.)
function makeCfDropdown(key, opts, useChips = false) {
  const curVal = txFilters[key] || '';

  const wrap = document.createElement('div');
  wrap.className = 'cf-dd-wrap';

  const input = document.createElement('input');
  input.className = 'cf-input' + (curVal ? ' cf-active' : '');
  input.type = 'text';
  input.placeholder = 'Search…';
  input.value = curVal.replace(/_/g, ' ');

  // Portal: list lives in document.body, positioned via getBoundingClientRect
  const list = document.createElement('div');
  list.className = 'cf-dd-list hidden';
  list.style.position = 'fixed';
  list.style.zIndex = '9999';
  document.body.appendChild(list);
  _cfPortals.push(list);

  wrap.appendChild(input);

  const positionList = () => {
    const r = input.getBoundingClientRect();
    list.style.top  = (r.bottom + 4) + 'px';
    list.style.left = r.left + 'px';
    list.style.minWidth = Math.max(r.width, 200) + 'px';
  };

  let selected = curVal;

  const buildList = (q) => {
    const qlo = q.toLowerCase();
    const allOpts = ['', ...opts];
    const filtered = allOpts.filter(o => !qlo || String(o).replace(/_/g, ' ').toLowerCase().includes(qlo));
    list.innerHTML = filtered.map(o => {
      let inner;
      if (!o) inner = '<span style="color:#9ca3af;font-style:italic">All</span>';
      else if (useChips) inner = chipHtml(o);
      else inner = esc(String(o).replace(/_/g, ' '));
      return `<div class="cf-sel-opt${o === selected ? ' cf-sel-cur' : ''}" data-val="${esc(o)}">${inner}</div>`;
    }).join('');
    list.classList.toggle('hidden', filtered.length === 0);
  };

  input.addEventListener('focus', () => { positionList(); buildList(''); list.classList.remove('hidden'); });
  input.addEventListener('input', () => buildList(input.value));
  input.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { list.classList.add('hidden'); input.value = selected.replace(/_/g, ' '); }
    if (e.key === 'Enter') {
      const first = list.querySelector('.cf-sel-opt');
      if (first) pickOpt(first.dataset.val);
    }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      list.classList.add('hidden');
      input.value = selected.replace(/_/g, ' ');
    }, 160);
  });

  const pickOpt = (val) => {
    selected = val;
    input.value = val.replace(/_/g, ' ');
    input.classList.toggle('cf-active', !!val);
    list.classList.add('hidden');
    setColFilter(key, val);
  };

  list.addEventListener('mousedown', e => {
    e.preventDefault(); // prevent input blur before click fires
    const opt = e.target.closest('.cf-sel-opt');
    if (opt) pickOpt(opt.dataset.val);
  });

  return wrap;
}

function renderGridBody() {
  const cols = TX_COLS.filter(c => txVisibleCols.includes(c.key));
  const filtered = getFilteredList();

  // Update count badge
  const total = savedTxList.length;
  const shown = filtered.length;
  document.getElementById('savedTxCount').textContent = shown < total
    ? `${shown} of ${total} transactions`
    : `${total} transaction${total !== 1 ? 's' : ''}`;

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let va = a[txSort.col] ?? '', vb = b[txSort.col] ?? '';
    let cmp;
    if (txSort.col === 'amount') {
      cmp = (parseFloat(va) || 0) - (parseFloat(vb) || 0);
    } else if (txSort.col === 'date') {
      cmp = parseDateNum(va) - parseDateNum(vb);
    } else {
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
      cmp = va < vb ? -1 : va > vb ? 1 : 0;
    }
    return txSort.dir === 'asc' ? cmp : -cmp;
  });

  document.getElementById('savedTxBody').innerHTML = sorted.map(tx => {
    const cells = cols.map(col => {
      const raw = tx[col.key] ?? '';
      let display;
      if (col.key === 'amount') {
        display = formatCurrency(raw);
      } else if (col.type === 'select') {
        display = chipHtml(raw);
      } else {
        display = esc(String(raw).replace(/_/g, ' ')) || '<span class="cell-empty">—</span>';
      }
      return `<td class="gc" data-id="${tx.id}" data-field="${col.key}" onclick="startEdit(this)">${display}</td>`;
    }).join('');
    return `<tr data-id="${tx.id}">${cells}<td class="td-actions"><button class="btn-delete" onclick="deleteSavedTx(${tx.id})" title="Delete">×</button></td></tr>`;
  }).join('');
}

function txSortBy(col) {
  if (txSort.col === col) txSort.dir = txSort.dir === 'asc' ? 'desc' : 'asc';
  else { txSort.col = col; txSort.dir = 'asc'; }
  renderGrid();
}

function startEdit(cell) {
  if (cell.classList.contains('editing')) return;
  const id    = parseInt(cell.dataset.id);
  const field = cell.dataset.field;
  const col   = TX_COLS.find(c => c.key === field);
  const tx    = savedTxList.find(t => t.id === id);
  if (!tx || !col) return;

  cell.classList.add('editing');
  cell.innerHTML = '';
  const origVal = tx[field] ?? '';

  const restoreCell = (val) => {
    cell.classList.remove('editing');
    if (field === 'amount') {
      cell.textContent = formatCurrency(val);
    } else if (col.type === 'select') {
      cell.innerHTML = chipHtml(String(val));
    } else {
      cell.textContent = String(val || '').replace(/_/g, ' ') || '—';
    }
  };

  const saveVal = (newVal) => {
    tx[field] = newVal;
    if (field === 'date') tx.month = clientMonthFromDate(String(newVal));
    restoreCell(newVal);
    fetch(`/api/transactions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tx)
    }).catch(e => console.error('Save failed', e));
  };

  const cancelEdit = () => restoreCell(origVal);

  const moveToNext = (shiftKey) => {
    const allCells = [...document.querySelectorAll('#savedTxBody .gc')];
    const next = allCells[allCells.indexOf(cell) + (shiftKey ? -1 : 1)];
    if (next) setTimeout(() => startEdit(next), 0);
  };

  if (col.type === 'select') {
    // ── Chip-based inline dropdown (same style as review table) ──────────────
    const panel = document.createElement('div');
    panel.className = 'rv-combo-panel rv-inline';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'rv-combo-search';
    searchInput.placeholder = 'Search…';

    const list = document.createElement('div');
    list.className = 'rv-combo-list';

    panel.appendChild(searchInput);
    panel.appendChild(list);

    let highlighted = 0;

    const renderOpts = (q) => {
      const qlo = q.toLowerCase();
      const opts = (col.opts || []).filter(o => !qlo || String(o).replace(/_/g, ' ').toLowerCase().includes(qlo));
      highlighted = 0;
      list.innerHTML = opts.map((o, i) =>
        `<div class="rv-opt${i === 0 ? ' hi' : ''}${o === origVal ? ' cur' : ''}" data-val="${esc(o)}">${chipHtml(o)}</div>`
      ).join('');
    };

    const highlight = (delta) => {
      const opts = [...list.querySelectorAll('.rv-opt')];
      if (!opts.length) return;
      opts[highlighted]?.classList.remove('hi');
      highlighted = Math.max(0, Math.min(opts.length - 1, highlighted + delta));
      opts[highlighted]?.classList.add('hi');
      opts[highlighted]?.scrollIntoView({ block: 'nearest' });
    };

    list.addEventListener('mousedown', e => e.preventDefault());
    list.addEventListener('click', e => {
      const opt = e.target.closest('.rv-opt');
      if (opt) { saveVal(opt.dataset.val); }
    });

    searchInput.addEventListener('input', () => renderOpts(searchInput.value));

    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') { cancelEdit(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); highlight(1); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); highlight(-1); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const hi = list.querySelector('.rv-opt.hi');
        if (hi) saveVal(hi.dataset.val);
        else {
          const exact = (col.opts || []).find(o => String(o).toLowerCase() === searchInput.value.toLowerCase().trim());
          if (exact) saveVal(exact); else cancelEdit();
        }
        if (e.key === 'Tab') moveToNext(e.shiftKey);
      }
    });

    searchInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (cell.classList.contains('editing')) {
          const exact = (col.opts || []).find(o => String(o).toLowerCase() === searchInput.value.toLowerCase().trim());
          if (exact) saveVal(exact); else cancelEdit();
        }
      }, 150);
    });

    renderOpts('');
    cell.appendChild(panel);
    searchInput.focus();
    setTimeout(() => list.querySelector('.cur')?.scrollIntoView({ block: 'nearest' }), 0);

  } else if (field === 'date') {
    // ── Date picker ──────────────────────────────────────────────────────────
    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'cell-input';
    input.value = appDateToISO(origVal);

    let done = false;
    const commit = () => {
      if (done) return; done = true;
      saveVal(input.value ? isoToAppDate(input.value) : origVal);
    };
    const abort = () => { if (done) return; done = true; cancelEdit(); };

    input.addEventListener('blur', commit);
    input.addEventListener('change', () => { input.blur(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { abort(); }
      if (e.key === 'Tab')    { e.preventDefault(); commit(); moveToNext(e.shiftKey); }
    });

    cell.appendChild(input);
    input.focus();

  } else {
    // ── Text / number input ──────────────────────────────────────────────────
    const input = document.createElement('input');
    input.type = col.type === 'number' ? 'number' : 'text';
    input.className = 'cell-input';
    input.value = origVal;
    if (col.type === 'number') input.step = '0.01';

    let done = false;
    const commit = () => {
      if (done) return; done = true;
      saveVal(col.type === 'number' ? (parseFloat(input.value) || 0) : input.value.trim());
    };
    const abort = () => {
      if (done) return; done = true;
      cancelEdit();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { input.blur(); }
      if (e.key === 'Escape') { abort(); }
      if (e.key === 'Tab')    { e.preventDefault(); commit(); moveToNext(e.shiftKey); }
    });

    cell.appendChild(input);
    input.focus();
    if (col.type !== 'number') input.select();
  }
}

async function addTxRow() {
  const month = document.getElementById('monthPicker').value;
  let defaultDate = '1 ' + (month ? month.replace('_', ' ') : 'March 2026');

  const newTx = {
    date: defaultDate, amount: 0, description: '',
    payment_method: 'HDFC_Debit_Card', paid_by: currentUserName,
    expense_type: currentUserName + '_Personal', category: 'Others',
    mood: '', impulse: '', remarks: '',
    month: clientMonthFromDate(defaultDate)
  };

  try {
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: [newTx] })
    });
    const data = await res.json();
    newTx.id = data.ids[0];
    savedTxList.push(newTx);
    document.getElementById('savedTxCount').textContent =
      `${savedTxList.length} transaction${savedTxList.length !== 1 ? 's' : ''}`;
    renderGrid();
    const lastRow = document.querySelector('#savedTxBody tr:last-child');
    if (lastRow) {
      lastRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const firstCell = lastRow.querySelector('.gc');
      if (firstCell) setTimeout(() => startEdit(firstCell), 80);
    }
  } catch (e) { alert('Failed to add row: ' + e.message); }
}

// Column visibility toggle
function toggleColPanel() {
  document.getElementById('colPanel').classList.toggle('hidden');
}

function renderColPanel() {
  const panel = document.getElementById('colPanel');
  panel.innerHTML = TX_COLS.map(col => `
    <label class="col-check">
      <input type="checkbox" ${txVisibleCols.includes(col.key) ? 'checked' : ''}
        onchange="toggleCol('${col.key}', this.checked)" />
      ${col.label}
    </label>
  `).join('');
}

function toggleCol(key, checked) {
  if (checked && !txVisibleCols.includes(key)) txVisibleCols.push(key);
  else if (!checked) txVisibleCols = txVisibleCols.filter(k => k !== key);
  renderGrid();
}

async function deleteSavedTx(id) {
  if (!confirm('Delete this transaction?')) return;
  try {
    const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    savedTxList = savedTxList.filter(t => t.id !== id);
    document.getElementById('savedTxCount').textContent =
      `${savedTxList.length} transaction${savedTxList.length !== 1 ? 's' : ''}`;
    if (savedTxList.length === 0) {
      document.getElementById('savedTxSection').style.display = 'none';
    } else {
      renderGrid();
    }
    loadMonths();
  } catch (err) {
    alert(`Failed to delete: ${err.message}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function showLoading(visible) {
  document.getElementById('loadingSection').classList.toggle('hidden', !visible);
}
function setLoadingText(text) {
  document.getElementById('loadingText').textContent = text;
}
function showError(msg) {
  const el = document.getElementById('errorSection');
  if (msg) {
    document.getElementById('errorText').textContent = msg;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}
function showResult(msg, type) {
  const el = document.getElementById('pushResult');
  el.textContent = msg;
  el.className = `push-result ${type}`;
  el.classList.remove('hidden');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideResult() {
  document.getElementById('pushResult').classList.add('hidden');
}
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Trends Tab ───────────────────────────────────────────────────────────────

function formatMonthLabel(m) {
  const [name, year] = m.split('_');
  return name.slice(0, 3) + " '" + String(year).slice(2);
}

async function loadTrends() {
  try {
    const res = await fetch('/api/trends');
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();

    if (!data.months || data.months.length === 0) {
      document.getElementById('trendsEmpty').classList.remove('hidden');
      return;
    }
    document.getElementById('trendsEmpty').classList.add('hidden');

    renderMonthlySpendChart(data);
    renderMonthlySplitChart(data);
    renderTopCategoriesChart(data);
    renderTrendsSummaryTable(data);
    trendsLoaded = true;
  } catch (err) {
    console.error('loadTrends error:', err);
  }
}

function renderMonthlySpendChart(data) {
  if (chartMonthlySpend) chartMonthlySpend.destroy();
  chartMonthlySpend = new Chart(document.getElementById('chartMonthlySpend'), {
    type: 'bar',
    data: {
      labels: data.months.map(formatMonthLabel),
      datasets: [{
        label: 'Total Spend',
        data: data.monthlyTotals.map(r => r.total),
        backgroundColor: '#2563eb',
        borderRadius: 5,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => formatCurrency(ctx.parsed.y) } }
      },
      scales: { y: { ticks: { callback: v => '₹' + (v >= 1000 ? Math.round(v/1000) + 'k' : v) } } }
    }
  });
}

function renderMonthlySplitChart(data) {
  if (chartMonthlySplit) chartMonthlySplit.destroy();
  chartMonthlySplit = new Chart(document.getElementById('chartMonthlySplit'), {
    type: 'bar',
    data: {
      labels: data.months.map(formatMonthLabel),
      datasets: [
        { label: 'Pooja', data: data.monthlySplit.map(r => r.Pooja), backgroundColor: '#7c3aed', borderRadius: 3, stack: 'split' },
        { label: 'Kunal', data: data.monthlySplit.map(r => r.Kunal), backgroundColor: '#2563eb', borderRadius: 3, stack: 'split' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}` } }
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, ticks: { callback: v => '₹' + (v >= 1000 ? Math.round(v/1000) + 'k' : v) } }
      }
    }
  });
}

function renderTopCategoriesChart(data) {
  if (chartTopCategories) chartTopCategories.destroy();
  const { categories, byMonth } = data.topCategories;
  if (!categories.length) return;

  const colors = ['#2563eb','#7c3aed','#db2777','#ea580c','#16a34a'];
  const datasets = categories.map((cat, i) => ({
    label: cat,
    data: byMonth.map(row => row[cat] || 0),
    backgroundColor: colors[i % colors.length],
    borderRadius: 3,
    stack: 'cats'
  }));

  chartTopCategories = new Chart(document.getElementById('chartTopCategories'), {
    type: 'bar',
    data: { labels: data.months.map(formatMonthLabel), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}` } }
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, ticks: { callback: v => '₹' + (v >= 1000 ? Math.round(v/1000) + 'k' : v) } }
      }
    }
  });
}

function renderTrendsSummaryTable(data) {
  const body = document.getElementById('trendsSummaryBody');
  body.innerHTML = data.months.map((m, i) => {
    const tot = data.monthlyTotals[i];
    const spl = data.monthlySplit[i];
    return `<tr>
      <td><strong>${esc(m.replace('_', ' '))}</strong></td>
      <td>${formatCurrency(tot.total)}</td>
      <td>${tot.cnt}</td>
      <td>${formatCurrency(spl.Pooja)}</td>
      <td>${formatCurrency(spl.Kunal)}</td>
    </tr>`;
  }).reverse().join(''); // most recent first
  document.getElementById('trendsSummarySection').style.display = '';
}
