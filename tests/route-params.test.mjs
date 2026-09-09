import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
const source = scripts.at(-1)[1].replace(/\bstart\(\);\s*$/, 'globalThis.__bridge = { params, allowedRoute, stateParams, rememberParams, clearStoredParams, loginRedirectUrl };');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function bridgeFor(href, sessionStorage = memoryStorage(), localStorage = memoryStorage()) {
  const parsedLocation = new URL(href);
  const context = {
    URL,
    URLSearchParams,
    Set,
    String,
    Number,
    Date,
    JSON,
    sessionStorage,
    localStorage,
    location: { href, origin: parsedLocation.origin, pathname: parsedLocation.pathname },
    document: { getElementById: () => ({ innerHTML: '' }) },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.__bridge;
}

const TEST_GAS = 'https://script.google.com/macros/s/TEST_DEPLOYMENT/exec';

function read(href, sessionStorage, localStorage) {
  const result = bridgeFor(href, sessionStorage, localStorage).params();
  return Object.fromEntries(result.entries());
}

assert.deepEqual(read(`https://example.test/?gas=${encodeURIComponent(TEST_GAS)}&route=companies`), {
  gas: TEST_GAS,
  route: 'companies',
});

assert.deepEqual(read(`https://example.test/?gas=${encodeURIComponent(TEST_GAS)}&liff.state=${encodeURIComponent('?route=companies')}`), {
  gas: TEST_GAS,
  'liff.state': '?route=companies',
  route: 'companies',
});

assert.equal(read(`https://example.test/?gas=${encodeURIComponent(TEST_GAS)}&route=unknown&liff.state=${encodeURIComponent('?route=companies')}`).route, 'home');
assert.equal(read(`https://example.test/?gas=${encodeURIComponent(TEST_GAS)}&liff.state=${encodeURIComponent('?route=unknown')}`).route, 'home');
assert.equal(read(`https://example.test/?gas=${encodeURIComponent(TEST_GAS)}&liff.state=${encodeURIComponent('https://attacker.invalid/?route=companies')}`).route, 'home');
assert.equal(read(`https://example.test/?gas=${encodeURIComponent(TEST_GAS)}&liff.state=${encodeURIComponent('?page=companies')}`).route, 'companies');
assert.equal(read(`https://example.test/?gas=${encodeURIComponent(TEST_GAS)}&route=COMPANIES`).route, 'companies');

const loginSessionStorage = memoryStorage();
const loginLocalStorage = memoryStorage();
const beforeLogin = bridgeFor(`https://example.test/?liff.state=${encodeURIComponent(`?route=companies&gas=${encodeURIComponent(TEST_GAS)}`)}`, loginSessionStorage, loginLocalStorage);
beforeLogin.rememberParams(beforeLogin.params());
assert.deepEqual(read('https://example.test/', loginSessionStorage, loginLocalStorage), {
  gas: TEST_GAS,
  route: 'companies',
  event: '',
  action: '',
  token: '',
});
beforeLogin.clearStoredParams();
assert.deepEqual(read('https://example.test/', loginSessionStorage, loginLocalStorage), { route: 'home' });

const replacementSessionStorage = memoryStorage();
beforeLogin.rememberParams(beforeLogin.params());
assert.deepEqual(read('https://example.test/', replacementSessionStorage, loginLocalStorage), {
  gas: TEST_GAS,
  route: 'companies',
  event: '',
  action: '',
  token: '',
});

const redirectBridge = bridgeFor('https://example.test/bridge/', memoryStorage());
const redirectParams = new URLSearchParams({ gas: TEST_GAS, route: 'companies' });
const loginRedirect = new URL(redirectBridge.loginRedirectUrl(redirectParams));
assert.equal(loginRedirect.origin + loginRedirect.pathname, 'https://example.test/bridge/');
assert.equal(loginRedirect.searchParams.get('gas'), TEST_GAS);
assert.equal(loginRedirect.searchParams.get('route'), 'companies');

assert.match(source, /\^https:\\\/\\\/script\\\.google\\\.com\\\/macros\\\/s\\\//);
assert.match(source, /const LIFF_ID = '2009668362-3dydAR8b'/);
assert.doesNotMatch(source, /const\s+GAS_URL\s*=/);

console.log('route-params: all tests passed');
