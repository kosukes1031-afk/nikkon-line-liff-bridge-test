import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
const source = scripts.at(-1)[1].replace(/\bstart\(\);\s*$/, 'globalThis.__bridge = { params, allowedRoute, validLegacyGasParam, stateParams, rememberParams, clearStoredParams, loginRedirectUrl, start };');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function memoryCookieDocument() {
  const values = new Map();
  const effects = { status: { innerHTML: '' }, forms: [], redirects: [], initCalls: 0 };
  return {
    effects,
    getElementById: () => effects.status,
    createElement(tag) {
      if (tag === 'input') return { type: '', name: '', value: '' };
      if (tag !== 'form') throw new Error(`Unexpected element: ${tag}`);
      return {
        method: '', action: '', fields: [],
        appendChild(input) { this.fields.push(input); },
        submit() { effects.forms.push({ action: this.action, fields: Object.fromEntries(this.fields.map((input) => [input.name, input.value])) }); },
      };
    },
    body: { appendChild() {} },
    get cookie() { return [...values].map(([name, value]) => `${name}=${value}`).join('; '); },
    set cookie(serialized) {
      const [pair, ...attributes] = String(serialized).split(';').map((part) => part.trim());
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (attributes.some((part) => part.toLowerCase() === 'max-age=0')) values.delete(name);
      else values.set(name, value);
    },
  };
}

