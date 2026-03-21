// ─── Data ───────────────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
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

const DEFAULT_EXPENSE_TYPES = [
  'Pooja_Personal','Kunal_Personal','Common_50_50',
  'Pooja_for_Kunal','Kunal_for_Pooja','Kunal_CreditCard_Bill','Pooja_CreditCard_Bill'
];

const DEFAULT_PAYMENT_METHODS = [
  'Cash','ICICI_Credit_Card','Amazon_Credit_Card','SBI_Credit_Card',
  'HDFC_Credit_Card','ABFL_Credit_Card','HDFC_Debit_Card','Zaggle'
];

let CATEGORIES = [...DEFAULT_CATEGORIES];
let EXPENSE_TYPES = [...DEFAULT_EXPENSE_TYPES];
let PAYMENT_METHODS = [...DEFAULT_PAYMENT_METHODS];
let customLists = { categories: [], expense_types: [], payment_methods: [] };

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
let chartAllCategories = null;
let chartTopCategories = null;
let chartPersonFilter = 'all';
let globalPersonFilter = 'all';
let _lastDashData = null;
let trendsLoaded = false;
let _catBreakdownData = null;
let _catSortCol = 'total';
let _catSortDir = 'desc';

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
  ['dashboard', 'add', 'trends', 'salary', 'ask'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('hidden', name !== t);
    document.getElementById('tab-btn-' + t).classList.toggle('active', name === t);
  });
  if (name === 'trends' && !trendsLoaded) loadTrends();
  if (name === 'salary') initSalaryTab();
}

// ─── Settings ────────────────────────────────────────────────────────────────

function loadSettings() {
  // sheetsUrl preserved in localStorage for optional export
  loadLists();
}

async function loadLists() {
  try {
    const res = await fetch('/api/lists');
    if (!res.ok) return;
    const data = await res.json();
    customLists = data;
    CATEGORIES = [...DEFAULT_CATEGORIES, ...data.categories.map(x => x.value)];
    EXPENSE_TYPES = [...DEFAULT_EXPENSE_TYPES, ...data.expense_types.map(x => x.value)];
    PAYMENT_METHODS = [...DEFAULT_PAYMENT_METHODS, ...data.payment_methods.map(x => x.value)];
  } catch (e) { console.error('loadLists error:', e); }
}

