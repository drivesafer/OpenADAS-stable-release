# VMap Naming Assistant v1.2.0

Bộ kiểm tra và gợi ý sửa **tên địa điểm**, **số nhà / ngõ / ngách** và **đường phố** theo quy chuẩn
P-03 (Place Naming v1.0) và A-02 (Address Naming v1.0), kèm **gợi ý loại địa điểm (category) từ tên**.
Mã lỗi theo tài liệu "Các bài toán cho Dữ liệu bản đồ" v0.9.

Gói chạy độc lập: không cần mạng, không cần server, không cần `npm install`, không gọi AI, không cần runtime ML
(phần học từ dữ liệu được lưu sẵn thành bảng số trong file JS).
Chỉ cần Node.js 16 trở lên (cho dòng lệnh) hoặc một trình duyệt (cho công cụ HTML).

## Trong gói có gì

| File | Dùng để |
| --- | --- |
| `vmap-naming.js` | Dòng lệnh: audit cả file CSV, hoặc kiểm một bản ghi. Engine đã nhúng sẵn. |
| `tools/audit_tool.html` | MapOps mở bằng trình duyệt, kéo file CSV vào, lọc theo mã lỗi, xuất CSV. Chạy offline. |
| `tools/form_demo.html` | Form "Đề xuất thêm địa điểm" mẫu có gợi ý sửa khi gõ và nút Áp dụng. |
| `lib/naming_engine.js` | Thư viện để nhúng vào app/backend (trình duyệt hoặc Node). |
| `lib/naming_engine.min.js` | Bản rút gọn của thư viện cho app. |
| `lib/naming_ui_helpers.js` | Logic hiển thị dùng chung cho mọi nền tảng: tô màu Ngõ/Ngách/Hẻm, chip số nhà, danh sách "Áp dụng", chip loại địa điểm, debounce. |
| `lib/naming_engine_selftest.js` | Self-test chạy trên runtime đích (iOS/Android/RN/Flutter): kiểm tính năng RegExp ES2018 và 63 ca hồi quy. |
| `data/categories.json` | Danh sách loại địa điểm dùng trong form mẫu. |
| `tests/` | Kiểm hồi quy (63 ca), 3.891 nhãn (`labels/labels_v2.jsonl`, chia train/test theo người đóng góp) và script đo độ chính xác. |
| `evaluation_v1.2.txt` | Kết quả đo trên tập test giữ riêng (22 người đóng góp chưa từng thấy), so v1.0 / v1.1 / v1.2, và các thử nghiệm. |
| `train/` | Script học lại từ nhãn mới (cần Python + scikit-learn, chỉ khi học lại). |

## Cách dùng nhanh

```sh
# Audit một file contribution, ra file *_audit.csv + bảng tổng hợp
node vmap-naming.js audit contributions_20261023-0912.csv -o audit.csv --summary summary.json

# Chỉ xuất bản ghi có lỗi
node vmap-naming.js audit contributions.csv -o loi.csv --only-errors

# Kiểm một bản ghi (exit code 2 nếu có lỗi)
node vmap-naming.js check --name "Nhà Hàng Biển Đông" --house "4 ngách 10 ngõ 199" --street "Trung Kính" --province "Thành phố Hà Nội"

# Bảng mã lỗi
node vmap-naming.js codes
```

Cột CSV mặc định: `name, house_number, street, category, province`. Khác tên thì dùng `--col-name`, `--col-house`,
`--col-street`, `--col-category`, `--col-province`. File ra giữ nguyên cột gốc và thêm:
`name_suggest, house_suggest, street_suggest, category_suggest, category_suggest_p, error_codes, max_level, messages`.

## Nhúng vào app / backend

