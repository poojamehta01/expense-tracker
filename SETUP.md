# Expense Tracker — Setup Guide

Two things to set up, takes ~15 minutes total.

---

## Part 1 — Google Apps Script (do this first)

### Step 1: Open your Google Sheet
Go to your expense tracker Google Sheet.

### Step 2: Open Apps Script
Click **Extensions → Apps Script** in the menu bar.

### Step 3: Paste the code
- Delete all existing code in the editor
- Open the file `apps-script.gs` from this project
- Copy everything and paste it into the Apps Script editor
- Click **Save** (Ctrl+S / Cmd+S)

### Step 4: Deploy as Web App
1. Click **Deploy → New deployment**
2. Click the gear icon ⚙️ next to "Select type" → choose **Web app**
3. Fill in:
   - Description: `Expense Tracker`
   - Execute as: **Me**
   - Who has access: **Anyone** (needed so the web app can call it)
4. Click **Deploy**
5. If asked, click **Authorize access** and approve with your Google account
6. **Copy the Web App URL** — it looks like:
   `https://script.google.com/macros/s/AKfycbxjf97EzU7NWTEFwgIaQFLB1-_ZLrQnfKWPcgMLgl-idFs-l8GU9Rxl_925UloW0m0b/exec`

> ⚠️ Important: Every time you change the Apps Script code, you must create a **New deployment** (not update existing) to get changes to take effect.

---

## Part 2 — Gemini API Key (free)

### Step 1: Get your free API key
1. Go to **https://aistudio.google.com/app/apikey**
2. Sign in with your Google account
3. Click **Create API key**
4. Copy the key (looks like `AIzaSyCO66-Xn-Jvnj7pazafUJG-7-Wm-_4O36c`)

Free tier limits: 15 requests/minute, 1 million tokens/day — more than enough for personal use.

---

## Part 3 — Run the web app locally

### Step 1: Install Node.js (if not installed)
Download from **https://nodejs.org** — install the LTS version.

Check it worked: open Terminal and run:
```
node --version
```

### Step 2: Set up the project
Open Terminal, then run:
```bash
cd ~/Documents/expenseTracker
npm install
```

### Step 3: Add your Gemini API key
```bash
cp .env.example .env
```
Open the `.env` file and replace `your_gemini_api_key_here` with your actual key:
```
GEMINI_API_KEY=AIzaSy...your actual key here...
PORT=3000
```

### Step 4: Start the app
```bash
npm start
```

You should see:
```
✅ Expense Tracker running at http://localhost:3000
```

Open **http://localhost:3000** in your browser.

---

## Part 4 — Connect everything in the app

1. In the app, paste your **Google Apps Script URL** into the URL field
2. Set the **Sheet Tab Name** to `March_2026` (or whichever month)
3. Click **Save**

---

## Daily use

1. Run `npm start` in Terminal (takes 2 seconds)
2. Go to http://localhost:3000
3. Drop in your screenshots/PDFs
4. Review the extracted transactions — fix anything wrong
5. Click **Push to Google Sheets**

---

## Troubleshooting

**"No transactions found"** — Try a clearer screenshot. Full transaction history page works better than single notification screens.

**Push fails with network error** — Double-check your Apps Script URL. Make sure it ends with `/exec`.

**Wrong tab error** — Make sure the tab name in the app exactly matches your sheet tab (e.g., `March_2026`).

**Gemini API error** — Check that your API key in `.env` is correct and has no extra spaces.
