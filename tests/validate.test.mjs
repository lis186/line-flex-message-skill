// validate.sh against a local fake api.line.me.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = new URL('../skills/line-flex-message/scripts/validate.sh', import.meta.url).pathname;
const TOKEN = 'tok-secret-flex';
const bubble = { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [] } };
const flex = { type: 'flex', altText: 'alt', contents: bubble };

const cleanups = [];
afterEach(() => { for (const fn of cleanups.splice(0)) fn(); });

function workdir() {
  const dir = mkdtempSync(join(tmpdir(), 'flex-validate-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function fakeLine(answers) {
  const seen = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      seen.push({ url: req.url, headers: req.headers, body: JSON.parse(raw) });
      const a = answers[Math.min(seen.length - 1, answers.length - 1)];
      res.writeHead(a.status, { 'content-type': 'application/json' }).end(JSON.stringify(a.body));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => { server.closeAllConnections(); server.close(); });
  return { base: `http://127.0.0.1:${server.address().port}`, seen };
}

// Store lookups (1Password, keychain) are disabled so the developer's real token never reaches the fake server.
function run(args, env) {
  const merged = { PATH: process.env.PATH, HOME: process.env.HOME, LINE_VALIDATE_NO_STORE: '1' };
  for (const [k, v] of Object.entries(env)) if (v !== undefined) merged[k] = v;
  return new Promise(resolve => {
    execFile('bash', [SCRIPT, ...args], { env: merged }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}

function writeInput(dir, records) {
  const file = join(dir, 'in.jsonl');
  writeFileSync(file, records.map(r => JSON.stringify(r)).join('\n') + '\n');
  return file;
}

test('200: valid=yes, exit 0, posts to validate/push with the token in Authorization', async () => {
  const line = await fakeLine([{ status: 200, body: {} }]);
  const dir = workdir();
  const r = await run([writeInput(dir, [{ messages: [flex] }]), join(dir, 'out.json')], { LINE_VALIDATE_TOKEN: TOKEN, LINE_VALIDATE_BASE: line.base });
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), 'valid=yes');
  assert.equal(line.seen[0].url, '/v2/bot/message/validate/push');
  assert.equal(line.seen[0].headers.authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(line.seen[0].body, { messages: [flex] });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8')), [{ index: 1, http: '200', body: {} }]);
});

test('a bare container and a single flex message are wrapped into {messages}', async () => {
  const line = await fakeLine([{ status: 200, body: {} }]);
  const r = await run([writeInput(workdir(), [bubble, flex])], { LINE_VALIDATE_TOKEN: TOKEN, LINE_VALIDATE_BASE: line.base });
  assert.equal(r.code, 0);
  assert.deepEqual(line.seen[0].body, { messages: [{ type: 'flex', altText: 'flex', contents: bubble }] });
  assert.deepEqual(line.seen[1].body, { messages: [flex] });
});

test('400: valid=no, exit 1, one line per offending property', async () => {
  const rejected = { message: 'The request body has 1 error(s)', details: [{ message: 'must be specified', property: 'messages[0].contents.body.contents' }] };
  const line = await fakeLine([{ status: 400, body: rejected }]);
  const r = await run([writeInput(workdir(), [flex])], { LINE_VALIDATE_TOKEN: TOKEN, LINE_VALIDATE_BASE: line.base });
  assert.equal(r.code, 1);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines[0], 'valid=no http=400 The request body has 1 error(s)');
  assert.ok(lines.includes('  ✗ messages[0].contents.body.contents: must be specified'));
});

test('401 means not validated, not invalid: valid=error, exit 2', async () => {
  const line = await fakeLine([{ status: 401, body: { message: 'Authentication failed.' } }]);
  const r = await run([writeInput(workdir(), [flex])], { LINE_VALIDATE_TOKEN: TOKEN, LINE_VALIDATE_BASE: line.base });
  assert.equal(r.code, 2);
  assert.equal(r.stdout.trim(), 'valid=error http=401 Authentication failed.');
});

test('invalid plus unreachable: error wins, exit 2', async () => {
  const line = await fakeLine([{ status: 400, body: { message: 'bad', details: [] } }, { status: 500, body: { message: 'Internal error' } }]);
  const r = await run([writeInput(workdir(), [flex, flex])], { LINE_VALIDATE_TOKEN: TOKEN, LINE_VALIDATE_BASE: line.base });
  assert.equal(r.code, 2);
  assert.match(r.stdout, /\[2\] valid=error http=500 Internal error/);
});

test('a record that is not flex: valid=error, exit 2, LINE is not called', async () => {
  const line = await fakeLine([{ status: 200, body: {} }]);
  const r = await run([writeInput(workdir(), [{ type: 'text', text: 'hi' }])], { LINE_VALIDATE_TOKEN: TOKEN, LINE_VALIDATE_BASE: line.base });
  assert.equal(r.code, 2);
  assert.equal(line.seen.length, 0);
});

test('no token: valid=skipped, exit 0, says NOT verified; REQUIRED=1 turns it into exit 2', async () => {
  const line = await fakeLine([{ status: 200, body: {} }]);
  const file = writeInput(workdir(), [flex]);
  const skipped = await run([file], { LINE_VALIDATE_BASE: line.base });
  assert.equal(skipped.code, 0);
  assert.match(skipped.stdout, /^valid=skipped .*NOT verified/);
  const required = await run([file], { LINE_VALIDATE_BASE: line.base, LINE_VALIDATE_REQUIRED: '1' });
  assert.equal(required.code, 2);
  assert.equal(line.seen.length, 0);
});

test('the token never appears in output or the out file', async () => {
  const line = await fakeLine([{ status: 400, body: { message: 'bad', details: [{ message: 'x', property: 'messages' }] } }]);
  const dir = workdir();
  const r = await run([writeInput(dir, [flex]), join(dir, 'out.json')], { LINE_VALIDATE_TOKEN: TOKEN, LINE_VALIDATE_BASE: line.base });
  assert.ok(!(r.stdout + r.stderr).includes(TOKEN));
  assert.ok(!readFileSync(join(dir, 'out.json'), 'utf8').includes(TOKEN));
});

for (const base of ['https://api.line.me.evil.example', 'http://api.line.me', 'https://api.line.me/', 'http://127.0.0.1:1@evil.example', 'http://127.0.0.10:8080', 'http://localhost:8080', 'http://127.0.0.1:8080/v2']) {
  test(`rejects look-alike base ${base}`, async () => {
    const r = await run([writeInput(workdir(), [flex])], { LINE_VALIDATE_TOKEN: TOKEN, LINE_VALIDATE_BASE: base });
    assert.equal(r.code, 2);
    assert.equal(r.stdout.trim(), 'valid=error reason=LINE_VALIDATE_BASE must be https://api.line.me or http://127.0.0.1:<port>');
  });
}