```js
// Node
const E = require('./lib/naming_engine.js');
// Trình duyệt: <script src="naming_engine.min.js"></script>  → window.NamingEngine

const r = E.checkRecord({
  name: 'Nhà Hàng lẩu Nấm Ashima HN', house_number: '4 ngách 10 ngõ 199',
  street: 'Trung Kính', category: 'Nhà hàng', province: 'Thành phố Hà Nội'
});
r.name.fixed     // 'Nhà hàng Lẩu Nấm Ashima'
r.house.fixed    // '4 Ngách 199/10'
r.house.structure.reading   // 'Số nhà 4 → Ngách 10 → Ngõ 199 → Trung Kính'
r.street.fixed              // 'Phố Trung Kính'  (tuyến đã biết trong từ điển đường học từ dữ liệu)
r.category.suggest          // [{ name:'Nhà hàng', id:'FNB_EAT_RESTAURANT', p:0.99 }, …] (top 3)
E.suggestCategory('Pharmacity Cầu Giấy')   // [{ name:'Nhà thuốc', p:0.94 }, …]
```

Hàm có sẵn: `checkRecord(rec)`, `checkName(name, ctx)`, `checkHouse(house, ctx)`, `checkStreet(street, ctx)`,
`suggestCategory(name, k)`, `regionOf(province)`, `CODEBOOK`, `VERSION`, `LEARNED_META`.

Mỗi phát hiện (`finding`) có: `field`, `code`, `msg`, `level`, `severity`, và `options` khi có nhiều cách sửa.
Giá trị gợi ý nằm ở `fixed`. `fixed = null` nghĩa là không có gợi ý tự động, người dùng phải nhập lại.

| Mức | Nghĩa | Cách xử lý đề xuất |
| --- | --- | --- |
| `L3` | Chỉ đổi cách viết, không đổi nghĩa (hoa thường, viết tắt, bỏ "Hà Nội, Việt Nam" khỏi số nhà) | Tự áp, MapOps kiểm mẫu |
| `L1` | Có đề xuất nhưng có thể đổi nghĩa (dựng cấp ngõ từ `150/34`, chọn Phố hay Đường) | Người dùng/MapOps xác nhận |
| `L0` | Chỉ gắn cờ, không tự sửa được (thiếu số nhà, ô đường là tên khu, tên là địa chỉ) | Người sửa |

`severity`: `error` = vi phạm quy chuẩn; `warn` = cần xem lại.

### Lưu ý khi nhúng vào form nhập

- **Debounce 500 ms:** chỉ gọi `checkRecord` khi người dùng đã ngừng gõ 500 ms. Gọi ngay, không chờ, khi người dùng rời ô (blur), bấm "Áp dụng" hoặc bấm "Gửi". Phần tô màu Số nhà/Ngõ/Ngách/Hẻm chỉ dùng regex nên vẫn cập nhật theo từng phím. Xem `scheduleRun`/`flushRun` trong `tools/form_demo.html`.
- **Gợi ý loại địa điểm:** chỉ hiện tên loại, tối đa 3 gợi ý, không hiện % độ tin cậy. Thêm nút "Khác…" để mở menu chọn đầy đủ.

## Cách engine hoạt động

Engine gồm **bộ luật xác định** + **dữ liệu học từ 3.891 nhãn tay** (nhúng sẵn trong file, khối `LEARNED`). Cùng đầu vào
luôn ra cùng kết quả. Phần học gồm: từ điển ~530 tuyến đường đã biết (để tự chọn `Phố`/`Đường`), ~150 giá trị ô
đường không phải đường, tên phường, ~50 khu cha (POI con), ~45 tên chỉ là loại hình, ~280 địa danh chi nhánh,
cách viết brand, chính sách viết hoa theo từ đầu tên, và mô hình gợi ý category.
Mỗi bản ghi đi qua 3 khối, theo thứ tự:

1. **Đường phố** (chạy trước vì số nhà cần tên đường để bỏ phần lặp)
   - Chuẩn hoá Unicode NFC, chữ Ð → Đ (A6.4); bỏ ngoặc, phường, thành phố đi kèm (A6.6, A3.3).
   - Đổi `Đ.` / `P.` / `St` → `Đường` / `Phố` (A6.1, A6.2); bỏ tiền tố lặp.
   - Tách `Ngõ 371` ra khỏi `Ngõ 371 Phố Kim Mã` và chuyển sang ô số nhà (A2.7); báo nếu ngõ hai ô mâu thuẫn (A9.4).
   - Tách mã lô / số nhà dính đầu tên đường (`Lô 9-TT4 Trần Văn Lai`) (A6.6).
   - Nhận diện tên khu, toà, TTTM, thôn, xóm đứng ở ô đường (A3.x) → gắn cờ.
   - Sửa chính tả từ điển nhỏ (A6.5), hoa thường (A6.3), thiếu `Phố/Đường` (A6.1; miền Bắc cho chọn, miền Nam/Trung gợi ý `Đường`).
