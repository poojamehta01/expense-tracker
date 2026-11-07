let kunalOwesPoojaData = null;
let kunalOwesPoojaEditId = null;
let kunalOwesPoojaBusy = false;
let kunalOwesPoojaVersion = 0;

const debtElement = id => document.getElementById(id);
const debtCurrency = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function debtStatus(message, error = false) {
  const el = debtElement('debtStatus');
  el.textContent = message;
  el.className = error ? 'debt-status error' : 'debt-status';
}

async function debtRequest(url, options) {
  const response = await fetch(url, options);
  if (response.redirected) throw new Error('Your session expired. Refresh and sign in again.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not update expenses. Please try again.');
  return data;
}

function debtToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function debtDateLabel(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf())
    ? esc(value)
    : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function renderKunalOwesPooja() {
  if (!kunalOwesPoojaData) return;
  const { entries, pendingCount, totalPending } = kunalOwesPoojaData;
  debtElement('debtTotalPending').textContent = debtCurrency(totalPending);
  debtElement('debtPendingCount').textContent = `${pendingCount} pending expense${pendingCount === 1 ? '' : 's'}`;

  const showSettled = debtElement('debtShowSettled').checked;
  const visible = entries.filter(entry => showSettled || entry.status === 'pending');
  debtElement('debtEntryCount').textContent = showSettled
    ? `${visible.length} shown · ${pendingCount} pending`
    : `${visible.length} pending expense${visible.length === 1 ? '' : 's'}`;
  debtElement('debtRows').innerHTML = visible.length ? visible.map(entry => {
    const settled = entry.status === 'settled';
    const statusLabel = settled ? 'Settled' : 'Pending';
    const statusClass = settled ? 'debt-pill debt-pill--settled' : 'debt-pill';
    const statusAction = settled ? 'pending' : 'settled';
    const statusActionLabel = settled ? 'Reopen' : 'Mark settled';
    return `<tr>
      <td class="debt-date">${debtDateLabel(entry.date)}</td>
      <td class="debt-description">${esc(entry.description)}</td>
      <td class="debt-amount">${debtCurrency(entry.amount)}</td>
      <td><span class="${statusClass}">${statusLabel}</span></td>
      <td class="debt-actions">
        <button type="button" class="btn-secondary" onclick="setKunalOwesPoojaStatus(${entry.id}, '${statusAction}')" ${kunalOwesPoojaBusy ? 'disabled' : ''}>${statusActionLabel}</button>
        <button type="button" class="btn-secondary" onclick="editKunalOwesPoojaExpense(${entry.id})" ${kunalOwesPoojaBusy ? 'disabled' : ''}>Edit</button>
        <button type="button" class="btn-secondary" onclick="deleteKunalOwesPoojaExpense(${entry.id})" ${kunalOwesPoojaBusy ? 'disabled' : ''}>Delete</button>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="5" class="debt-empty">${showSettled
    ? 'No expenses to show yet. Add a past expense above.'
    : 'No pending expenses yet. Add past expenses above to build the total.'}</td></tr>`;
}

async function loadKunalOwesPooja() {
  if (kunalOwesPoojaBusy) return;
  const version = ++kunalOwesPoojaVersion;
  debtStatus('Loading expenses…');
  try {
    const data = await debtRequest('/api/kunal-owes-pooja');
    if (version !== kunalOwesPoojaVersion) return;
    kunalOwesPoojaData = data;
    renderKunalOwesPooja();
    debtStatus('');
  } catch (error) {
    if (version === kunalOwesPoojaVersion) debtStatus('Could not load expenses. Use Refresh to try again.', true);
  }
}

function resetKunalOwesPoojaForm() {
  if (kunalOwesPoojaBusy) return;
  kunalOwesPoojaEditId = null;
  debtElement('debtForm').reset();
  debtElement('debtDate').value = debtToday();
  debtElement('debtSave').textContent = 'Add expense';
  debtElement('debtCancel').hidden = true;
  debtElement('debtFormTitle').textContent = 'Add a past expense';
}

function editKunalOwesPoojaExpense(id) {
  if (kunalOwesPoojaBusy) return;
  const entry = kunalOwesPoojaData?.entries.find(item => item.id === id);
  if (!entry) return;
  kunalOwesPoojaEditId = id;
  debtElement('debtDate').value = entry.date;
  debtElement('debtDescription').value = entry.description;
  debtElement('debtAmount').value = entry.amount;
  debtElement('debtSave').textContent = 'Save changes';
  debtElement('debtCancel').hidden = false;
  debtElement('debtFormTitle').textContent = 'Edit expense';
  debtElement('debtDescription').focus();
  debtStatus('');
}

function setKunalOwesPoojaBusy(busy) {
  kunalOwesPoojaBusy = busy;
  debtElement('debtFields').disabled = busy;
  debtElement('debtRefresh').disabled = busy;
  debtElement('debtShowSettled').disabled = busy;
  renderKunalOwesPooja();
}

async function saveKunalOwesPoojaExpense(event) {
  event.preventDefault();
  const form = debtElement('debtForm');
  if (kunalOwesPoojaBusy || !form.reportValidity()) return;
  const input = {
    date: debtElement('debtDate').value,
    description: debtElement('debtDescription').value.trim(),
    amount: Number(debtElement('debtAmount').value),
  };
  const editing = kunalOwesPoojaEditId !== null;
  const editId = kunalOwesPoojaEditId;
  ++kunalOwesPoojaVersion;
  setKunalOwesPoojaBusy(true);
  debtStatus('Saving…');
  try {
    kunalOwesPoojaData = await debtRequest(editing ? `/api/kunal-owes-pooja/${editId}` : '/api/kunal-owes-pooja', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    setKunalOwesPoojaBusy(false);
    resetKunalOwesPoojaForm();
    debtStatus(editing ? 'Expense updated.' : 'Expense added.');
  } catch (error) {
    debtStatus(error.message, true);
  } finally {
    setKunalOwesPoojaBusy(false);
  }
}

async function setKunalOwesPoojaStatus(id, status) {
  if (kunalOwesPoojaBusy) return;
  ++kunalOwesPoojaVersion;
  setKunalOwesPoojaBusy(true);
  debtStatus(status === 'settled' ? 'Marking expense settled…' : 'Reopening expense…');
  try {
    kunalOwesPoojaData = await debtRequest(`/api/kunal-owes-pooja/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    });
    debtStatus(status === 'settled' ? 'Expense marked settled.' : 'Expense reopened.');
  } catch (error) {
    debtStatus(error.message, true);
  } finally {
    setKunalOwesPoojaBusy(false);
  }
}

async function deleteKunalOwesPoojaExpense(id) {
  if (kunalOwesPoojaBusy) return;
  const entry = kunalOwesPoojaData?.entries.find(item => item.id === id);
  if (!entry || !confirm(`Delete “${entry.description}” (${debtCurrency(entry.amount)})?`)) return;
  ++kunalOwesPoojaVersion;
  setKunalOwesPoojaBusy(true);
  debtStatus('Deleting expense…');
  try {
    kunalOwesPoojaData = await debtRequest(`/api/kunal-owes-pooja/${id}`, { method: 'DELETE' });
    setKunalOwesPoojaBusy(false);
    if (kunalOwesPoojaEditId === id) resetKunalOwesPoojaForm();
    debtStatus('Expense deleted.');
  } catch (error) {
    debtStatus(error.message, true);
  } finally {
    setKunalOwesPoojaBusy(false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  debtElement('debtDate').value = debtToday();
});
