/* VMap Naming Assistant — UI helpers (v1.2.0)
 * Logic hiển thị dùng chung cho mọi nền tảng. Không phụ thuộc DOM/Node. Có thể chạy cùng runtime với naming_engine.js,
 * hoặc port sang Swift/Kotlin/Dart (~80 dòng). Bản mẫu tools/form_demo.html dùng đúng logic này.
 *
 *   NamingUI.laneSpans(text)                 → tô màu Ngõ/Ngách/Hẻm/Kiệt NGAY KHI GÕ (regex, không gọi engine)
 *   NamingUI.houseParts(houseFixed, region)  → chip "Số nhà | Ngõ/Ngách/Hẻm" + dòng "Cách đọc"
 *   NamingUI.pendingFixes(input, result)     → danh sách gợi ý cho nút "Áp dụng (n)"
 *   NamingUI.categoryChips(result, current)  → tối đa 3 tên loại gợi ý (KHÔNG kèm %) + có cần nút "Khác…" hay không
 *   NamingUI.debounce(fn, ms)                → debounce 500 ms, có flush() và cancel()
 */
(function (root) {
  'use strict';

  // ---- 1. Tô màu chuỗi ngõ trong ô nhập (chạy mỗi phím, rất rẻ) ----
  var LANE_RE = /(?<!\p{L})(Ngõ|ngõ|NGÕ|Ng\.|ng\.|Ngách|ngách|nghách|Nghách|Ngh\.|ngh\.|Hẻm|hẻm|HẺM|Kiệt|kiệt)(\s*\d+[A-Za-z]?(?:\s*\/\s*\d+[A-Za-z]?)*)?/gu;
  function laneKind(w) {
    w = w.toLowerCase();
    if (w.indexOf('ngách') === 0 || w.indexOf('nghách') === 0 || w.indexOf('ngh.') === 0) return 'ngach';
    if (w.indexOf('ngõ') === 0 || w.indexOf('ng.') === 0) return 'ngo';
    if (w.indexOf('kiệt') === 0) return 'kiet';   // miền Trung: dùng màu của Ngõ
    if (w.indexOf('hẻm') === 0) return 'hem';
    return null;
  }
  /** @returns {Array<{start:number,end:number,kind:'ngo'|'ngach'|'hem'|'kiet'}>} chỉ số theo UTF-16 code unit (như String JS / NSString / Kotlin String) */
  function laneSpans(text) {
    var out = [], m; text = String(text || ''); LANE_RE.lastIndex = 0;
    while ((m = LANE_RE.exec(text))) { var k = laneKind(m[1]); if (k) out.push({ start: m.index, end: m.index + m[0].length, kind: k }); }
    return out;
  }

  // ---- 2. Tách cấu trúc số nhà đã chuẩn hoá để hiện chip + "Cách đọc" ----
  // houseFixed ví dụ: "4 Ngách 199/10" (Bắc) · "59 Hẻm 8/11/36" (Bắc, 3 cấp) · "12 Hẻm 45/6" (Nam) · "7 Kiệt 12" (Trung)
  function houseParts(houseFixed, region) {
    var m = String(houseFixed || '').match(/^(?:(\S+)\s+)?(Ngõ|Ngách|Hẻm|Kiệt)\s+([\dA-Za-z/]+)$/);
    if (!m) return null;
    var nums = m[3].split('/');
    var names = region === 'Nam' ? ['Hẻm', 'Hẻm', 'Hẻm'] : (m[2] === 'Kiệt' ? ['Kiệt', 'Kiệt', 'Kiệt'] : ['Ngõ', 'Ngách', 'Hẻm', 'Hẻm']);
    var KIND = { 'Ngõ': 'ngo', 'Kiệt': 'ngo', 'Ngách': 'ngach', 'Hẻm': 'hem' };
    var chips = [];
    if (m[1]) chips.push({ kind: 'so', label: 'Số nhà', value: m[1] });
    chips.push({ kind: KIND[m[2]], label: m[2], value: m[3] });
    // Cách đọc: từ trong ra ngoài — Số nhà → cấp sâu nhất → … → Ngõ (→ tên đường do app nối thêm)
    var reading = [];
    if (m[1]) reading.push({ kind: 'so', text: 'Số nhà ' + m[1] });
    for (var i = nums.length - 1; i >= 0; i--) { var n = names[Math.min(i, names.length - 1)]; reading.push({ kind: KIND[n], text: n + ' ' + nums[i] }); }
    return { houseNo: m[1] || null, laneType: m[2], laneNums: nums, chips: chips, reading: reading };
  }

  // ---- 3. Danh sách gợi ý cho nút "Áp dụng (n)" ----
  // input: {name, short_name, house_number, street}; result: kết quả NamingEngine.checkRecord(...) của CHÍNH input đó
  function pendingFixes(input, result, engine) {
    var out = [], o = result; if (!o) return out;
    var n = input.name || '', h = input.house_number || '', s = input.street || '', sh = input.short_name || '';
    if (n.trim() && o.name.fixed && o.name.fixed !== n) out.push({ field: 'name', from: n, to: o.name.fixed });
    if (h.trim() !== '' || o.street.moved) {
      if (o.house.fixed != null && o.house.fixed !== h && (o.house.fixed !== '' || h.trim())) out.push({ field: 'house_number', from: h, to: o.house.fixed });
    }
    if (s.trim() && o.street.fixed && o.street.fixed !== s) out.push({ field: 'street', from: s, to: o.street.fixed });
    if (sh.trim() && engine) { var r = engine.checkName(sh, {}); if (r.fixed && r.fixed !== sh) out.push({ field: 'short_name', from: sh, to: r.fixed }); }
    return out;
  }

  // ---- 4. Gợi ý loại địa điểm: chỉ tên, tối đa 3, luôn có "Khác…" ----
  function categoryChips(result, currentCategory, max) {
    max = max || 3;
    var cs = (result && result.category && result.category.suggest) || [];
    var top = [];
    for (var i = 0; i < cs.length && top.length < max; i++) if (cs[i].p >= 0.05) top.push({ name: cs[i].name, id: cs[i].id });   // p chỉ dùng để lọc, KHÔNG hiển thị
    var mismatch = null;
    if (result && result.findings) for (var j = 0; j < result.findings.length; j++) { var f = result.findings[j]; if (f.code === 'INFO' && f.field === 'category') mismatch = f.msg; }
    var show = !currentCategory ? top.length > 0 : !!mismatch;   // chưa chọn → gợi ý; đã chọn mà mô hình rất chắc là loại khác → nhắc nhẹ
    return { show: show, chips: top, showOther: true, mismatchMessage: currentCategory ? mismatch : null };
  }

  // ---- 5. Debounce 500 ms ----
  function debounce(fn, ms) {
    var t = null, lastArgs = null; ms = ms == null ? 500 : ms;
    function d() { lastArgs = arguments; if (t) clearTimeout(t); t = setTimeout(function () { t = null; fn.apply(null, lastArgs); }, ms); }
    d.flush = function () { if (t) { clearTimeout(t); t = null; fn.apply(null, lastArgs || []); } };
    d.cancel = function () { if (t) clearTimeout(t); t = null; };
    return d;
  }

  var api = { VERSION: '1.2.0', laneSpans: laneSpans, houseParts: houseParts, pendingFixes: pendingFixes, categoryChips: categoryChips, debounce: debounce,
    COLORS: { light: { so: '#4b5249', ngo: '#1f6fd1', ngach: '#c46a00', hem: '#8a3fc7', soSoft: '#eceee9', ngoSoft: '#e5effc', ngachSoft: '#fff0dc', hemSoft: '#f3e9fc' },
              dark:  { so: '#c5cbc0', ngo: '#6aa8ff', ngach: '#f5a640', hem: '#c58bff', soSoft: '#262a23', ngoSoft: '#16243a', ngachSoft: '#2e2112', hemSoft: '#271a35' } } };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.NamingUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
