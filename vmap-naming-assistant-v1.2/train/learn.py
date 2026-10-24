"""Learn data-driven lexicons + category model for the VMap naming engine.

Usage: python3 learn.py <contributions.csv> <gold.jsonl> <split.json> <train|all> <out learned.json>

Everything learned here is plain data (dictionaries, counts, log-probabilities) that the
JS engine loads at start-up — no ML runtime is needed in production.
"""
import sys, json, re, math, unicodedata, collections
import pandas as pd

csv_path, gold_path, split_path, which, out_path = sys.argv[1:6]

def strip(s):
    s = unicodedata.normalize('NFD', unicodedata.normalize('NFC', s or ''))
    s = ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn')
    return s.replace('đ', 'd').replace('Đ', 'D')

def key(s):
    return re.sub(r'[^a-z0-9]+', ' ', strip(s).lower()).strip()

def nfc(s):
    return unicodedata.normalize('NFC', s or '')

d = pd.read_csv(csv_path, dtype=str).fillna('')
d = d.set_index('id')
gold = {json.loads(l)['id']: json.loads(l) for l in open(gold_path, encoding='utf-8')}
split = json.load(open(split_path))
ids = list(gold) if which == 'all' else [i for i in split['train']]
ids = [i for i in ids if i in d.index]

learned = {'meta': {'trained_on': which, 'records': len(ids)}}

# ---------------------------------------------------------------- lead-word policy (P3.2)
# "Quán nhậu Chị Ba": is a sentence-case run after the first word accepted?
pat = re.compile(r'^(\S+)((?: [a-zà-ỹđ][\wà-ỹđ]*){1,4})( [A-ZÀ-ỸĐ0-9].*)?$')
votes = collections.defaultdict(lambda: [0, 0])  # [ok, p32]
for i in ids:
    n = nfc(d.loc[i, 'name']).strip()
    m = pat.match(n)
    if not m or not m.group(1)[:1].isupper():
        continue
    lab = 'P3.2' in gold[i]['name_codes']
    votes[key(m.group(1))][1 if lab else 0] += 1
learned['lead_ok'] = sorted(k for k, (ok, bad) in votes.items() if ok >= 2 and ok >= bad)
learned['lead_title'] = sorted(k for k, (ok, bad) in votes.items() if bad >= 2 and bad > ok)

# ---------------------------------------------------------------- brands (P3.6)
def brandlike(tok):
    letters = re.sub(r'[^A-Za-zÀ-ỹĐđ]', '', tok)
    if len(letters) < 2:
        return False
    inner_caps = re.search(r'[a-zà-ỹ][A-ZÀ-ỸĐ]', tok) is not None
    allcaps = letters.isupper() and len(letters) >= 3
    return inner_caps or allcaps or '+' in tok or "'" in tok or bool(re.search(r'\d', tok) and re.search(r'[A-Za-z]', tok))

def brandlike2(t):
    letters = [ch for ch in t if ch.isalpha()]
    if len(letters) < 2: return False
    return any(x.islower() and y.isupper() for x, y in zip(t, t[1:])) or (len(letters) >= 3 and all(ch.isupper() for ch in letters)) or '+' in t or "'" in t or (any(ch.isdigit() for ch in t) and letters)
brand_votes = collections.defaultdict(collections.Counter)
for i in ids:
    r = gold[i]
    if 'P3.6' not in r['name_codes'] or not r['name_fixed']:
        continue
    orig = nfc(d.loc[i, 'name'])
    otoks = re.findall(r"[\wÀ-ỹ'’+.&!-]+", orig)
    owin = {}
    for a in range(len(otoks)):
        for b in range(a + 1, min(a + 4, len(otoks)) + 1):
            surf = ' '.join(otoks[a:b])
            owin.setdefault(key(surf).replace(' ', ''), set()).add(key(surf))
    ftoks = re.findall(r"[\wÀ-ỹ'’+.&!-]+", nfc(r['name_fixed']))
    for a in range(len(ftoks)):
        for b in range(a + 1, min(a + 3, len(ftoks)) + 1):
            canon = ' '.join(ftoks[a:b])
            if not any(brandlike2(t) for t in ftoks[a:b]):
                continue
            k = key(canon).replace(' ', '')
            if len(k) < 3 or k not in owin:
                continue
            for ok_ in owin[k]:
                if ok_ and canon != ' '.join(otoks):
                    brand_votes[ok_][canon] += 1
# common words: tokens used in many different names -> never treat as brand aliases on their own
tok_names = collections.Counter()
for i in ids:
    for t in set(key(d.loc[i, 'name']).split()):
        tok_names[t] += 1
common = {t for t, n in tok_names.items() if n >= 6}

