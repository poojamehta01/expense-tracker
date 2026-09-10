const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { generateExtractionContent } = require('../server');

const root = path.join(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');

test('Gemini file extraction has a bounded server-side request timeout', () => {
  assert.match(serverSource, /generateContent\([\s\S]*\{\s*timeout:\s*EXTRACTION_TIMEOUT_MS\s*\}\s*\)/);
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

test('extraction retries transient capacity errors then falls back to the stable model', async () => {
  const calls = [];
  const attempts = new Map();
  const ai = {
    getGenerativeModel({ model }) {
      return {
        async generateContent(parts, options) {
          calls.push({ model, parts, options });
          const attempt = (attempts.get(model) || 0) + 1;
          attempts.set(model, attempt);
          if (model === 'gemini-3.8-flash') {
            const error = new Error('[503 Service Unavailable] high demand');
            error.status = 503;
            throw error;
          }
          return { response: { text: () => '[]' } };
        }
      };
    }
  };

  const result = await generateExtractionContent(['statement'], ai, async () => {});

  assert.equal(result.response.text(), '[]');
  assert.deepEqual(calls.map(call => call.model), [
    'gemini-3.8-flash',
    'gemini-3.8-flash',
    'gemini-3.6-flash'
  ]);
  assert.ok(calls.every(call => call.options.timeout > 0));
});

test('extraction does not retry non-transient Gemini errors', async () => {
  let calls = 0;
  const ai = {
    getGenerativeModel() {
      return {
        async generateContent() {
          calls++;
          const error = new Error('[400 Bad Request] invalid input');
          error.status = 400;
          throw error;
        }
      };
    }
  };

  await assert.rejects(
    generateExtractionContent(['statement'], ai, async () => {}),
    /400 Bad Request/
  );
  assert.equal(calls, 1);
});