// ─── Audit / History Modal ────────────────────────────────────────────────────

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso + 'Z').getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h/24)}d ago`;
}

async function openAuditModal() {
  document.getElementById('auditModal').classList.remove('hidden');
  const body = document.getElementById('auditModalBody');
  body.innerHTML = '<p style="color:var(--text-muted);font-size:13px">Loading…</p>';
  try {
    const res = await fetch('/api/audit');
    const data = await res.json();
    renderAuditModal(data.entries || []);
  } catch (e) {
    body.innerHTML = '<p style="color:var(--error)">Failed to load history.</p>';
  }
}

function closeAuditModal() {
  document.getElementById('auditModal').classList.add('hidden');
}

function renderAuditModal(entries) {
  const body = document.getElementById('auditModalBody');
  if (!entries.length) {
    body.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:24px 0">No changes in the last 24 hours.</p>';
    return;
  }
  body.innerHTML = `
    <table class="audit-table">
      <thead><tr>
        <th>When</th><th>Action</th><th>Description</th><th>Amount</th><th>Date</th><th>Category</th><th></th>
      </tr></thead>
      <tbody>
        ${entries.map(e => {
          const s = e.snapshot;
          const actionLabel = e.action === 'delete'
            ? '<span class="audit-badge audit-del">Deleted</span>'
            : '<span class="audit-badge audit-edit">Edited</span>';
          return `<tr>
            <td class="audit-when">${timeAgo(e.changed_at)}</td>
            <td>${actionLabel}</td>
            <td>${esc(s.description || '—')}</td>
            <td>${formatCurrency(s.amount)}</td>
            <td>${esc(s.date || '—')}</td>
            <td>${esc((s.category || '—').replace(/_/g,' '))}</td>
            <td><button class="btn-primary small" onclick="restoreAudit(${e.id})">Restore</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

async function restoreAudit(auditId) {
  try {
    const res = await fetch(`/api/audit/${auditId}/restore`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Restore failed');
      return;
    }
    // Refresh audit list then reload dashboard
    const data = await fetch('/api/audit').then(r => r.json());
    renderAuditModal(data.entries || []);
    loadMonths(); // reload dashboard data
  } catch (e) {
    alert('Restore failed: ' + e.message);
  }
}

// ─── Manage Lists Modal ───────────────────────────────────────────────────────

function openManageLists() {
  renderManageModal();
  document.getElementById('manageListsModal').classList.remove('hidden');
}

function closeManageLists() {
  document.getElementById('manageListsModal').classList.add('hidden');
}

function renderManageModal() {
  const sections = [
    { key: 'categories', label: 'Categories', defaults: DEFAULT_CATEGORIES },
    { key: 'expense_types', label: 'Expense Types', defaults: DEFAULT_EXPENSE_TYPES },
    { key: 'payment_methods', label: 'Payment Methods', defaults: DEFAULT_PAYMENT_METHODS },
  ];
  document.getElementById('manageListsBody').innerHTML = sections.map(s => `
    <div class="ml-section">
      <div class="ml-section-title">${s.label}</div>
      <div class="ml-items" id="ml-items-${s.key}">
        ${s.defaults.map(v => `
          <span class="ml-item ml-item-default" title="Built-in (cannot be removed)">
            <span class="chip chip-neutral">${esc(v)}</span>
          </span>`).join('')}
        ${(customLists[s.key] || []).map(x => `
          <span class="ml-item">
            <span class="chip chip-neutral">${esc(x.value)}</span>
            <button class="ml-remove" onclick="removeListItem(${x.id}, '${s.key}')" title="Remove">×</button>
          </span>`).join('')}
      </div>
      <div class="ml-add-row">
        <input class="ml-input" id="ml-input-${s.key}" type="text" placeholder="Add new ${s.label.toLowerCase().slice(0, -1)}…"
          onkeydown="if(event.key==='Enter')addListItem('${s.key}')" />
        <button class="btn-primary small" onclick="addListItem('${s.key}')">Add</button>
      </div>
    </div>
  `).join('');
}

async function addListItem(listName) {
  const input = document.getElementById(`ml-input-${listName}`);
  const value = input.value.trim();
  if (!value) return;
  try {
    const res = await fetch('/api/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list_name: listName, value })
    });
    if (res.status === 409) { alert('Already exists'); return; }
    if (!res.ok) throw new Error('Failed');
    const item = await res.json();
    customLists[listName].push(item);
    if (listName === 'categories') CATEGORIES = [...DEFAULT_CATEGORIES, ...customLists.categories.map(x => x.value)];
    if (listName === 'expense_types') EXPENSE_TYPES = [...DEFAULT_EXPENSE_TYPES, ...customLists.expense_types.map(x => x.value)];
    if (listName === 'payment_methods') PAYMENT_METHODS = [...DEFAULT_PAYMENT_METHODS, ...customLists.payment_methods.map(x => x.value)];
    input.value = '';
    renderManageModal();
  } catch (e) { alert('Error adding item'); }
}

async function removeListItem(id, listName) {
  try {
    await fetch(`/api/lists/${id}`, { method: 'DELETE' });
    customLists[listName] = customLists[listName].filter(x => x.id !== id);
    if (listName === 'categories') CATEGORIES = [...DEFAULT_CATEGORIES, ...customLists.categories.map(x => x.value)];
    if (listName === 'expense_types') EXPENSE_TYPES = [...DEFAULT_EXPENSE_TYPES, ...customLists.expense_types.map(x => x.value)];
    if (listName === 'payment_methods') PAYMENT_METHODS = [...DEFAULT_PAYMENT_METHODS, ...customLists.payment_methods.map(x => x.value)];
    renderManageModal();
  } catch (e) { alert('Error removing item'); }
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

// ─── SMS / text paste ─────────────────────────────────────────────────────────

let pasteCardOpen = false;
function togglePasteCard() {
  pasteCardOpen = !pasteCardOpen;
  document.getElementById('pasteCardBody').classList.toggle('hidden', !pasteCardOpen);
  document.getElementById('pasteCardToggleIcon').textContent = pasteCardOpen ? '▾' : '▸';
}

function clearSmsText() {
  document.getElementById('smsTextarea').value = '';
  document.getElementById('smsTextarea').focus();
}

async function extractFromTextArea() {
  const text = (document.getElementById('smsTextarea').value || '').trim();
  if (!text) return;

  const btn = document.getElementById('smsExtractBtn');
  btn.disabled = true;
  showLoading(true);
  setLoadingText('Extracting from messages…');
  showError('');
  hideResult();

  try {
    const extracted = await extractFromText(text);
    const uploadMonth = getUploadMonth();
    const [uMon, uYr] = uploadMonth ? uploadMonth.split('_') : [null, null];
    extracted.forEach(tx => {
      tx.paid_by = currentUserName;
      if (!tx.expense_type || tx.expense_type === 'Pooja_Personal' || tx.expense_type === 'Kunal_Personal') {
        tx.expense_type = currentUserName + '_Personal';
      }
      if (uMon && uYr && tx.date) {
        const parts = tx.date.trim().split(' ');
        if (parts.length < 3) tx.date = `1 ${uMon} ${uYr}`;
      } else if (uMon && uYr && !tx.date) {
        tx.date = `1 ${uMon} ${uYr}`;
      }
    });

    showLoading(false);

    if (extracted.length === 0 && transactions.length === 0) {
      showError('No transactions found in the pasted text.');
    } else {
      transactions.push(...extracted);
      renderTable();
      document.getElementById('smsTextarea').value = '';
    }
  } catch (err) {
    showLoading(false);
    showError('Text extraction failed: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

async function extractFromText(text) {
  const res = await fetch('/api/extract-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Server error');
  }
  const data = await res.json();
  return data.transactions || [];
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
// Shared portal logic for all chip combo variants.
// Panel is appended to document.body and positioned via getBoundingClientRect
// so it's never clipped by overflow:hidden/scroll ancestors.
function _attachPortalCombo(wrap, trigger, panel, searchInput, renderOpts, pick, highlight) {
  panel.style.position = 'fixed';
  panel.style.zIndex = '9999';
  document.body.appendChild(panel);

  const positionPanel = () => {
    const r = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const panelH = Math.min(280, Math.max(spaceBelow, spaceAbove));
    panel.style.minWidth = Math.max(r.width, 180) + 'px';
    panel.style.maxHeight = panelH + 'px';
    panel.style.overflowY = 'auto';
    if (spaceBelow >= Math.min(180, spaceAbove)) {
      panel.style.top  = (r.bottom + 4) + 'px';
      panel.style.bottom = '';
    } else {
      panel.style.bottom = (window.innerHeight - r.top + 4) + 'px';
      panel.style.top = '';
    }
    panel.style.left = Math.min(r.left, window.innerWidth - 200) + 'px';
  };

  const open = () => {
    document.querySelectorAll('.rv-combo-panel:not(.hidden)').forEach(p => p.classList.add('hidden'));
    renderOpts('');
    positionPanel();
    panel.classList.remove('hidden');
    if (searchInput) { searchInput.value = ''; searchInput.focus(); }
    setTimeout(() => panel.querySelector('.cur')?.scrollIntoView({ block: 'nearest' }), 0);
  };

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    panel.classList.contains('hidden') ? open() : panel.classList.add('hidden');
  });
  panel.addEventListener('mousedown', e => e.preventDefault());
  panel.addEventListener('click', e => {
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
        const hi = panel.querySelector('.rv-opt.hi');
        if (hi) pick(hi.dataset.val);
      }
    });
    searchInput.addEventListener('blur', () => {
      setTimeout(() => { if (!panel.contains(document.activeElement)) panel.classList.add('hidden'); }, 150);
    });
  }
  document.addEventListener('click', () => panel.classList.add('hidden'));
  wrap.appendChild(trigger);
  // panel lives in body
}

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

  _attachPortalCombo(wrap, trigger, panel, searchInput, renderOpts, pick, highlight);
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
      _lastDashData = dash;
      // reset per-chart filter on month change
      chartPersonFilter = 'all';
      document.querySelectorAll('.chart-filter-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.person === 'all'));
      // apply collapsed state for charts
      document.getElementById('chartsGrid').style.display = chartsVisible ? '' : 'none';
      document.getElementById('chartsToggleIcon').textContent = chartsVisible ? '▲' : '▼';
    } else {
      document.getElementById('dashboardEmpty').classList.remove('hidden');
      document.getElementById('merchantsSection').style.display = 'none';
      document.getElementById('savedTxSection').style.display = 'none';
    }

    renderTransactionsList(txData.transactions || []);
    if (dashRes.ok && dash.transactionCount > 0) applyGlobalFilter();
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

  const pooja = (data.byPaidBy && data.byPaidBy['Pooja']) || 0;
  const kunal = (data.byPaidBy && data.byPaidBy['Kunal']) || 0;
  document.getElementById('kpiSplit').innerHTML =
    `<span class="split-label">Pooja</span> ${formatCurrency(pooja)}<br>` +
    `<span class="split-label">Kunal</span> ${formatCurrency(kunal)}`;

  if (data.settlement === null) {
    document.getElementById('kpiSettlement').innerHTML =
      '<span style="color:var(--text-muted);font-size:12px">N/A for filtered view</span>';
    return;
  }

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

// ─── Person filter + chart aggregation ───────────────────────────────────────

function setChartPersonFilter(person) {
  chartPersonFilter = person;
  document.querySelectorAll('.chart-filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.person === person));
  const base = getGlobalFiltered(savedTxList);
  if (person === 'all') {
    if (globalPersonFilter === 'all' && _lastDashData) {
      renderChartsFromData(_lastDashData);
    } else {
      renderChartsFromData(aggregateFromTxList(base, _lastDashData));
    }
  } else {
    const filtered = base.filter(t => t.paid_by === person);
    renderChartsFromData(aggregateFromTxList(filtered, _lastDashData));
  }
}

function aggregateFromTxList(txList, fallback) {
  const byCatMap = {}, byDateMap = {}, byTypeMap = {}, byMethodMap = {};
  for (const tx of txList) {
    const amt = parseFloat(tx.amount) || 0;
    byCatMap[tx.category]       = (byCatMap[tx.category]       || 0) + amt;
    byDateMap[tx.date]          = (byDateMap[tx.date]          || 0) + amt;
    byTypeMap[tx.expense_type]  = (byTypeMap[tx.expense_type]  || 0) + amt;
    byMethodMap[tx.payment_method] = (byMethodMap[tx.payment_method] || 0) + amt;
  }
  return {
    ...(fallback || {}),
    byCategory:     Object.entries(byCatMap).sort((a,b) => b[1]-a[1]).map(([category,total])=>({category,total})),
    dailySpend:     Object.entries(byDateMap).sort((a,b) => parseDateNum(a[0])-parseDateNum(b[0])).map(([date,total])=>({date,total})),
    byExpenseType:  Object.entries(byTypeMap).sort((a,b) => b[1]-a[1]).map(([expense_type,total])=>({expense_type,total})),
    byPaymentMethod:Object.entries(byMethodMap).sort((a,b) => b[1]-a[1]).map(([payment_method,total])=>({payment_method,total})),
  };
}

function renderChartsFromData(data) {
  renderCategoryChart(data);
  renderDailyChart(data);
  renderExpenseTypeChart(data);
  renderPaymentMethodChart(data);
  renderAllCategoriesChart(data);
}

function renderAllCategoriesChart(data) {
  if (chartAllCategories) chartAllCategories.destroy();
  const sorted = [...(data.byCategory || [])].sort((a, b) => b.total - a.total);
  if (!sorted.length) return;
  const labels = sorted.map(d => d.category);
  const values = sorted.map(d => d.total);
  // Dynamic height: ~28px per bar + padding
  const container = document.getElementById('chartAllCategoriesContainer');
  container.style.height = Math.max(280, labels.length * 30 + 40) + 'px';
  chartAllCategories = new Chart(document.getElementById('chartAllCategories'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => formatCurrency(ctx.parsed.x) } }
      },
      scales: {
        x: { ticks: { callback: v => '₹' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) } }
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

function renderTopMerchantsFromList(txList) {
  const section = document.getElementById('merchantsSection');
  const body = document.getElementById('merchantsBody');
  const map = {};
  for (const t of txList) {
    const desc = t.description || '';
    if (!map[desc]) map[desc] = { total: 0, cnt: 0 };
    map[desc].total += parseFloat(t.amount) || 0;
    map[desc].cnt++;
  }
  const merchants = Object.entries(map)
    .map(([description, v]) => ({ description, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  if (!merchants.length) { section.style.display = 'none'; return; }
  body.innerHTML = merchants.map((m, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(m.description || '—')}</td>
      <td>${formatCurrency(m.total)}</td>
      <td>${m.cnt}</td>
    </tr>
  `).join('');
  section.style.display = '';
  document.getElementById('merchantsBody_wrap').style.display = merchantsVisible ? '' : 'none';
  document.getElementById('merchantsToggleIcon').textContent = merchantsVisible ? '▲' : '▼';
}

// ─── Global person filter ─────────────────────────────────────────────────────

function setGlobalFilter(person) {
  globalPersonFilter = person;
  document.querySelectorAll('.global-filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.person === person));
  // reset per-chart filter so it doesn't confuse composition
  chartPersonFilter = 'all';
  document.querySelectorAll('.chart-filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.person === 'all'));
  applyGlobalFilter();
  // mark trends as stale; reload immediately if tab is visible
  trendsLoaded = false;
  const trendsTab = document.getElementById('tab-trends');
  if (trendsTab && !trendsTab.classList.contains('hidden')) {
    loadTrends();
  }
}

function applyGlobalFilter() {
  if (!_lastDashData) return;
  const gList = getGlobalFiltered(savedTxList);

  if (globalPersonFilter === 'all') {
    renderKPIs(_lastDashData);
    renderChartsFromData(_lastDashData);
    renderTopMerchants(_lastDashData);
  } else {
    const totalSpend = gList.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const byPaidBy = {};
    for (const t of gList) byPaidBy[t.paid_by] = (byPaidBy[t.paid_by] || 0) + (parseFloat(t.amount) || 0);
    renderKPIs({ totalSpend, transactionCount: gList.length, byPaidBy, settlement: null });
    renderChartsFromData(aggregateFromTxList(gList, _lastDashData));
    renderTopMerchantsFromList(gList);
  }

  // re-render grid rows (head stays, no filter reset)
  renderGridBody();
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
let selectedTxIds = new Set();

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
  selectedTxIds.clear();
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

function getGlobalFiltered(list) {
  if (globalPersonFilter === 'all') return list;
  if (globalPersonFilter === 'Common') return list.filter(t => t.expense_type === 'Common_50_50');
  return list.filter(t => t.paid_by === globalPersonFilter);
}

function getFilteredList() {
  return getGlobalFiltered(savedTxList).filter(tx => {
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
  const filtered = getFilteredList();
  const allSelected = filtered.length > 0 && filtered.every(t => selectedTxIds.has(t.id));
  const someSelected = filtered.some(t => selectedTxIds.has(t.id));
  const checkboxTh = `<th class="th-cb"><input type="checkbox" class="tx-cb" title="Select all" ${allSelected ? 'checked' : ''} ${someSelected && !allSelected ? 'data-indeterminate="true"' : ''} onchange="toggleSelectAll(this.checked)" /></th>`;
  const sortHtml = checkboxTh + cols.map(col => {
    const active = txSort.col === col.key;
    const icon = active
      ? `<span class="sort-icon active">${txSort.dir === 'asc' ? '▲' : '▼'}</span>`
      : `<span class="sort-icon idle">↕</span>`;
    return `<th class="sortable${active ? ' sorted' : ''}" onclick="txSortBy('${col.key}')">${col.label}${icon}</th>`;
  }).join('') + '<th class="th-actions"></th>';
  const sortTr = document.createElement('tr');
  sortTr.innerHTML = sortHtml;
  // Set indeterminate state on the checkbox (can't do in HTML)
  const cb = sortTr.querySelector('.tx-cb');
  if (cb && someSelected && !allSelected) cb.indeterminate = true;
  thead.appendChild(sortTr);

  if (!filtersVisible) return;

  // ── Filter row (DOM-built for interactive dropdowns) ───────────────────────
  const filterTr = document.createElement('tr');
  filterTr.className = 'filter-row';

  // Empty cell for checkbox column
  const cbFilterTh = document.createElement('th');
  cbFilterTh.className = 'filter-th th-cb';
  filterTr.appendChild(cbFilterTh);

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
    // Blanks/zeros always sort last regardless of direction
    const aEmpty = va === '' || va === null || va === undefined;
    const bEmpty = vb === '' || vb === null || vb === undefined;
    if (aEmpty && bEmpty) return a.id - b.id;
    if (aEmpty) return 1;
    if (bEmpty) return -1;

    let cmp;
    if (txSort.col === 'amount') {
      cmp = (parseFloat(va) || 0) - (parseFloat(vb) || 0);
    } else if (txSort.col === 'date') {
      cmp = parseDateNum(String(va)) - parseDateNum(String(vb));
    } else {
      va = String(va).replace(/_/g, ' ').toLowerCase();
      vb = String(vb).replace(/_/g, ' ').toLowerCase();
      cmp = va < vb ? -1 : va > vb ? 1 : 0;
    }
    // Stable secondary sort by id when values are equal
    return (txSort.dir === 'asc' ? cmp : -cmp) || (a.id - b.id);
  });

  document.getElementById('savedTxBody').innerHTML = sorted.map(tx => {
    const checked = selectedTxIds.has(tx.id) ? 'checked' : '';
    const rowClass = selectedTxIds.has(tx.id) ? ' class="row-selected"' : '';
    const cbCell = `<td class="td-cb"><input type="checkbox" class="tx-cb" ${checked} onchange="toggleTxSelect(${tx.id}, this.checked)" /></td>`;
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
    return `<tr data-id="${tx.id}"${rowClass}>${cbCell}${cells}<td class="td-actions"><button class="btn-delete" onclick="deleteSavedTx(${tx.id})" title="Delete">×</button></td></tr>`;
  }).join('');
  updateBulkBar();
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
    // ── Chip-based inline dropdown — portal to body so it's never clipped ────
    const panel = document.createElement('div');
    panel.className = 'rv-combo-panel';
    panel.style.position = 'fixed';
    panel.style.zIndex = '9999';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'rv-combo-search';
    searchInput.placeholder = 'Search…';

    const list = document.createElement('div');
    list.className = 'rv-combo-list';

    panel.appendChild(searchInput);
    panel.appendChild(list);
    document.body.appendChild(panel);

    // Position panel below (or above) the cell
    const positionInlinePanel = () => {
      const r = cell.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const spaceAbove = r.top - 8;
      const panelH = Math.min(280, Math.max(spaceBelow, spaceAbove));
      panel.style.minWidth = Math.max(r.width, 180) + 'px';
      panel.style.maxHeight = panelH + 'px';
      panel.style.overflowY = 'auto';
      if (spaceBelow >= Math.min(180, spaceAbove)) {
        panel.style.top = (r.bottom + 2) + 'px';
        panel.style.bottom = '';
      } else {
        panel.style.bottom = (window.innerHeight - r.top + 2) + 'px';
        panel.style.top = '';
      }
      panel.style.left = Math.min(r.left, window.innerWidth - 200) + 'px';
    };

    const removePanel = () => { panel.remove(); };

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

    const origSaveVal = saveVal;
    const origCancelEdit = cancelEdit;
    const saveValP = (v) => { removePanel(); origSaveVal(v); };
    const cancelEditP = () => { removePanel(); origCancelEdit(); };

    list.addEventListener('mousedown', e => e.preventDefault());
    list.addEventListener('click', e => {
      const opt = e.target.closest('.rv-opt');
      if (opt) saveValP(opt.dataset.val);
    });

    searchInput.addEventListener('input', () => renderOpts(searchInput.value));

    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') { cancelEditP(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); highlight(1); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); highlight(-1); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const hi = list.querySelector('.rv-opt.hi');
        if (hi) saveValP(hi.dataset.val);
        else {
          const exact = (col.opts || []).find(o => String(o).toLowerCase() === searchInput.value.toLowerCase().trim());
          if (exact) saveValP(exact); else cancelEditP();
        }
        if (e.key === 'Tab') moveToNext(e.shiftKey);
      }
    });

    searchInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (cell.classList.contains('editing')) {
          const exact = (col.opts || []).find(o => String(o).toLowerCase() === searchInput.value.toLowerCase().trim());
          if (exact) saveValP(exact); else cancelEditP();
        }
      }, 150);
    });

    renderOpts('');
    positionInlinePanel();
    // Show chip placeholder in cell while editing
    cell.innerHTML = chipHtml(origVal || '') || '<span class="cell-empty">—</span>';
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

