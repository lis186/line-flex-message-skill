// validate.sh against a local fake api.line.me.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
// content-length, sends what it has, then drops the connection. `answers` may also be a function of the request body.
async function fakeLine(answers) {
  const seen = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      seen.push({ url: req.url, headers: req.headers, body: JSON.parse(raw) });
      const a = typeof answers === 'function' ? answers(seen.at(-1).body) : answers[Math.min(seen.length - 1, answers.length - 1)];
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

// Several messages in one record: all of them go to LINE, unchanged and in order, and LINE's verdict on the whole
// request comes back. lineRules plays LINE: 1–5 messages, and a message equal to `bad` is invalid.
const text = t => ({ type: 'text', text: t });
const bad = { type: 'flex', altText: 'x', contents: { type: 'bubble', body: 'not-a-box' } };
const lineRules = body => {
  const msgs = body.messages;
  if (msgs.length < 1 || msgs.length > 5) {
    return { status: 400, body: { message: 'The request body has 1 error(s)', details: [{ message: 'Size must be between 1 and 5', property: 'messages' }] } };
  }
  const i = msgs.findIndex(m => JSON.stringify(m) === JSON.stringify(bad));
  if (i >= 0) return { status: 400, body: { message: `A message (messages[${i}]) in the request body is invalid`, details: [{ message: 'must be specified', property: '/body' }] } };
  return { status: 200, body: {} };
};

test('a record with several messages sends all of them, unchanged and in order', async () => {
  const messages = [text('one'), flex, text('three')];
  const line = await fakeLine(lineRules);
  const r = await run([writeInput(workdir(), [{ messages }])], env(line.base));
  assert.equal(r.code, 0);
  assert.deepEqual(line.seen[0].body, { messages });
});

for (const [where, messages] of [['last', [text('one'), text('two'), bad]], ['middle', [text('one'), bad, text('three')]]]) {
  test(`an invalid ${where} message is a rejection, not a pass on the first one`, async () => {
    const line = await fakeLine(lineRules);
    const r = await run([writeInput(workdir(), [{ messages }])], env(line.base));
    assert.equal(r.code, 1);
    assert.match(r.stdout, /^valid=no http=400 A message \(messages\[[12]\]\) in the request body is invalid/);
  });
}

// LINE decides the 1–5 limit; the script sends the count as is and relays the verdict.
for (const [count, code, first] of [[0, 1, 'valid=no http=400 The request body has 1 error(s)'], [1, 0, 'valid=yes'],
  [5, 0, 'valid=yes'], [6, 1, 'valid=no http=400 The request body has 1 error(s)']]) {
  test(`${count} messages in one record: exit ${code} (${first})`, async () => {
    const messages = Array.from({ length: count }, (_, i) => text(`message ${i + 1}`));
    const line = await fakeLine(lineRules);
    const r = await run([writeInput(workdir(), [{ messages }])], env(line.base));
    assert.equal(r.code, code);
    assert.equal(r.stdout.split('\n')[0], first);
    assert.equal(line.seen[0].body.messages.length, count);
    if (code === 1) assert.match(r.stdout, /  ✗ messages: Size must be between 1 and 5/);
  });
}

test('wrapping keeps every bubble of a carousel and every field of a flex message', async () => {
  const carousel = { type: 'carousel', contents: [bubble, { ...bubble, size: 'kilo' }, { ...bubble, size: 'micro' }] };
  const message = { type: 'flex', altText: 'all three', contents: carousel, quickReply: { items: [] }, sender: { name: 'Bot' } };
  const line = await fakeLine(lineRules);
  const r = await run([writeInput(workdir(), [carousel, message])], env(line.base));
  assert.equal(r.code, 0);
  assert.deepEqual(line.seen[0].body, { messages: [{ type: 'flex', altText: 'flex', contents: carousel }] });
  assert.deepEqual(line.seen[1].body, { messages: [message] });
});

// A rerun must never leave the previous run's verdict in the out file: every early exit writes nothing.
for (const [name, override, first] of [
  ['no token (skipped)', { LINE_VALIDATE_TOKEN: undefined }, 'valid=skipped'],
  ['no token in strict mode', { LINE_VALIDATE_TOKEN: undefined, LINE_VALIDATE_REQUIRED: '1' }, 'valid=error reason=LINE_VALIDATE_TOKEN not set'],
  ['a bad base URL', { LINE_VALIDATE_BASE: 'https://evil.example' }, 'valid=error reason=LINE_VALIDATE_BASE'],
]) {
  test(`after a passing run, a rerun with ${name} leaves no out file behind`, async () => {
    const line = await fakeLine([{ status: 200, body: {} }]);
    const dir = workdir();
    const input = writeInput(dir, [flex]);
    const out = join(dir, 'out.json');
    assert.equal((await run([input, out], env(line.base))).code, 0);
    assert.ok(existsSync(out));
    const r = await run([input, out], { ...env(line.base), ...override });
    assert.ok(r.stdout.startsWith(first), r.stdout);
    assert.equal(existsSync(out), false);
  });
}

test('after a passing run, a rerun on input that is not JSON leaves no out file behind', async () => {
  const line = await fakeLine([{ status: 200, body: {} }]);
  const dir = workdir();
  const input = writeInput(dir, [flex]);
  const out = join(dir, 'out.json');
  await run([input, out], env(line.base));
  writeFileSync(input, '{broken');
  const r = await run([input, out], env(line.base));
  assert.equal(r.stdout.trim(), `valid=error reason=${input} is not JSON`);
  assert.equal(existsSync(out), false);
});

test('an out path that is not a regular file (/dev/null) is left alone and validation runs', async () => {
  const line = await fakeLine([{ status: 200, body: {} }]);
  const r = await run([writeInput(workdir(), [flex]), '/dev/null'], env(line.base));
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), 'valid=yes');
});
