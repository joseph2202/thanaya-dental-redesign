// Static regression guard to prevent accidentally reintroducing bearer tokens
// in browser storage. Functional cookie/CSRF behavior is tested by the backend
// integration suite; this guard covers all storefront source files.
const assert = require('node:assert/strict');
const { readFileSync, readdirSync, statSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../src');
const sourceFiles = [];

function visit(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) visit(full);
    else if (/\.(?:tsx?|jsx?)$/.test(entry)) sourceFiles.push(full);
  }
}
visit(root);
for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /localStorage\s*\.\s*(?:getItem|setItem)\s*\(\s*['"]thanaya-token['"]/,
    file + ': JavaScript-readable bearer token storage is forbidden');
  assert.doesNotMatch(source, /Authorization\s*:\s*['"`]Bearer\s|Authorization\s*:\s*['"`]Bearer\$/,
    file + ': frontend must not construct bearer authorization headers');
}
const api = readFileSync(path.join(root, 'lib/api.ts'), 'utf8');
const auth = readFileSync(path.join(root, 'lib/auth.ts'), 'utf8');
const provider = readFileSync(path.join(root, 'context/AuthContext.tsx'), 'utf8');
assert.match(api, /X-Thanaya-Auth-Mode/);
assert.match(api, /X-Thanaya-CSRF/);
assert.match(api, /credentials:\s*'same-origin'/);
assert.match(api, /\/auth\/logout/);
assert.match(auth, /clearLegacyAuthStorage/);
assert.match(provider, /authAPI\.me\(/);
console.log('PASS: storefront uses cookie/CSRF transport and does not persist readable bearer tokens (' + sourceFiles.length + ' files scanned)');