2. **Số nhà / ngõ / ngách**
   - Bỏ Plus Code, phần địa chỉ dán từ Google (phường, quận cũ, thành phố, mã bưu chính, quốc gia) (A2.7, A1.3, A12.4).
   - Bỏ tên đường, tên khu đô thị/toà lặp trong ô số nhà (A2.7); bỏ `Số`, `No.`, `Nhà` (A2.6).
   - Chuẩn tên cấp: `Ng.` → `Ngõ`, `Ngh.`/`nghách` → `Ngách`, chữ thường → hoa (A2.4, A8.6, A2.1).
   - **Parser chuỗi ngõ theo miền** (A-02): miền Bắc dựng `Số nhà + Cấp + đường dẫn`, cấp theo độ sâu
     (1 = Ngõ, 2 = Ngách, 3+ = Hẻm). Ví dụ `4 ngách 10 ngõ 199` → `4 Ngách 199/10`; `27/8 ngõ 294` → `8 Ngách 294/27`;
     `150/34` → `34 Ngõ 150` (L1, theo A-02 §3). Miền Nam giữ dạng gạch chéo, không tự suy cấp (A-02 §5–6).
   - Còn chữ + số không phải ngõ → mã toà/lô/tầng (A2.5); không có số → thiếu số nhà (A11.1).
3. **Tên địa điểm**
   - Ký tự: NFC, emoji, ký tự đặc biệt, khoảng trắng, gạch nối phải có cách hai bên, chữ Hán/Hàn (P3.1).
   - Phần thừa: ngoặc, tầng, hậu tố thành phố/quận, chữ quảng cáo, số điện thoại, đoạn mô tả sau ` - ` (P3.5).
   - Viết tắt P-03 §12: KS, BV, KĐT, TTTM, CS, Cty… (P3.4).
   - Từ điển ~115 cách viết của brand/chuỗi (P3.6); chuỗi theo mẫu `Brand - Chi nhánh`, bỏ số nhà (P4.4).
   - POI con theo `Parent - Child` (P9.2), ví dụ `Toà T3 - Times City` → `Times City - Toà T3`.
   - Mất dấu (P3.3), viết hoa (P3.2): phần loại hình viết kiểu câu (`Nhà hàng`, `Khách sạn`…), phần tên Title Case,
     giữ nguyên tên cơ quan chính thức và brand.
   - Tên là địa chỉ / không phải tên (P3.7); thiếu category (P7.1).
4. **Category** — `suggestCategory`: hồi quy logistic **L1 (thưa)** trên từ, cặp từ và cụm 3–4 ký tự của tên (bỏ dấu),
   đặc trưng được **băm** (FNV-1a, 2^15 ô) nên không phải lưu từ vựng, trọng số lượng tử hoá **int8**, mã hoá
   delta-varint + base64; cộng bộ nhớ brand/từ đầu (`Pharmacity …` → Nhà thuốc). Trả top 3 kèm xác suất. Thiếu category → P7.1 kèm
   gợi ý; category đã chọn mà mô hình chắc ≥ 85% là loại khác → cảnh báo nhẹ.

Vùng miền lấy từ `province` (`regionOf`): Bắc, Trung, Nam. Không có tỉnh thì coi là miền Bắc.

## Kích thước và tốc độ

Đo trên 1 vCPU Xeon 2,8 GHz, Node 22, file 3.891 bản ghi:

