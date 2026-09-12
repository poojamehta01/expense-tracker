function normalizeHouseholdPoolTransaction(transaction) {
  const tx = { ...transaction };
  if (tx.payment_method === 'SBI_Debit_Card') {
    tx.paid_by = 'Household Pool';
    tx.expense_type = 'Common_50_50';
  }
  return tx;
}

function calculateSettlement(settlementRows) {
  let kunalOwesPooja = 0;
  let poojaOwesKunal = 0;
  let commonSpend = 0;
  let poojaForKunal = 0;
  let kunalForPooja = 0;
  for (const row of settlementRows) {
    if (row.expense_type === 'Common_50_50') {
      commonSpend += row.total;
      if (row.paid_by === 'Pooja') kunalOwesPooja += row.total / 2;
      if (row.paid_by === 'Kunal') poojaOwesKunal += row.total / 2;
    } else if (row.expense_type === 'Pooja_for_Kunal') {
      poojaForKunal += row.total;
      kunalOwesPooja += row.total;
    } else if (row.expense_type === 'Kunal_for_Pooja') {
      kunalForPooja += row.total;
      poojaOwesKunal += row.total;
    }
  }
  return {
    kunalOwesPooja,
    poojaOwesKunal,
    net: kunalOwesPooja - poojaOwesKunal,
    commonSpend,
    poojaForKunal,
    kunalForPooja,
  };
}

module.exports = { normalizeHouseholdPoolTransaction, calculateSettlement };
