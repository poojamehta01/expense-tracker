// Expense Tracker — Google Apps Script
// Paste this into Extensions → Apps Script in your Google Sheet
// Then deploy as Web App (see SETUP.md for instructions)

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const transactions = data.transactions;
    const sheetName = data.sheetName; // e.g. "March_2026"

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      return jsonResponse({ success: false, error: `Tab "${sheetName}" not found in this spreadsheet.` });
    }

    transactions.forEach(t => {
      sheet.appendRow([
        t.date,             // A: Date
        t.amount,           // B: Spending
        t.description,      // C: Description
        t.payment_method,   // D: Credit/Debit
        t.paid_by,          // E: Paid by
        t.expense_type,     // F: Expense_Type
        t.category,         // G: Category
        t.mood || '',       // H: Mood
        t.impulse || '',    // I: Impulse/Intentional
        t.remarks || ''     // J: Remarks
      ]);
    });

    return jsonResponse({ success: true, rowsAdded: transactions.length });

  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// Health check — visiting the URL in browser should show this
function doGet(e) {
  return jsonResponse({ status: 'Expense Tracker API is running ✅' });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