// ─── Add Row Modal ────────────────────────────────────────────────────────────

let addRowData = {};
let bulkEditValue = {};

function addTxRow() {
  const month = document.getElementById('monthPicker').value;
  const defaultDate = '1 ' + (month ? month.replace('_', ' ') : 'March 2026');
  addRowData = {
    date: defaultDate,
    amount: '',
    description: '',
    category: 'Others',
    paid_by: currentUserName || 'Pooja',
    expense_type: (currentUserName || 'Pooja') + '_Personal',
    payment_method: 'HDFC_Debit_Card',
    mood: '',
    impulse: '',
    remarks: ''
  };
  renderAddRowModal();
  document.getElementById('addRowModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('arm-description')?.focus(), 80);
}

function closeAddRowModal() {
  document.getElementById('addRowModal').classList.add('hidden');
}

function makeModalCombo(options, initialVal, field) {
  const searchable = options.length > 6;
  const wrap = document.createElement('div');
  wrap.className = 'rv-combo';

  const trigger = document.createElement('div');
  trigger.className = 'rv-combo-trigger';
  trigger.innerHTML = chipHtml(initialVal || '') + '<span class="rv-arrow">▾</span>';

  const panel = document.createElement('div');
  panel.className = 'rv-combo-panel hidden';

  let current = initialVal;
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
    addRowData[field] = val;
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
    document.querySelectorAll('.rv-combo-panel:not(.hidden)').forEach(p => p.classList.add('hidden'));
    renderOpts('');
    panel.classList.remove('hidden');
    if (searchInput) { searchInput.value = ''; searchInput.focus(); }
    setTimeout(() => list.querySelector('.cur')?.scrollIntoView({ block: 'nearest' }), 0);
  };

  _attachPortalCombo(wrap, trigger, panel, searchInput, renderOpts, pick, highlight);
  return wrap;
}

