// Accuracy vs the 480 hand-labelled records.
// node tests/gold_eval.js <contributions.csv> [train|test|all]
const fs = require('fs'), path = require('path');
const E = require(path.join(__dirname, '..', 'lib', 'naming_engine.js'));
const csvPath = process.argv[2]; const which = process.argv[3] || 'test';
if (!csvPath || !fs.existsSync(csvPath)) { console.error('Usage: node tests/gold_eval.js <contributions_20261023-0912.csv> [train|test|all]'); process.exit(1); }
function parse(t){t=t.replace(/^﻿/,'');const rows=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c=='"'){if(t[i+1]=='"'){f+='"';i++}else q=false}else f+=c}else if(c=='"')q=true;else if(c==','){row.push(f);f=''}else if(c=='\n'){row.push(f);rows.push(row);row=[];f=''}else if(c!='\r')f+=c}if(f||row.length){row.push(f);rows.push(row)}const h=rows.shift();return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
const byId = {}; parse(fs.readFileSync(csvPath, 'utf8')).forEach(r => byId[r.id] = r);
const split = require('./labels/split_v2.json');
const ids = new Set(which === 'all' ? [...split.train, ...split.test] : split[which]);
const gold = fs.readFileSync(path.join(__dirname, 'labels', 'labels_v2.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter(g => ids.has(g.id));
const st = {}, fx = {};
const norm = v => v == null ? null : String(v).normalize('NFC').trim().replace(/\s+/g, ' ');
for (const g of gold) {
  const o = E.checkRecord(byId[g.id]);
  for (const f of ['name', 'house', 'street']) {
    const P = o[f].findings.some(x => x.code !== 'INFO'), G = g[f + '_codes'].length > 0;
    const s = st[f] || (st[f] = { tp: 0, fp: 0, fn: 0, tn: 0 }); s[P && G ? 'tp' : P ? 'fp' : G ? 'fn' : 'tn']++;
    const gf = norm(g[f + '_fixed']); if (gf != null && G) { const x = fx[f] || (fx[f] = { n: 0, ok: 0 }); x.n++; const opts = o[f].findings.flatMap(y => (y.options || []).map(norm)); if (norm(o[f].fixed) === gf || opts.includes(gf)) x.ok++; }
  }
}
console.log(`gold ${which}: ${gold.length} records (engine v${E.VERSION}, trained on ${E.LEARNED_META ? E.LEARNED_META.trained_on : '-'})`);
if (E.LEARNED_META && E.LEARNED_META.trained_on === 'all' && which !== 'train') console.log('Lưu ý: engine phát hành học từ TOÀN BỘ nhãn, nên số trên tập test ở đây lạc quan. Số test thật: xem evaluation_v1.2.txt (engine học từ train).');
for (const f in st) { const s = st[f], p = s.tp / (s.tp + s.fp || 1), r = s.tp / (s.tp + s.fn || 1); console.log(`${f.padEnd(6)} P ${p.toFixed(3)}  R ${r.toFixed(3)}  F1 ${(2 * p * r / (p + r || 1)).toFixed(3)}  fix-match ${fx[f].ok}/${fx[f].n}`); }
