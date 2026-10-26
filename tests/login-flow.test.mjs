import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Execute the actual form handler with an in-memory DOM and mocked service replies.
// These tests cover routing/error semantics, not a real production authentication.
const source = (await readFile(new URL('../src/login.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '');
const run = Object.getPrototypeOf(async function () {}).constructor(
  'document', 'window', 'supabase', 'isSupabaseConfigured', 'captureIncomingSharedLink', 'FormData', 'console', source
);
const session = { access_token: 'test-access', refresh_token: 'test-refresh' };
const serviceError = (status) => ({ status, name: 'AuthApiError' });

async function login({ edge, rpc, auth, saved } = {}) {
  const elements = new Map();
  for (const id of ['loginForm', 'message', 'loginButton', 'password', 'togglePassword']) {
    elements.set(id, {
      classList: { add() {}, remove() {} }, dataset: {}, disabled: false,
      addEventListener(name, handler) { this[name] = handler; }, setAttribute() {}
    });
  }
  const calls = { edge: 0, rpc: 0, auth: 0, saved: 0, redirects: [] };
  const client = {
    functions: { async invoke(name, payload) { calls.edge++; calls.payload = payload; return edge ?? { data: session }; } },
    async rpc(name, payload) { calls.rpc++; calls.lookup = payload; return rpc ?? { data: 'fixture@example.invalid' }; },
    auth: {
      async getSession() { return { data: { session: null } }; },
      async signInWithPassword() { calls.auth++; return auth ?? { data: { session } }; },
      async setSession() { calls.saved++; return saved ?? { data: { session } }; }
    }
  };
  const window = { location: { search: '', replace: (url) => calls.redirects.push(url) } };
  await run({ getElementById: (id) => elements.get(id) }, window, client, true, () => {},
    class { get(key) { return key === 'username' ? '  FIXTURE_USER  ' : 'fixture-secret'; } },
    { warn() {}, error() {} });
  await elements.get('loginForm').submit({ preventDefault() {} });
  return { calls, message: elements.get('message').textContent, button: elements.get('loginButton') };
}

test('primary login redirects only after the real SDK session has been set', async () => {
  const { calls } = await login();
  assert.deepEqual(calls.redirects, ['home.html']);
  assert.equal(calls.saved, 1);
  assert.equal(calls.rpc, 0);
  assert.equal(calls.payload.body.username, 'fixture_user');
});

test('an unavailable function uses the password-verified lookup and Auth session', async () => {
  const { calls } = await login({ edge: { error: { name: 'FunctionsFetchError' } } });
  assert.equal(calls.lookup.p_username, 'fixture_user');
  assert.equal(calls.auth, 1);
  assert.deepEqual(calls.redirects, ['home.html']);
});

test('invalid credentials do not trigger a second authentication attempt', async () => {
  const { calls, message } = await login({ edge: { error: { context: { status: 401 } } } });
  assert.equal(calls.rpc, 0);
  assert.deepEqual(calls.redirects, []);
  assert.match(message, /Usuário ou senha incorretos/);
});

test('rate limiting does not trigger an extra fallback request', async () => {
  const { calls, message } = await login({ edge: { error: { context: { status: 429 } } } });
  assert.equal(calls.rpc, 0);
  assert.match(message, /Muitas tentativas/);
});

for (const [name, replies] of Object.entries({
  'PostgREST lookup': { edge: { error: { context: { status: 402 } } }, rpc: { status: 402, error: serviceError(402) } },
  'Auth fallback': { edge: { error: { name: 'FunctionsFetchError' } }, auth: { error: serviceError(402) } },
  'session validation': { saved: { error: serviceError(402) } }
})) {
  test(`HTTP 402 from ${name} is reported as service restriction, never bad credentials`, async () => {
    const { calls, message, button } = await login(replies);
    assert.deepEqual(calls.redirects, []);
    assert.match(message, /bloqueado pelo provedor/);
    assert.doesNotMatch(message, /incorretos/);
    assert.equal(button.disabled, false);
  });
}

for (const [name, replies] of Object.entries({
  'missing function tokens': { edge: { data: {} } },
  'empty saved session': { saved: { data: { session: null } } },
  'empty fallback session': { edge: { error: { name: 'FunctionsFetchError' } }, auth: { data: { session: null } } }
})) {
  test(`${name} cannot be mistaken for a completed login`, async () => {
    const { calls, message } = await login(replies);
    assert.deepEqual(calls.redirects, []);
    assert.match(message, /indisponível/);
  });
}
