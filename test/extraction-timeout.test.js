const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');

test('Gemini file extraction has a bounded server-side request timeout', () => {
  const route = serverSource.slice(
    serverSource.indexOf("app.post('/api/extract'"),
    serverSource.indexOf("app.post('/api/extract-text'")
  );

  assert.match(route, /generateContent\([\s\S]*\{\s*timeout:\s*EXTRACTION_TIMEOUT_MS\s*\}\s*\)/);
  assert.match(serverSource, /const EXTRACTION_TIMEOUT_MS\s*=\s*\d+/);
});

test('browser file extraction aborts a stalled request and reports a retryable timeout', async () => {
  const start = appSource.indexOf('async function extractFromFile');
  const end = appSource.indexOf('// ─── CSV / XLSX Parsing', start);
  const requestedTimeouts = [];
  const context = vm.createContext({
    FormData: class { append() {} },
    AbortSignal: {
      timeout(ms) {
        requestedTimeouts.push(ms);
        return { timedOut: true };
      }
    },
    fetch: async (_url, options) => {
      assert.equal(options.signal.timedOut, true);
      const error = new Error('request aborted');
      error.name = 'TimeoutError';
      throw error;
    }
  });

  vm.runInContext(`${appSource.slice(start, end)}\nglobalThis.extractFromFileForTest = extractFromFile;`, context);

  await assert.rejects(
    context.extractFromFileForTest({}),
    /timed out.*retry/i
  );
  assert.equal(requestedTimeouts.length, 1);
  assert.ok(requestedTimeouts[0] > 0);
});