function renderAddRowModal() {
  const d = addRowData;

  // Date field
  document.getElementById('arm-date').value = appDateToISO(d.date) || '';
  // Amount
  document.getElementById('arm-amount').value = d.amount || '';
  // Description
  document.getElementById('arm-description').value = d.description || '';
  // Remarks
  document.getElementById('arm-remarks').value = d.remarks || '';

  // Chip combos
  const combos = [
    ['arm-category',       CATEGORIES,                   'category'],
    ['arm-paid_by',        ['Pooja','Kunal'],             'paid_by'],
    ['arm-expense_type',   EXPENSE_TYPES,                'expense_type'],
    ['arm-payment_method', PAYMENT_METHODS,              'payment_method'],
    ['arm-mood',           MOODS,                        'mood'],
    ['arm-impulse',        IMPULSE_OPTIONS,              'impulse'],
  ];
  for (const [id, opts, field] of combos) {
    const cell = document.getElementById(id);
    cell.innerHTML = '';
    cell.appendChild(makeModalCombo(opts, d[field], field));
  }
}

async function submitAddRowModal() {
  const dateISO = document.getElementById('arm-date').value;
  const amount = parseFloat(document.getElementById('arm-amount').value);
  const description = document.getElementById('arm-description').value.trim();
  addRowData.remarks = document.getElementById('arm-remarks').value.trim();

  if (!dateISO) { document.getElementById('arm-date').focus(); return; }
  if (!amount || amount <= 0) { document.getElementById('arm-amount').focus(); return; }

  addRowData.date = isoToAppDate(dateISO);
  addRowData.amount = amount;
  addRowData.description = description;
  addRowData.month = clientMonthFromDate(addRowData.date);

  const saveBtn = document.getElementById('arm-save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: [addRowData] })
    });
    if (!res.ok) {
      if (res.status === 401 || res.headers.get('content-type')?.includes('text/html')) {
        alert('Session expired — please reload the page and sign in again.');
      } else {
        alert('Server error ' + res.status);
      }
      return;
    }
    const data = await res.json();
    closeAddRowModal();
    loadDashboard(document.getElementById('monthPicker').value);
  } catch (e) {
    alert('Failed to save: ' + e.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
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

// ─── Selection ────────────────────────────────────────────────────────────────

function toggleTxSelect(id, checked) {
  if (checked) selectedTxIds.add(id);
  else selectedTxIds.delete(id);
  // Update row highlight
  const row = document.querySelector(`#savedTxBody tr[data-id="${id}"]`);
  if (row) row.classList.toggle('row-selected', checked);
  // Update header checkbox indeterminate state
  updateBulkBar();
  const headerCb = document.querySelector('#savedTxHead .tx-cb');
  if (headerCb) {
    const filtered = getFilteredList();
    const allSel = filtered.length > 0 && filtered.every(t => selectedTxIds.has(t.id));
    const someSel = filtered.some(t => selectedTxIds.has(t.id));
    headerCb.checked = allSel;
    headerCb.indeterminate = someSel && !allSel;
  }
}

function toggleSelectAll(checked) {
  const filtered = getFilteredList();
  filtered.forEach(t => checked ? selectedTxIds.add(t.id) : selectedTxIds.delete(t.id));
  renderGridBody();
}

function clearSelection() {
  selectedTxIds.clear();
  renderGrid();
}

function updateBulkBar() {
  const bar = document.getElementById('bulkActionsBar');
  const count = selectedTxIds.size;
  if (count === 0) {
    bar.classList.add('hidden');
  } else {
    bar.classList.remove('hidden');
    document.getElementById('bulkSelCount').textContent = `${count} selected`;
  }
}

// ─── Confirmation Modal ───────────────────────────────────────────────────────

let _confirmAction = null;

function showConfirmModal(title, message, subMessage, btnLabel, action) {
  _confirmAction = action;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmSubMessage').textContent = subMessage || '';
  document.getElementById('confirmOkBtn').textContent = btnLabel || 'Delete';
  document.getElementById('confirmModal').classList.remove('hidden');
}

function closeConfirmModal() {
  _confirmAction = null;
  document.getElementById('confirmModal').classList.add('hidden');
}

function runConfirmAction() {
  const action = _confirmAction;
  closeConfirmModal();
  if (action) action();
}

// ─── Delete ───────────────────────────────────────────────────────────────────

function deleteSavedTx(id) {
  const tx = savedTxList.find(t => t.id === id);
  const desc = tx?.description || 'this transaction';
  showConfirmModal(
    'Delete transaction',
    `Delete "${desc}"?`,
    'This cannot be undone.',
    'Delete',
    () => doDeleteTx([id])
  );
}

function bulkDeleteSelected() {
  const count = selectedTxIds.size;
  if (!count) return;
  showConfirmModal(
    'Delete transactions',
    `Delete ${count} selected transaction${count !== 1 ? 's' : ''}?`,
    'This cannot be undone.',
    `Delete ${count}`,
    () => doDeleteTx([...selectedTxIds])
  );
}

async function doDeleteTx(ids) {
  try {
    await Promise.all(ids.map(id => fetch(`/api/transactions/${id}`, { method: 'DELETE' })));
    ids.forEach(id => {
      savedTxList = savedTxList.filter(t => t.id !== id);
      selectedTxIds.delete(id);
    });
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

// ─── Bulk Edit ────────────────────────────────────────────────────────────────

const BULK_EDITABLE_COLS = TX_COLS.filter(c => c.key !== 'date' && c.key !== 'amount');

function openBulkEditModal() {
  if (!selectedTxIds.size) return;
  const sel = document.getElementById('beField');
  sel.innerHTML = BULK_EDITABLE_COLS.map(c =>
    `<option value="${c.key}">${c.label}</option>`
  ).join('');
  renderBulkEditValue();
  document.getElementById('bulkEditModal').classList.remove('hidden');
}

function closeBulkEditModal() {
  document.getElementById('bulkEditModal').classList.add('hidden');
}

function renderBulkEditValue() {
  const field = document.getElementById('beField').value;
  const col = TX_COLS.find(c => c.key === field);
  const wrap = document.getElementById('beValueWrap');
  wrap.innerHTML = '';
  bulkEditValue = {};
  if (col.type === 'select') {
    const opts = col.opts || [];
    bulkEditValue[field] = opts[0] || '';
    // Use a special combo that writes into bulkEditValue
    const combo = makeBulkEditCombo(opts, opts[0] || '', field);
    wrap.appendChild(combo);
  } else {
    const inp = document.createElement('input');
    inp.className = 'arm-input';
    inp.id = 'beTextVal';
    inp.type = col.type === 'number' ? 'number' : 'text';
    inp.placeholder = 'New value…';
    wrap.appendChild(inp);
  }
  const count = selectedTxIds.size;
  document.getElementById('beApplyBtn').textContent = `Apply to ${count} row${count !== 1 ? 's' : ''}`;
}

function makeBulkEditCombo(options, initialVal, field) {
  // Same as makeModalCombo but writes to bulkEditValue instead of addRowData
  const searchable = options.length > 6;
  const wrap = document.createElement('div');
  wrap.className = 'rv-combo';

  const trigger = document.createElement('div');
  trigger.className = 'rv-combo-trigger';
  trigger.innerHTML = chipHtml(initialVal || '') + '<span class="rv-arrow">▾</span>';

  const panel = document.createElement('div');
  panel.className = 'rv-combo-panel hidden';

  let current = initialVal;
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
    bulkEditValue[field] = val;
  };

  const highlight = (delta) => {
    const opts = [...list.querySelectorAll('.rv-opt')];
    if (!opts.length) return;
    opts[highlighted]?.classList.remove('hi');
    highlighted = Math.max(0, Math.min(opts.length - 1, highlighted + delta));
    opts[highlighted]?.classList.add('hi');
    opts[highlighted]?.scrollIntoView({ block: 'nearest' });
  };

  _attachPortalCombo(wrap, trigger, panel, searchInput, renderOpts, pick, highlight);
  return wrap;
}

async function submitBulkEdit() {
  const field = document.getElementById('beField').value;
  const col = TX_COLS.find(c => c.key === field);
  let value;
  if (col.type === 'select') {
    value = bulkEditValue[field] ?? (col.opts || [])[0] ?? '';
  } else {
    value = document.getElementById('beTextVal')?.value ?? '';
  }

  const ids = [...selectedTxIds];
  const btn = document.getElementById('beApplyBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    await Promise.all(ids.map(id => {
      const existing = savedTxList.find(t => t.id === id) || {};
      return fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...existing, [field]: value })
      });
    }));
    ids.forEach(id => {
      const tx = savedTxList.find(t => t.id === id);
      if (tx) tx[field] = value;
    });
    closeBulkEditModal();
    renderGrid();
    trendsLoaded = false;
  } catch (err) {
    alert('Failed to update: ' + err.message);
  } finally {
    btn.disabled = false;
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
    const personParam = globalPersonFilter !== 'all'
      ? `?person=${encodeURIComponent(globalPersonFilter)}`
      : '';
    const res = await fetch(`/api/trends${personParam}`);
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();

    if (!data.months || data.months.length === 0) {
      document.getElementById('trendsEmpty').classList.remove('hidden');
      return;
    }
    document.getElementById('trendsEmpty').classList.add('hidden');

    renderTrendsSummaryTable(data);
    renderCategoryBreakdownTable(data);
    renderCreditCardPaymentsTable(data);
    renderPaymentMethodTable(data);
    renderTopCategoriesChart(data);
    trendsLoaded = true;
  } catch (err) {
    console.error('loadTrends error:', err);
  }
}

