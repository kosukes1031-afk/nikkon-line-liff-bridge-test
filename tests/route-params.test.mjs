import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
const source = scripts.at(-1)[1].replace(/\bstart\(\);\s*$/, 'globalThis.__bridge = { params, allowedRoute, stateParams };');

function bridgeFor(href) {
  const context = {
    URL,
    URLSearchParams,
    Set,
    String,
    location: { href },
    document: { getElementById: () => ({ innerHTML: '' }) },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.__bridge;
}

const TEST_GAS = 'https://script.google.com/macros/s/TEST_DEPLOYMENT/exec';

function read(href) {
  const result = bridgeFor(href).params();
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

assert.match(source, /\^https:\\\/\\\/script\\\.google\\\.com\\\/macros\\\/s\\\//);
assert.match(source, /const LIFF_ID = '2009668362-3dydAR8b'/);
assert.doesNotMatch(source, /const\s+GAS_URL\s*=/);

console.log('route-params: all tests passed');
