// Regression test: node tests/regression.js  (exit 1 if any case changed)
const path = require('path');
const E = require(path.join(__dirname, '..', 'lib', 'naming_engine.js'));
const cases = require('./cases.json');
let fail = 0;
for (const c of cases) {
  const r = c.field === 'house' ? E.checkHouse(c.input, c.ctx) : c.field === 'street' ? E.checkStreet(c.input, c.ctx) : E.checkName(c.input, c.ctx);
  const codes = [...new Set(r.findings.filter(x => x.code !== 'INFO').map(x => x.code))].sort();
  const ok = r.fixed === c.expect.fixed && JSON.stringify(codes) === JSON.stringify(c.expect.codes);
  if (!ok) { fail++; console.log(`FAIL ${c.field} ${JSON.stringify(c.input)}\n  expected ${JSON.stringify(c.expect.fixed)} [${c.expect.codes}]\n  got      ${JSON.stringify(r.fixed)} [${codes}]`); }
}
console.log(`${cases.length - fail}/${cases.length} cases pass (engine v${E.VERSION})`);
process.exitCode = fail ? 1 : 0;