function renderCategoryBreakdownTable(data) {
  _catBreakdownData = { ...data.categoryBreakdown, months: data.months };
  if (!_catBreakdownData.categories.length) return;
  _renderCatHead();
  _renderCatBody();
  document.getElementById('trendsCategoryFoot').innerHTML = '';
  document.getElementById('trendsCategorySection').style.display = '';
  requestAnimationFrame(_fixCatTotalSticky);
}

function _renderCatHead() {
  const { months, categories, byMonth } = _catBreakdownData;
  const si = col => `<span class="cat-sort-icon">${_catSortCol === col ? (_catSortDir === 'asc' ? '▲' : '▼') : '↕'}</span>`;
  const thClass = col => `class="sortable${_catSortCol === col ? ' cat-col-sorted' : ''}"`;

  // Compute month totals for frozen total row
  const monthSums = months.map(m => {
    const md = byMonth[m] || {};
    return categories.reduce((s, c) => s + (md[c] || 0), 0);
  });
  const grandTotal = monthSums.reduce((s, v) => s + v, 0);

  document.getElementById('trendsCategoryHead').innerHTML = `
    <tr>
      <th ${thClass('name')} onclick="catSortBy('name')">Category ${si('name')}</th>
      ${months.map(m => `<th ${thClass(m)} onclick="catSortBy('${m}')">${esc(formatMonthLabel(m))} ${si(m)}</th>`).join('')}
      <th ${thClass('total')} onclick="catSortBy('total')">Total ${si('total')}</th>
    </tr>
    <tr class="cat-total-row">
      <td><strong>Total</strong></td>
      ${monthSums.map(s => `<td><strong>${formatCurrency(s)}</strong></td>`).join('')}
      <td><strong>${formatCurrency(grandTotal)}</strong></td>
    </tr>`;
}