def good_alias(k, canon):
    toks = canon.split()
    if canon.startswith('-') or canon.endswith('-') or ' - ' in canon:
        return False
    if strip(canon) != canon:
        return False
    if not toks or not all(t[:1].isupper() or t[:1].isdigit() for t in toks):
        return False
    def inner(t):
        return any(x.islower() and y.isupper() for x, y in zip(t, t[1:]))
    strong = any(inner(t) or (re.search(r'\d', t) and re.search(r'[A-Za-z]', t)) or '+' in t or "'" in t or '!' in t for t in toks)
    caps = [t for t in toks if sum(ch.isalpha() for ch in t) >= 3 and all(ch.isupper() for ch in t if ch.isalpha())]
    if not strong and not caps:
        return False
    if not strong and all(key(t) in common or strip(t) != t for t in caps):
        return False
    if len(k.split()) == 1 and k in common and not strong:
        return False
    return len(k.replace(' ', '')) >= 3 and not k.replace(' ', '').isdigit()

learned['brands'] = {k: c.most_common(1)[0][0] for k, c in brand_votes.items() if good_alias(k, c.most_common(1)[0][0])}

# ---------------------------------------------------------------- streets gazetteer (A6.1/A6.2/A3.x)
PREFIX = re.compile(r'^(Phố|Đường)\s+(.+)$')
street_votes = collections.defaultdict(collections.Counter)
non_street = collections.defaultdict(collections.Counter)
for i in ids:
    r = gold[i]
    sf = r['street_fixed']
    raw = nfc(d.loc[i, 'street']).strip()
    if sf:
        m = PREFIX.match(nfc(sf).strip())
        if m and not re.match(r'^(Số\s*)?\d', m.group(2)):
            street_votes[key(m.group(2))][nfc(sf).strip()] += 1
    elif raw and r['street_codes'] and any(c.startswith('A3') for c in r['street_codes']):
        code = [c for c in r['street_codes'] if c.startswith('A3')][0]
        non_street[key(raw)][code] += 1
streets = {k: c.most_common(1)[0][0] for k, c in street_votes.items() if k}
learned['streets'] = streets
learned['non_streets'] = {k: c.most_common(1)[0][0] for k, c in non_street.items() if k and k not in streets}
# ward names (metadata column, 2025 wards) — a street field equal to a ward name is not a street
wards = set()
for w in d.loc[ids, 'ward']:
    w = re.sub(r'^(Phường|Xã|Thị trấn|Đặc khu)\s+', '', nfc(w))
    if w:
        wards.add(key(w))
learned['wards'] = sorted(k for k in wards if k not in streets)

# ---------------------------------------------------------------- parents (P9.2)
par = collections.Counter()
for i in ids:
    r = gold[i]
    if 'P9.2' in r['name_codes'] and r['name_fixed'] and ' - ' in r['name_fixed']:
        p = nfc(r['name_fixed']).split(' - ')[0].strip()
        if 3 <= len(p) <= 40:
            par[p] += 1
learned['parents'] = sorted(par)

# ---------------------------------------------------------------- generic names (P3.7)
gen = collections.Counter()
for i in ids:
    r = gold[i]
    if 'P3.7' in r['name_codes'] and r['name_fixed'] is None:
        n = key(d.loc[i, 'name'])
        if n and len(n.split()) <= 4 and not re.search(r'\d', n):
            gen[n] += 1
learned['generic_names'] = sorted(gen)

# ---------------------------------------------------------------- branch / location suffixes (P4.4)
br = collections.Counter()
for i in ids:
    r = gold[i]
    if 'P4.4' in r['name_codes'] and r['name_fixed'] and ' - ' in r['name_fixed']:
        tail = nfc(r['name_fixed']).split(' - ')[-1].strip()
        if 1 <= len(tail.split()) <= 4 and not re.search(r'\d{3,}', tail):
            br[key(tail)] += 1
places = {k for k, n in br.items()}
places |= set(learned['wards'])
learned['places'] = sorted(p for p in places if len(p) >= 5)

# ---------------------------------------------------------------- descriptor words (P3.5 segments)
# words of segments removed by annotators (orig " - " segments absent from the fixed name) + category-name words
desc = collections.Counter(); keep = collections.Counter()
for i in ids:
    r = gold[i]
    orig = nfc(d.loc[i, 'name'])
    if ' - ' not in orig:
        continue
    fixed = key(r['name_fixed'] or '')
    for g in orig.split(' - ')[1:]:
        toks = key(g).split()
        if not toks:
            continue
        if 'P3.5' in r['name_codes'] and key(g) not in fixed:
            desc.update(set(toks))
        else:
            keep.update(set(toks))
for c in set(d.loc[ids, 'category']):
    desc.update(set(key(c).split()))
learned['desc_words'] = sorted(t for t, n in desc.items() if n >= 2 and n >= 2 * keep.get(t, 0) and len(t) >= 2)

