let investmentData = null;
let investmentEditId = null;
let investmentBusy = false;
let investmentVersion = 0;
const investmentElement = id => document.getElementById(id);
const investmentCurrency = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);

const investmentGain = value => value == null ? '—' : `${value > 0 ? '+' : ''}${investmentCurrency(value)}`;
const investmentGainClass = value => value > 0 ? 'investment-gain' : value < 0 ? 'investment-loss' : '';

function investmentStatus(message, error = false) {
  const el = investmentElement('investmentStatus');
  el.textContent = message;
  el.className = error ? 'investment-status error' : 'investment-status';
}
async function investmentRequest(url, options) {
  const response = await fetch(url, options);
  if (response.redirected) throw new Error('Your session expired. Refresh and sign in again.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not update investments. Please try again.');
  return data;
}
function renderInvestments() {
  if (!investmentData) return;
  for (const [id, key] of [['investmentPooja', 'Pooja'], ['investmentKunal', 'Kunal'], ['investmentTotal', 'combined']]) {
    investmentElement(id).textContent = investmentCurrency(investmentData.totals[key]);
    const valuation = investmentData.valuations?.[key];
    investmentElement(id + 'Current').textContent = valuation?.currentValue == null ? 'Not added' : investmentCurrency(valuation.currentValue);
    const gain = investmentElement(id + 'Gain');
    gain.textContent = investmentGain(valuation?.gain);
    gain.className = investmentGainClass(valuation?.gain);
    investmentElement(id + 'Missing').textContent = valuation?.missing ? `${valuation.missing} current value${valuation.missing === 1 ? '' : 's'} missing` : '';
  }
  const person = globalPersonFilter;
  const entries = investmentData.entries.filter(item => person === 'all' || item.person === person);
  investmentElement('investmentCount').textContent = `${entries.length} investment${entries.length === 1 ? '' : 's'} · ${person === 'all' ? 'Everyone' : person}`;
  investmentElement('investmentRows').innerHTML = entries.length ? entries.map(item => `
    <tr><td>${esc(item.name)}</td><td>${esc(item.person)}</td><td class="investment-amount">${investmentCurrency(item.amount)}</td>
    <td class="investment-amount">${item.currentValue == null ? 'Not added' : investmentCurrency(item.currentValue)}</td>
    <td class="investment-amount ${investmentGainClass(item.gain)}">${investmentGain(item.gain)}</td>
    <td class="investment-actions"><button type="button" class="btn-secondary" onclick="editInvestment(${item.id})" ${investmentBusy ? 'disabled' : ''} aria-label="Edit ${esc(item.name)}">Edit</button>
    <button type="button" class="btn-secondary" onclick="deleteInvestment(${item.id})" ${investmentBusy ? 'disabled' : ''} aria-label="Delete ${esc(item.name)}">Delete</button></td></tr>`).join('') :
    `<tr><td colspan="6" class="investment-empty">${person === 'Common' ? 'No common investments. Each investment belongs to Pooja or Kunal.' : person === 'all' ? 'No investments yet. Add your first lump-sum investment above.' : `No investments for ${esc(person)} yet.`}</td></tr>`;
}
async function loadInvestments() {
  if (investmentBusy) return;
  const version = ++investmentVersion;
  investmentStatus('Loading investments…');
  try {
    const data = await investmentRequest('/api/investments');
    if (version !== investmentVersion) return;
    investmentData = data;
    renderInvestments();
    investmentStatus('');
  } catch (error) {
    if (version === investmentVersion) investmentStatus('Could not load investments. Use Refresh to try again.', true);
  }
}
function resetInvestmentForm() {
  if (investmentBusy) return;
  investmentEditId = null;
  investmentElement('investmentForm').reset();
  investmentElement('investmentSave').textContent = 'Add investment';
  investmentElement('investmentFormTitle').textContent = 'Add investment';
  investmentElement('investmentCancel').hidden = true;
}
function editInvestment(id) {
  if (investmentBusy) return;
  const entry = investmentData?.entries.find(item => item.id === id);
  if (!entry) return;
  investmentEditId = id;
  investmentElement('investmentName').value = entry.name;
  investmentElement('investmentPerson').value = entry.person;
  investmentElement('investmentAmount').value = entry.amount;
  investmentElement('investmentCurrentValue').value = entry.currentValue ?? '';
  investmentElement('investmentSave').textContent = 'Save changes';
  investmentElement('investmentFormTitle').textContent = 'Edit investment';
  investmentElement('investmentCancel').hidden = false;
  investmentElement('investmentName').focus();
  investmentStatus('');
}
function setInvestmentBusy(busy) {
  investmentBusy = busy;
  investmentElement('investmentFields').disabled = busy;
  investmentElement('investmentRefresh').disabled = busy;
  renderInvestments();
}
async function saveInvestment(event) {
  event.preventDefault();
  if (investmentBusy || !investmentElement('investmentForm').reportValidity()) return;
  const currentValue = investmentElement('investmentCurrentValue').value.trim();
  const input = { currentValue: currentValue === '' ? null : Number(currentValue), name: investmentElement('investmentName').value.trim(), person: investmentElement('investmentPerson').value, amount: Number(investmentElement('investmentAmount').value) };
  const editing = investmentEditId !== null;
  ++investmentVersion;
  setInvestmentBusy(true);
  investmentStatus('Saving…');
  try {
    investmentData = await investmentRequest(editing ? `/api/investments/${investmentEditId}` : '/api/investments', {
      method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    setInvestmentBusy(false);
    resetInvestmentForm();
    investmentStatus(editing ? 'Investment updated.' : 'Investment added.');
  } catch (error) {
    investmentStatus(error.message, true);
  } finally {
    setInvestmentBusy(false);
  }
}
async function deleteInvestment(id) {
  if (investmentBusy) return;
  const entry = investmentData?.entries.find(item => item.id === id);
  if (!entry || !confirm(`Delete “${entry.name}” (${investmentCurrency(entry.amount)}) for ${entry.person}?`)) return;
  ++investmentVersion;
  setInvestmentBusy(true);
  investmentStatus('Deleting…');
  try {
    investmentData = await investmentRequest(`/api/investments/${id}`, { method: 'DELETE' });
    setInvestmentBusy(false);
    if (investmentEditId === id) resetInvestmentForm();
    investmentStatus('Investment deleted.');
  } catch (error) {
    investmentStatus(error.message, true);
  } finally {
    setInvestmentBusy(false);
  }
}