function _renderCatBody() {
  const { categories, byMonth, totals, months } = _catBreakdownData;
  const q = (document.getElementById('catSearch')?.value || '').toLowerCase().trim();
  let list = q ? categories.filter(c => c.toLowerCase().includes(q)) : [...categories];

  list.sort((a, b) => {
    if (_catSortCol === 'name') {
      const r = a.toLowerCase().localeCompare(b.toLowerCase());
      return _catSortDir === 'asc' ? r : -r;
    }
    const va = _catSortCol === 'total' ? (totals[a] || 0) : ((byMonth[_catSortCol] && byMonth[_catSortCol][a]) || 0);
    const vb = _catSortCol === 'total' ? (totals[b] || 0) : ((byMonth[_catSortCol] && byMonth[_catSortCol][b]) || 0);
    return _catSortDir === 'asc' ? va - vb : vb - va;
  });

  document.getElementById('trendsCategoryBody').innerHTML = list.map(cat => `<tr>
    <td>${esc(cat)}</td>
    ${months.map(m => `<td>${formatCurrency((byMonth[m] && byMonth[m][cat]) || 0)}</td>`).join('')}
    <td><strong>${formatCurrency(totals[cat] || 0)}</strong></td>
  </tr>`).join('');
}

function catSortBy(col) {
  if (!_catBreakdownData) return;
  if (_catSortCol === col) { _catSortDir = _catSortDir === 'asc' ? 'desc' : 'asc'; }
  else { _catSortCol = col; _catSortDir = col === 'name' ? 'asc' : 'desc'; }
  _renderCatHead();
  _renderCatBody();
  requestAnimationFrame(_fixCatTotalSticky);
}