| | Giá trị |
| --- | --- |
| `lib/naming_engine.js` | 187 KB (gzip 84 KB) — mô hình category ~95 KB (v1.1: 413 KB / 340 KB) |
| `lib/naming_engine.min.js` | 159 KB (gzip 74 KB) |
| Phụ thuộc | Không có |
| Thời gian nạp | ~36 ms (Node, máy chủ thường) |
| Tốc độ | ~3.200 bản ghi/giây (gồm cả gợi ý category) |
| Độ trễ một bản ghi | p50 0,25 ms · p99 1,4 ms — đủ chạy mỗi lần gõ phím trên điện thoại |

## Độ chính xác

Nhãn: 3.891 bản ghi gán tay theo `tests/labels/GUIDELINES_v2.md`. Chia **theo người đóng góp**: train 3.077 bản ghi
(86 người), test 814 bản ghi của 22 người chưa từng thấy — đo đúng tình huống gặp người dùng mới.
Engine dùng để đo chỉ học từ train; bản phát hành học lại từ toàn bộ nhãn.

Phát hiện "trường này có lỗi" trên test:

| Trường | Precision | Recall | F1 | Gợi ý trùng y hệt nhãn |
| --- | --- | --- | --- | --- |
| Tên | 0,92 | 0,89 | 0,90 (v1.1: 0,89) | 55% |
| Số nhà / ngõ / ngách | 0,99 | 0,96 | 0,98 (v1.1: 0,94) | 61% |
| Đường | 1,00 | 0,98 | 0,99 | 88% |

Gợi ý category (test, 772 bản ghi có category): đúng ngay gợi ý đầu **66%**, nằm trong 3 gợi ý **82%**,
đúng nhóm ngành **79%**. Khi mô hình chắc (p ≥ 0,85, 57% trường hợp) thì đúng **84%**.
Phần lớn chỗ "sai" là Nhà hàng ↔ Quán ăn — chính người đóng góp cũng chọn lẫn hai loại này.

Chi tiết theo mã lỗi và các thử nghiệm: `evaluation_v1.2.txt`. Chạy lại: `node tests/gold_eval.js ../contributions_20261023-0912.csv test`
(với engine phát hành, số test sẽ cao hơn thực tế vì engine đã học cả tập test).

## Sửa luật và kiểm hồi quy

- Cách tốt nhất: thêm/sửa nhãn trong `tests/labels/labels_v2.jsonl` rồi học lại (`train/README.md`) — từ điển đường,
  brand, khu cha, category tự cập nhật.
- Sửa tay: `BRAND_ALIASES` (cách viết sai → đúng) và `CHAINS` (brand có chi nhánh) trong `train/naming_engine.src.js`.
- Thêm khu cha cho POI con: `PARENTS`. Thêm quận cũ: `DISTRICTS_OLD`. Thêm lỗi chính tả đường: `STREET_TYPOS`.
- Sau mỗi lần sửa chạy `node tests/regression.js` (48 ca đã chốt) và `tests/gold_eval.js`.
  Ca hồi quy chốt hành vi hiện tại, kể cả vài ca chưa hoàn hảo; đổi ca nào thì sửa `tests/cases.json` có chủ đích.
- Đổi luật → tăng `VERSION` trong engine, để file audit ghi được phiên bản nào đã chạy.

## Giới hạn đã biết

- Chỉ tự chọn `Phố`/`Đường` cho ~530 tuyến đã gặp trong dữ liệu; tuyến mới vẫn hỏi (cần Street Dictionary đầy đủ).
- Không kiểm ngõ có tồn tại trên bản đồ (cần cây ngõ A8); `150/34` → `34 Ngõ 150` vì thế để mức L1.
- Tên: chưa bắt hết mô tả dài, brand ngoài từ điển, POI con ngoài danh sách khu cha, lỗi chính tả tên riêng.
  Một phần do chính nhãn tay chưa nhất quán (ví dụ `Tiệm bánh` / `Tiệm Bánh` đều được chấp nhận).
- Category: mô hình chỉ biết 156 loại có trong dữ liệu; brand chưa từng gặp (ví dụ `Vinmec`) có thể bị gợi ý sai.
- Quy tắc miền Trung (Kiệt) chưa được đo vì mẫu chỉ có 1 bản ghi miền Trung.