# ---------------------------------------------------------------- category model (logistic regression, pruned)
# Features: word unigrams + bigrams + first word of the accent-stripped name; TF-IDF (sublinear, l2).
# Exported as plain numbers so the JS engine scores it itself: no ML runtime in production.
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
def feats(name):
    toks = key(name).split()
    f = ['w:' + t for t in toks]
    f += ['b:' + toks[j] + '_' + toks[j + 1] for j in range(len(toks) - 1)]
    if toks:
        f.append('f:' + toks[0])
    return f
cat_ids = [i for i in ids if d.loc[i, 'category']]
names = [nfc(d.loc[i, 'name']) for i in cat_ids]
labels = [d.loc[i, 'category'] for i in cat_ids]
cid = {d.loc[i, 'category']: d.loc[i, 'category_id'] for i in cat_ids}
def cfeats(name):
    f = []
    for t in key(name).split():
        w = ' ' + t + ' '
        for n in (3, 4):
            if len(w) >= n:
                f += ['c:' + w[k:k + n] for k in range(len(w) - n + 1)]
    return f
from scipy.sparse import hstack
import base64
HASH = 2 ** 15
def fnv(x):
    h = 2166136261
    for ch in x.encode('utf-8'):
        h ^= ch; h = (h * 16777619) & 0xFFFFFFFF
    return h % HASH
hw = lambda s: ['%d' % fnv(x) for x in feats(s)]
hc = lambda s: ['%d' % fnv(x) for x in cfeats(s)]
vec = TfidfVectorizer(analyzer=hw, sublinear_tf=True, min_df=2)
vecc = TfidfVectorizer(analyzer=hc, sublinear_tf=True, min_df=2)
X = hstack([vec.fit_transform(names), vecc.fit_transform(names)]).tocsr()
# L1 (sparse) logistic regression: same accuracy as L2+pruning in grouped CV, ~5x fewer weights
clf = LogisticRegression(C=20, penalty='l1', solver='saga', max_iter=400).fit(X, labels)
nw = len(vec.vocabulary_)
# column -> global bucket id (word buckets 0..HASH-1, char buckets HASH..2*HASH-1)
col2b = [0] * X.shape[1]
for f, c in vec.vocabulary_.items(): col2b[c] = int(f)
for f, c in vecc.vocabulary_.items(): col2b[nw + c] = HASH + int(f)
idf_all = list(vec.idf_) + list(vecc.idf_)
def varint(n, out):
    while True:
        b = n & 0x7F; n >>= 7
        if n: out.append(b | 0x80)
        else: out.append(b); return
# idf table: sorted buckets, delta varint + uint8 (idf*16)
order = sorted(range(len(col2b)), key=lambda c: col2b[c])
buf = bytearray(); prev = 0
for c in order:
    varint(col2b[c] - prev, buf); prev = col2b[c]; buf.append(min(255, int(round(idf_all[c] * 16))))
idf_b64 = base64.b64encode(bytes(buf)).decode()
THR = 0.0
classes = []
for ci, c in enumerate(clf.classes_):
    w = clf.coef_[ci].copy(); w[np.abs(w) < max(THR, 1e-6)] = 0
    nz = sorted(np.where(w != 0)[0], key=lambda c: col2b[c])
    sc = (np.abs(w).max() / 127) if len(nz) else 1.0
    b = bytearray(); prev = 0
    for c2 in nz:
        varint(col2b[c2] - prev, b); prev = col2b[c2]
        q = int(round(w[c2] / sc)); b.append(q & 0xFF)
    classes.append({'name': c, 'id': cid[c], 'b': round(float(clf.intercept_[ci]), 2), 's': float('%.5g' % sc), 'q': base64.b64encode(bytes(b)).decode()})
learned['category_lr'] = {'hash': HASH, 'idf': idf_b64, 'classes': classes}
V = [0] * X.shape[1]
vocab = V

# brand / lead-token memory: "pharmacity …" → Nhà thuốc when the data agrees (>=2 records, >=80%)
pc = collections.defaultdict(collections.Counter)
for n, c in zip(names, labels):
    t = key(n).split()
    for L in (1, 2):
        if len(t) >= L:
            pc[' '.join(t[:L])][c] += 1
learned['prefix_cat'] = {k: c.most_common(1)[0][0] for k, c in pc.items()
                         if sum(c.values()) >= 2 and c.most_common(1)[0][1] / sum(c.values()) >= 0.8 and len(k) >= 4}
V = vocab

json.dump(learned, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(json.dumps({k: (len(v) if hasattr(v, '__len__') else v) for k, v in learned.items() if k not in ('category_nb', 'category_lr')}, ensure_ascii=False))
print('category classes', len(classes), 'vocab', len(V), 'bytes', len(json.dumps(learned, ensure_ascii=False, separators=(",", ":")).encode()))