function filterCategoryTable() {
  if (!_catBreakdownData) return;
  _renderCatBody();
}

function _fixCatTotalSticky() {
  const table = document.getElementById('trendsCategoryTable');
  if (!table || !table.tHead || table.tHead.rows.length < 2) return;
  const h = table.tHead.rows[0].getBoundingClientRect().height;
  Array.from(table.tHead.rows[1].cells).forEach(td => { td.style.top = h + 'px'; });
}

function renderCreditCardPaymentsTable(data) {
  const { creditCardPayments, months } = data;
  const section = document.getElementById('trendsCCSection');
  const hasAny = months.some(m => creditCardPayments[m]);
  if (!hasAny) { section.style.display = 'none'; return; }

  document.getElementById('trendsCCHead').innerHTML = `<tr>
    <th>Month</th><th>Amount Paid</th><th>Transactions</th>
  </tr>`;

  let grandTotal = 0, grandCnt = 0;
  document.getElementById('trendsCCBody').innerHTML = [...months].reverse().map(m => {
    const r = creditCardPayments[m] || { total: 0, cnt: 0 };
    grandTotal += r.total; grandCnt += r.cnt;
    return `<tr>
      <td><strong>${esc(m.replace('_', ' '))}</strong></td>
      <td>${formatCurrency(r.total)}</td>
      <td>${r.cnt}</td>
    </tr>`;
  }).join('');

  document.getElementById('trendsCCFoot').innerHTML = `<tr>
    <td><strong>Total</strong></td>
    <td><strong>${formatCurrency(grandTotal)}</strong></td>
    <td><strong>${grandCnt}</strong></td>
  </tr>`;

  section.style.display = '';
}