function bridgeFor(href, sessionStorage = memoryStorage(), localStorage = memoryStorage(), document = memoryCookieDocument(), loggedIn = true) {
  const parsedLocation = new URL(href);
  const liff = {
    async init() { document.effects.initCalls++; },
    isLoggedIn: () => loggedIn,
    getIDToken: () => 'FIXTURE_ID_TOKEN',
    login({ redirectUri }) { document.effects.redirects.push(redirectUri); },
  };
  const context = {
    URL, URLSearchParams, Set, String, Number, Date, JSON, Object, liff,
    sessionStorage,
    localStorage,
    location: { href, origin: parsedLocation.origin, pathname: parsedLocation.pathname },
    document,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { ...context.__bridge, effects: document.effects };
}

const TEST_GAS = 'https://script.google.com/macros/s/AKfycbxnkQ-bUwwSBk3r1a2A3KecxOXRNgUjHuxWOYKd7gCU7oXvEuM1OItJRBVohToPYnatTQ/exec';
const OTHER_GAS = 'https://script.google.com/macros/s/OTHER_DEPLOYMENT/exec';
const PROD_LIKE_GAS = 'https://script.google.com/macros/s/PRODUCTION_DEPLOYMENT/exec';
const PENDING_KEY = 'nikkon-liff-bridge-test-pending-v2';

assert.equal(bridgeFor('https://example.test/').validLegacyGasParam(new URLSearchParams({ gas: TEST_GAS })), true);
for (const gas of [OTHER_GAS, '', `${TEST_GAS}?unexpected=1`, 'https://attacker.invalid/exec']) {
  assert.equal(bridgeFor('https://example.test/').validLegacyGasParam(new URLSearchParams({ gas })), false);
}

function read(href, sessionStorage, localStorage, document) {
  const result = bridgeFor(href, sessionStorage, localStorage, document).params();
  return Object.fromEntries(result.entries());
}

assert.deepEqual(read(`https://example.test/?gas=${encodeURIComponent(TEST_GAS)}&route=companies`), {
  route: 'companies',
});

assert.deepEqual(read(`https://example.test/?gas=${encodeURIComponent(TEST_GAS)}&liff.state=${encodeURIComponent('?route=companies')}`), {
  'liff.state': '?route=companies',
  route: 'companies',
});
assert.throws(() => read(`https://example.test/?gas=${encodeURIComponent(OTHER_GAS)}`), /許可されていません/);
assert.throws(() => read(`https://example.test/?liff.state=${encodeURIComponent(`?gas=${encodeURIComponent(OTHER_GAS)}`)}`), /許可されていません/);

assert.equal(read(`https://example.test/?gas=${encodeURIComponent(TEST_GAS)}&route=unknown&liff.state=${encodeURIComponent('?route=companies')}`).route, 'home');
assert.equal(read(`https://example.test/?gas=${encodeURIComponent(TEST_GAS)}&liff.state=${encodeURIComponent('?route=unknown')}`).route, 'home');
assert.equal(read(`https://example.test/?gas=${encodeURIComponent(TEST_GAS)}&liff.state=${encodeURIComponent('https://attacker.invalid/?route=companies')}`).route, 'home');
assert.equal(read(`https://example.test/?gas=${encodeURIComponent(TEST_GAS)}&liff.state=${encodeURIComponent('?page=companies')}`).route, 'companies');
assert.equal(read(`https://example.test/?gas=${encodeURIComponent(TEST_GAS)}&route=COMPANIES`).route, 'companies');
for (const route of ['home', 'companies', 'reservation', 'ticket', 'tour', 'tour-direct', 'tour-later', 'gate']) {
  assert.equal(read(`https://example.test/?route=${route}`).route, route);
}
assert.equal(read('https://example.test/?route=tour-later&companyId=20260915-1').companyId, '20260915-1');
assert.equal(read(`https://example.test/?liff.state=${encodeURIComponent('?route=tour-later&companyId=20260915-1')}`).route, 'tour-later');
assert.deepEqual(read('https://example.test/?route=tour-direct&companyId=20260915-1'), { route: 'tour-direct', companyId: '20260915-1' });
assert.deepEqual(read('https://example.test/?route=tour-later&companyId=20260915-2'), { route: 'tour-later', companyId: '20260915-2' });
assert.equal(read(`https://example.test/?liff.state=${encodeURIComponent('?route=tour-later&companyId=20260915-3')}`).companyId, '20260915-3');
assert.equal(read('https://example.test/?route=unknown&companyId=20260915-4').companyId, undefined);
assert.equal(read('https://example.test/?route=tour-later').companyId, undefined);

const loginSessionStorage = memoryStorage();
const loginLocalStorage = memoryStorage();
const beforeLogin = bridgeFor(`https://example.test/?liff.state=${encodeURIComponent(`?route=companies&gas=${encodeURIComponent(TEST_GAS)}`)}`, loginSessionStorage, loginLocalStorage);
beforeLogin.rememberParams(beforeLogin.params());
assert.deepEqual(read('https://example.test/', loginSessionStorage, loginLocalStorage), {
  route: 'companies',
  event: '',
  action: '',
  token: '',
  companyId: '',
});
beforeLogin.clearStoredParams();
assert.deepEqual(read('https://example.test/', loginSessionStorage, loginLocalStorage), { route: 'home' });

const replacementSessionStorage = memoryStorage();
beforeLogin.rememberParams(beforeLogin.params());
assert.deepEqual(read('https://example.test/', replacementSessionStorage, loginLocalStorage), {
  route: 'companies',
  event: '',
  action: '',
  token: '',
  companyId: '',
});

const cookieDocument = memoryCookieDocument();
const cookieLogin = bridgeFor(`https://example.test/?gas=${encodeURIComponent(TEST_GAS)}&route=companies`, memoryStorage(), memoryStorage(), cookieDocument);
cookieLogin.rememberParams(cookieLogin.params());
assert.deepEqual(read('https://example.test/?code=callback&state=oauth', memoryStorage(), memoryStorage(), cookieDocument), {
  code: 'callback',
  state: 'oauth',
  route: 'companies',
  companyId: '',
});
cookieLogin.clearStoredParams();
assert.deepEqual(read('https://example.test/?code=callback', memoryStorage(), memoryStorage(), cookieDocument), {
  code: 'callback',
  route: 'home',
});

const redirectBridge = bridgeFor('https://example.test/bridge/', memoryStorage());
const redirectParams = new URLSearchParams({ gas: TEST_GAS, route: 'companies' });
const loginRedirect = new URL(redirectBridge.loginRedirectUrl(redirectParams));
assert.equal(loginRedirect.origin + loginRedirect.pathname, 'https://example.test/bridge/');
assert.equal(loginRedirect.searchParams.has('gas'), false);
assert.equal(loginRedirect.searchParams.get('route'), 'companies');

const tourCookieDocument = memoryCookieDocument();
const tourBeforeLogin = bridgeFor('https://example.test/?route=tour-later&companyId=20260915-5', memoryStorage(), memoryStorage(), tourCookieDocument);
tourBeforeLogin.rememberParams(tourBeforeLogin.params());
const cookieOnly = read('https://example.test/?code=callback', memoryStorage(), memoryStorage(), tourCookieDocument);
assert.equal(cookieOnly.route, 'tour-later');
assert.equal(cookieOnly.companyId, '20260915-5');
const cookieRedirect = new URL(tourBeforeLogin.loginRedirectUrl(new URLSearchParams(cookieOnly)));
assert.equal(cookieRedirect.searchParams.get('companyId'), '20260915-5');
assert.equal(read('https://example.test/?route=tour-later&companyId=20260915-2', memoryStorage(), memoryStorage(), tourCookieDocument).companyId, '20260915-2');
assert.equal(read(`https://example.test/?liff.state=${encodeURIComponent('?route=tour-later&companyId=20260915-3')}`, memoryStorage(), memoryStorage(), tourCookieDocument).companyId, '20260915-3');
assert.equal(read('https://example.test/?route=unknown&companyId=20260915-4', memoryStorage(), memoryStorage(), tourCookieDocument).companyId, undefined);

const storedSession = memoryStorage();
const storedLocal = memoryStorage();
const storageBridge = bridgeFor('https://example.test/?route=tour-direct&companyId=20260915-6', storedSession, storedLocal);
storageBridge.rememberParams(storageBridge.params());
assert.equal(read('https://example.test/', storedSession, memoryStorage()).companyId, '20260915-6');
assert.equal(read('https://example.test/', memoryStorage(), storedLocal).companyId, '20260915-6');
assert.equal(JSON.parse(storedSession.getItem(PENDING_KEY)).gas, undefined);

// The old published bridge persisted its selected GAS. Its fixed PoC value remains compatible.
const legacySession = memoryStorage();
legacySession.setItem(PENDING_KEY, JSON.stringify({ savedAt: Date.now(), gas: TEST_GAS, route: 'tour-direct', companyId: '20260915-7' }));
assert.deepEqual(read('https://example.test/', legacySession), {
  route: 'tour-direct', companyId: '20260915-7',
});
assert.equal(read(`https://example.test/?gas=${encodeURIComponent(TEST_GAS)}&route=home`).gas, undefined);

for (const invalidGas of [PROD_LIKE_GAS, OTHER_GAS, '', 'x'.repeat(2049)]) {
  const badSession = memoryStorage();
  badSession.setItem(PENDING_KEY, JSON.stringify({ savedAt: Date.now(), gas: invalidGas, route: 'tour-later' }));
  assert.throws(() => read('https://example.test/', badSession), /許可されていません/);
  const badLocal = memoryStorage();
  badLocal.setItem(PENDING_KEY, JSON.stringify({ savedAt: Date.now(), gas: invalidGas, route: 'tour-later' }));
  assert.throws(() => read('https://example.test/', memoryStorage(), badLocal), /許可されていません/);
}
const badCookie = memoryCookieDocument();
badCookie.cookie = `${PENDING_KEY}=${encodeURIComponent(JSON.stringify({ savedAt: Date.now(), gas: OTHER_GAS, route: 'tour-later' }))}; Path=/`;
assert.throws(() => read('https://example.test/', memoryStorage(), memoryStorage(), badCookie), /許可されていません/);

const normalStart = bridgeFor('https://example.test/?route=tour-direct&companyId=20260915-1');
await normalStart.start();
assert.equal(normalStart.effects.forms.length, 1);
assert.equal(normalStart.effects.forms[0].action, TEST_GAS);
assert.equal(normalStart.effects.forms[0].fields.route, 'tour-direct');
assert.equal(normalStart.effects.forms[0].fields.companyId, '20260915-1');
const legacyStart = bridgeFor(`https://example.test/?gas=${encodeURIComponent(TEST_GAS)}&route=tour-later&companyId=20260915-2`);
await legacyStart.start();
assert.equal(legacyStart.effects.forms.length, 1);
assert.equal(legacyStart.effects.forms[0].action, TEST_GAS);
for (const href of [
  `https://example.test/?gas=${encodeURIComponent(PROD_LIKE_GAS)}&route=tour-direct`,
  `https://example.test/?gas=${encodeURIComponent(OTHER_GAS)}&route=tour-later`,
  'https://example.test/?gas=&route=tour-later',
  `https://example.test/?liff.state=${encodeURIComponent(`?gas=${encodeURIComponent(OTHER_GAS)}&route=tour-later`)}`,
  `https://example.test/?code=callback&gas=${encodeURIComponent(OTHER_GAS)}&route=tour-later`,
]) {
  const rejected = bridgeFor(href);
  await rejected.start();
  assert.equal(rejected.effects.forms.length, 0);
  assert.equal(rejected.effects.initCalls, 0);
  assert.match(rejected.effects.status.innerHTML, /許可されていません/);
}
const storedRejected = memoryStorage();
storedRejected.setItem(PENDING_KEY, JSON.stringify({ savedAt: Date.now(), gas: OTHER_GAS, route: 'tour-later' }));
const rejectedStoredStart = bridgeFor('https://example.test/?route=tour-direct', storedRejected);
await rejectedStoredStart.start();
assert.equal(rejectedStoredStart.effects.forms.length, 0);
assert.equal(rejectedStoredStart.effects.initCalls, 0);
const rejectedDespiteGoodQuery = bridgeFor(`https://example.test/?gas=${encodeURIComponent(TEST_GAS)}&route=tour-direct`, storedRejected);
await rejectedDespiteGoodQuery.start();
assert.equal(rejectedDespiteGoodQuery.effects.forms.length, 0);
const rejectedCookieStart = bridgeFor('https://example.test/?code=callback', memoryStorage(), memoryStorage(), badCookie);
await rejectedCookieStart.start();
assert.equal(rejectedCookieStart.effects.forms.length, 0);

const loginStart = bridgeFor('https://example.test/?route=tour-later&companyId=20260915-3', memoryStorage(), memoryStorage(), memoryCookieDocument(), false);
await loginStart.start();
assert.equal(loginStart.effects.forms.length, 0);
assert.equal(loginStart.effects.redirects.length, 1);
const authRedirect = new URL(loginStart.effects.redirects[0]);
assert.equal(authRedirect.searchParams.get('route'), 'tour-later');
assert.equal(authRedirect.searchParams.get('companyId'), '20260915-3');
assert.equal(authRedirect.searchParams.has('gas'), false);

assert.doesNotMatch(source, /GAS_URL_PATTERN|allowedGasUrl/);
assert.match(source, /const LIFF_ID = '2009668362-3dydAR8b'/);
assert.match(source, /const DEFAULT_POC_GAS_URL = 'https:\/\/script\.google\.com\/macros\/s\/AKfycbxnkQ-bUwwSBk3r1a2A3KecxOXRNgUjHuxWOYKd7gCU7oXvEuM1OItJRBVohToPYnatTQ\/exec'/);
assert.match(source, /form\.action=DEFAULT_POC_GAS_URL/);

const startSource = source.slice(source.indexOf('async function start()'));
assert.ok(startSource.indexOf('rememberParams(p);') < startSource.indexOf('await liff.init('));
assert.ok(startSource.indexOf('form.submit();') < startSource.indexOf('clearStoredParams();'));
assert.equal((startSource.match(/rememberParams\(p\);/g) || []).length, 1);

console.log('route-params: all tests passed');
