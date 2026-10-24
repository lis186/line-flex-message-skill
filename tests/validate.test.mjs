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

// Each answer: { status, body } sent as JSON, or { status, raw } sent verbatim; truncate announces a longer
// content-length, sends what it has, then drops the connection.
async function fakeLine(answers) {
  const seen = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      seen.push({ url: req.url, headers: req.headers, body: JSON.parse(raw) });
      const a = answers[Math.min(seen.length - 1, answers.length - 1)];
      const text = a.raw ?? JSON.stringify(a.body);
      if (a.truncate) {
        res.writeHead(a.status, { 'content-type': 'application/json', 'content-length': String(text.length + 100) });
        res.write(text);
        setTimeout(() => res.socket?.destroy(), 20);
        return;
      }
      res.writeHead(a.status, { 'content-type': 'application/json' }).end(text);
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const close = () => { server.closeAllConnections(); server.close(); };
  cleanups.push(close);
  return { base: `http://127.0.0.1:${server.address().port}`, seen, close };
}

const env = base => ({ LINE_VALIDATE_TOKEN: TOKEN, LINE_VALIDATE_BASE: base });

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
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8')), [{ index: 1, http: '200', curl_exit: 0, body: {} }]);
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

// "Not validated" outranks "rejected", whichever record comes first.
for (const statuses of [[400, 500], [500, 400], [413, 500], [500, 413]]) {
  test(`rejected plus not validated (${statuses.join(' then ')}): error wins, exit 2`, async () => {
    const line = await fakeLine(statuses.map(status => ({ status, body: { message: status === 500 ? 'Internal error' : 'bad' } })));
    const r = await run([writeInput(workdir(), [flex, flex])], env(line.base));
    assert.equal(r.code, 2);
    assert.match(r.stdout, /valid=error http=500 Internal error/);
    assert.match(r.stdout, /valid=no http=(400|413) /);
  });
}

test('200 then the connection drops before the body arrives: not a pass, valid=error with curl_exit, exit 2', async () => {
  const line = await fakeLine([{ status: 200, raw: '{', truncate: true }]);
  const r = await run([writeInput(workdir(), [flex])], env(line.base));
  assert.equal(r.code, 2);
  assert.match(r.stdout, /^valid=error http=200 curl_exit=18 /);
});

for (const [name, answer] of [
  ['JSON other than {}', { status: 200, body: { ok: true } }],
  ['HTML', { status: 200, raw: '<html>ok</html>' }],
  ['an empty body', { status: 200, raw: '' }],
  ['{} followed by garbage', { status: 200, raw: '{}BROKEN' }],
  ['two JSON values', { status: 200, raw: '{} {}' }],
  ['{} then a NUL byte and garbage', { status: 200, raw: '{}\u0000BROKEN' }],
]) {
  test(`200 with ${name} is not LINE's answer: valid=error, exit 2`, async () => {
    const line = await fakeLine([answer]);
    const r = await run([writeInput(workdir(), [flex])], env(line.base));
    assert.equal(r.code, 2);
    assert.equal(r.stdout.trim(), 'valid=error http=200 reason=expected {} from LINE');
  });
}

for (const [name, body] of [
  ['no details', { message: 'The property, messages[0].text, in the request body is invalid (line: 1, column: 30)' }],
  ['empty details', { message: 'Bad request', details: [] }],
]) {
  test(`400 with ${name}: still rejected (exit 1) and says there are no per-field details`, async () => {
    const line = await fakeLine([{ status: 400, body }]);
    const r = await run([writeInput(workdir(), [flex])], env(line.base));
    assert.equal(r.code, 1);
    assert.deepEqual(r.stdout.split('\n'), [`valid=no http=400 ${body.message}`, '  (LINE gave no per-field details)', '']);
  });
}

for (const [name, raw] of [
  ['HTML', '<html>Bad Request</html>'], ['a JSON string', '"Bad Request"'], ['a JSON array', '[{"x":1}]'],
  ['an object without message', '{}'], ['a numeric message', '{"message":123}'], ['a boolean message', '{"message":true}'],
]) {
  test(`400 whose body is ${name} is not a LINE error object: valid=error, exit 2, evidence kept`, async () => {
    const line = await fakeLine([{ status: 400, raw }]);
    const dir = workdir();
    const r = await run([writeInput(dir, [flex]), join(dir, 'out.json')], env(line.base));
    assert.equal(r.code, 2);
    assert.equal(r.stdout.trim(), 'valid=error http=400 reason=response is not a LINE error object');
    assert.equal(JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8'))[0].http, '400');
  });
}

test('413 (over the 2MB limit) is a rejection: valid=no, exit 1', async () => {
  const line = await fakeLine([{ status: 413, raw: '<html>Request Entity Too Large</html>' }]);
  const r = await run([writeInput(workdir(), [flex])], env(line.base));
  assert.equal(r.code, 1);
  assert.match(r.stdout, /^valid=no http=413 request larger than LINE's 2MB limit/);
});

test('unreachable: valid=error http=000 with curl_exit, exit 2', async () => {
  const line = await fakeLine([{ status: 200, body: {} }]);
  line.close();
  const r = await run([writeInput(workdir(), [flex])], env(line.base));
  assert.equal(r.code, 2);
  assert.match(r.stdout, /^valid=error http=000 curl_exit=7 /);
});

test('an out file that cannot be written fails before LINE is called (exit 2, never confused with a rejection)', async () => {
  const line = await fakeLine([{ status: 200, body: {} }]);
  const dir = workdir();
  const out = join(dir, 'no-such-dir', 'v.json');
  const r = await run([writeInput(dir, [flex]), out], env(line.base));
  assert.equal(r.code, 2);
  assert.equal(r.stdout.trim(), `valid=error reason=cannot write ${out}`);
  assert.equal(line.seen.length, 0);
});

for (const [name, record] of [['a string', 'hello'], ['a number', 42], ['null', null], ['an array', [1, 2]],
  ['messages: null', { messages: null }], ['messages: a string', { messages: 'x' }], ['no recognisable shape', { replyToken: 'x' }]]) {
  test(`a record that is ${name}: valid=error, exit 2, LINE is not called`, async () => {
    const line = await fakeLine([{ status: 200, body: {} }]);
    const r = await run([writeInput(workdir(), [record])], env(line.base));
    assert.equal(r.code, 2);
    assert.equal(r.stdout.trim(), 'valid=error reason=record is not a flex container, flex message, or {messages:[...]}');
    assert.equal(line.seen.length, 0);
  });
}

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

test('401 with a 128-character token hints that the stored token was truncated', async () => {
  const line = await fakeLine([{ status: 401, body: { message: 'Authentication failed.' } }]);
  const r = await run([writeInput(workdir(), [flex])], { LINE_VALIDATE_TOKEN: 'x'.repeat(128), LINE_VALIDATE_BASE: line.base });
  assert.equal(r.code, 2);
  assert.match(r.stdout, /^valid=error http=401 Authentication failed\.\n  hint: token is exactly 128 chars/);
});