function renderPaymentMethodTable(data) {
  const { methods, byMonth, totals } = data.byPaymentMethod;
  const months = data.months;
  if (!methods.length) return;

  document.getElementById('trendsPaymentMethodHead').innerHTML = `<tr>
    <th>Payment Method</th>
    ${months.map(m => `<th>${esc(formatMonthLabel(m))}</th>`).join('')}
    <th><strong>Total</strong></th>
  </tr>`;

  document.getElementById('trendsPaymentMethodBody').innerHTML = methods.map(pm => {
    const cells = months.map(m => `<td>${formatCurrency((byMonth[m] && byMonth[m][pm]) || 0)}</td>`).join('');
    return `<tr>
      <td>${esc(pm)}</td>
      ${cells}
      <td><strong>${formatCurrency(totals[pm] || 0)}</strong></td>
    </tr>`;
  }).join('');

  const monthSums = months.map(m => {
    const md = byMonth[m] || {};
    return methods.reduce((s, pm) => s + (md[pm] || 0), 0);
  });
  const grandTotal = monthSums.reduce((s, v) => s + v, 0);
  document.getElementById('trendsPaymentMethodFoot').innerHTML = `<tr>
    <td><strong>Total</strong></td>
    ${monthSums.map(s => `<td><strong>${formatCurrency(s)}</strong></td>`).join('')}
    <td><strong>${formatCurrency(grandTotal)}</strong></td>
  </tr>`;

  document.getElementById('trendsPaymentMethodSection').style.display = '';
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

// ── Salary Tab ───────────────────────────────────────────────────────────────

let _salaryInited = false;

function initSalaryTab() {
  const picker = document.getElementById('salaryMonthPicker');
  if (!picker.options.length) {
    // Populate same months as dashboard picker
    const dp = document.getElementById('monthPicker');
    Array.from(dp.options).forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value; opt.textContent = o.textContent;
      picker.appendChild(opt);
    });
    picker.value = dp.value || picker.options[0]?.value || '';
  }
  loadSalaryForMonth();
  if (!_salaryInited) { loadSalaryHistory(); _salaryInited = true; }
}

async function loadSalaryForMonth() {
  const month = document.getElementById('salaryMonthPicker').value;
  if (!month) return;
  try {
    const res = await fetch(`/api/salary?month=${encodeURIComponent(month)}`);
    const data = await res.json();
    document.getElementById('salaryPooja').value = data.Pooja || '';
    document.getElementById('salaryKunal').value = data.Kunal || '';
    document.getElementById('salaryPoojaNote').value = data.notes?.Pooja || '';
    document.getElementById('salaryKunalNote').value = data.notes?.Kunal || '';
  } catch (e) { console.error(e); }
}

async function saveSalary() {
  const month = document.getElementById('salaryMonthPicker').value;
  const Pooja = document.getElementById('salaryPooja').value;
  const Kunal = document.getElementById('salaryKunal').value;
  const notes = {
    Pooja: document.getElementById('salaryPoojaNote').value,
    Kunal: document.getElementById('salaryKunalNote').value
  };
  const msg = document.getElementById('salarySaveMsg');
  try {
    await fetch('/api/salary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, Pooja, Kunal, notes })
    });
    msg.textContent = '✓ Saved';
    setTimeout(() => msg.textContent = '', 2500);
    _salaryInited = false;
    loadSalaryHistory();
  } catch (e) { msg.textContent = 'Error saving'; }
}

async function loadSalaryHistory() {
  try {
    const [salRes, trendsRes] = await Promise.all([
      fetch('/api/salary'),
      fetch('/api/trends')
    ]);
    const salData = await salRes.json();
    const trendsData = await trendsRes.json();

    const spendByMonth = {};
    trendsData.monthlyTotals?.forEach((r, i) => {
      spendByMonth[trendsData.months[i]] = r.total;
    });

    const months = Object.keys(salData.history || {});
    if (!months.length) return;

    const tbody = document.getElementById('salaryHistoryBody');
    tbody.innerHTML = [...months].reverse().map(m => {
      const s = salData.history[m];
      const combined = (s.Pooja || 0) + (s.Kunal || 0);
      const spend = spendByMonth[m] || 0;
      const savings = combined - spend;
      const savingsPct = combined > 0 ? Math.round((savings / combined) * 100) : null;
      const savClass = !combined ? '' : savings >= 0 ? 'savings-positive' : 'savings-negative';
      const note = [s.notes?.Pooja, s.notes?.Kunal].filter(Boolean).join(' / ');
      return `<tr>
        <td><strong>${esc(m.replace('_', ' '))}</strong>${note ? `<br><span style="font-size:11px;color:var(--text-muted)">${esc(note)}</span>` : ''}</td>
        <td>${s.Pooja ? formatCurrency(s.Pooja) : '—'}</td>
        <td>${s.Kunal ? formatCurrency(s.Kunal) : '—'}</td>
        <td>${combined ? formatCurrency(combined) : '—'}</td>
        <td>${spend ? formatCurrency(spend) : '—'}</td>
        <td class="${savClass}">${combined ? formatCurrency(savings) : '—'}</td>
        <td class="${savClass}">${savingsPct !== null ? savingsPct + '%' : '—'}</td>
      </tr>`;
    }).join('');

    document.getElementById('salaryHistorySection').style.display = '';
  } catch (e) { console.error(e); }
}

// ── Ask AI ────────────────────────────────────────────────────────────────────

let _activeAiChip = null;

function askChip(btn) {
  if (_activeAiChip) _activeAiChip.classList.remove('active');
  _activeAiChip = btn;
  btn.classList.add('active');
  document.getElementById('aiInput').value = btn.textContent;
  submitAsk();
}

async function submitAsk() {
  const input = document.getElementById('aiInput');
  const question = input.value.trim();
  if (!question) return;

  const responseEl = document.getElementById('aiResponse');
  const btn = document.getElementById('aiBtn');
  responseEl.textContent = 'Thinking…';
  responseEl.classList.remove('hidden');
  responseEl.classList.add('loading');
  btn.disabled = true;

  const month = document.getElementById('monthPicker')?.value || '';

  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, month })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    responseEl.classList.remove('loading');
    responseEl.innerHTML = formatAiResponse(data.answer);
  } catch (err) {
    responseEl.classList.remove('loading');
    responseEl.textContent = 'Something went wrong. Please try again.';
  } finally {
    btn.disabled = false;
  }
}

function formatAiResponse(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-•] /gm, '• ')
    .replace(/\n/g, '<br>');
}

// ── PWA Service Worker Registration ──────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
