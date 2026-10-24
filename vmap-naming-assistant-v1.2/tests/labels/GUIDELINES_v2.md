# Hướng dẫn gán nhãn v2 — Naming Assistant (VMap contributions)

Bạn gán nhãn từng bản ghi contribution (place) theo 2 quy chuẩn:
- `P-03 Place Naming Convention v1.0` (file `P-03.md`) — cho trường **name**
- `A-02 Address Naming Convention v1.0` (file `A-02.md`) — cho trường **house_number** (Số nhà / ngõ / ngách) và **street** (Đường phố gần địa chỉ)

Mã lỗi lấy theo tài liệu "Các bài toán cho Dữ liệu bản đồ" (mã bài toán + số kiểu con, ví dụ `P3.2` = bài toán P3, kiểu 2).
Chỉ dùng mã trong bảng dưới. Một trường có thể có nhiều mã.

## 1. Mã lỗi dùng được

### Tên (name)
| Mã | Ý nghĩa | Ví dụ sai → đúng |
|---|---|---|
| P3.1 | Ký tự lỗi: Unicode NFD, chữ Ð (eth), ký tự toán học, emoji, ký tự đặc biệt (★ @ ! ? # \| ), khoảng trắng đầu/cuối/kép, gạch nối không có khoảng trắng (`A-B` phải là `A - B`), dấu phẩy dùng làm phân tách brand/branch | `ATM-Techcombank` → `ATM Techcombank`; `AEON Mall-Tân Phú` → `AEON Mall - Tân Phú` |
| P3.2 | Viết hoa sai: TOÀN HOA, toàn thường, chữ thường ở từ tên riêng/mô tả, lỗi giữa âm tiết (`ĐạI`), phần loại hình viết hoa sai (`Nhà Hàng` → `Nhà hàng`, `Khách Sạn` → `Khách sạn`, `Cửa Hàng` → `Cửa hàng`) | `PAO CAFE` → `Pao Cafe`; `Lyna beauty spa` → `Lyna Beauty Spa`; `Nhà Hàng Đạt Béo` → `Nhà hàng Đạt Béo` |
| P3.3 | Mất dấu tiếng Việt | `Nha hang Ngon` → `Nhà hàng Ngon` |
| P3.4 | Viết tắt không được phép (P-03 §12): KS, NH, CF, CH, BV, TTTM, KĐT, KDC, TT, CN (chi nhánh), CS (cơ sở), P., Q., TP., HN, HCM, ĐH, CĐ, MN, TH, Cty/CTY, TNHH? (TNHH giữ được nếu là tên pháp nhân trên biển) | `KS Hoà Bình` → `Khách sạn Hoà Bình`; `TTTM Go Thăng Long` → `GO! Thăng Long` / `Trung tâm thương mại Go Thăng Long` |
| P3.5 | Thừa phần không phải tên: hậu tố thành phố/quận (`Hà Nội`, `HN`, `HCM`, `Cầu Giấy`), chữ quảng cáo (`Uy Tín`, `Giá Rẻ`, `Số 1`), số điện thoại, mô tả dài, liệt kê món | `Dũng Hair Salon 63 Cửa Nam HN` → `Dũng Hair Salon` |
| P3.6 | Brand viết sai | `Vietinbank` → `VietinBank`; `Winmart` → `WinMart`; `Vpbank` → `VPBank`; `Highland Coffee` → `Highlands Coffee` |
| P3.7 | Tên không phải tên: là địa chỉ, số nhà, tên đường, mã căn, rác, `Nhà riêng`, URL, vết sửa `A -> B` | `15 trung hoà, cầu giấy` (không có tên thật) |
| P4.4 | Chi nhánh/địa điểm của chuỗi dính vào brand, không có ` - ` (P-03 §7 Chain = `Brand - Branch`) ; hoặc có số nhà trong tên chi nhánh | `Starbucks Coffee Nguyễn Huệ` → `Starbucks Coffee - Nguyễn Huệ`; `WinMart+ 12 Phạm Tuấn Tài` → `WinMart+ - Phạm Tuấn Tài` |
| P9.2 | POI con (toà/block/cổng/sảnh/bãi đỗ) sai cấu trúc `Parent - Child` (P-03 §8) | `Toà T3 - Times City` → `Times City - Toà T3`; `Park 7 Times City` → `Times City - Park 7` |
| P7.1 | Không có category | category rỗng |

### Số nhà / ngõ / ngách (house_number)
| Mã | Ý nghĩa | Ví dụ sai → đúng (miền Bắc) |
|---|---|---|
| A2.1 | Chuỗi ngõ dạng chữ chưa chuẩn: thứ tự sai, chữ thường (`ngõ`, `ngách`), không gom về dạng chuẩn | `2 ngõ 371` → `2 Ngõ 371`; `4 ngách 10 ngõ 199` → `4 Ngách 199/10` |
| A2.2 | Chuỗi gạch chéo nhiều cấp chưa có tên cấp / mơ hồ | `27/8` (HN) → `8 Ngõ 27` (cần xác nhận); `8/11/36/59` → `59 Hẻm 8/11/36` |
| A2.4 | Viết tắt, dính chữ cấp đường | `Ng. 75` → `Ngõ 75`; `Ngh. 23/72` → `Ngách 23/72`; `49ng` (mơ hồ) |
| A2.5 | Mã toà / căn / lô / tầng / gian nằm trong số nhà (không phải số nhà) | `Tầng 1, T145, Aeon mall Hà Đông`; `CT4-1`; `Lô 103-TT3` |
| A2.6 | Số có tiền tố/hậu tố thừa: `Số 5`, `số101`, `No. 27` | `Số 26` → `26` |
| A2.7 | Sai field: số nhà chứa tên đường / phường / thành phố / quốc gia / mã bưu chính / Plus Code (dán cả địa chỉ Google), hoặc chuỗi ngõ bị lặp ở cả hai field | `63 P. Cửa Nam, Cửa Nam, Hà Nội 100000, Việt Nam` → `63`; `15 trung hoà` (street = Phố Trung Hoà) → `15` |
| A2.9 | Sai quy ước miền: dùng `Hẻm` cấp 1 / `Kiệt` ở miền Bắc, `Ngõ/Ngách` ở miền Nam | HN `hẻm 5` → `Ngõ 5` |
| A8.6 | Lỗi chính tả cấp | `nghách` → `Ngách`; `ngỏ` → `Ngõ` |
| A11.1 | Không có số nhà (rỗng hoặc chỉ có tên khu) | `Khu đô thị Nam Cường, Nghĩa Đô, Hà Nội` |
| A11.4 | Chỉ có ngõ/ngách, không có số nhà | `Ngõ 20` |
| A1.3 | Còn cấp quận/huyện cũ trong chuỗi | `…, Cầu Giấy, Hà Nội` / `Q. Nam Từ Liêm` |
| A12.4 | Mã bưu chính trong chuỗi | `… Hà Nội 100000` |

### Đường phố (street)
| Mã | Ý nghĩa | Ví dụ sai → đúng |
|---|---|---|
| A6.1 | Tiền tố loại đường sai/thiếu/lặp/viết tắt (`Đ.`, `P.`, `St`, `Đường Đường`); ở miền Bắc thiếu `Phố`/`Đường` | `Minh Khai` → `Phố Minh Khai`; `Đ. Láng` → `Đường Láng` |
| A6.2 | Không dấu / tiếng Anh | `Aeon Mall Ha Dong` |
| A6.3 | Hoa thường sai | `thuỵ khuê tây hồ` → `Phố Thụy Khuê`; `Đường số 4` → `Đường Số 4` |
| A6.4 | Unicode NFD / eth | |
| A6.5 | Sai chính tả | `Nhụê Giang` → `Nhuệ Giang` |
| A6.6 | Rác đi kèm tên đường: ngoặc, phường, quận, số nhà, `Lô E9` | `Ngõ Văn Chương 2 (Hồ Linh Quang)` |
| A3.x | Field đường chứa tên khu/không phải đường: A3.1 phường/khu cũ, A3.3 thành phố, A3.4 KĐT/khu tập thể/chung cư, A3.5 toà/TTTM, A3.6 thôn/xóm/tổ dân phố/cụm dân cư, A3.8 giữ chỗ | `Aeon Mall Hà Đông`, `TT4`, `Tòa Golden Palace`, `Tổ Dân Phố Hoàng Văn Thụ` |
| A2.7 | Field đường chứa ngõ/ngách (thuộc về field số nhà) hoặc chứa số nhà | `Ngõ 371 Phố Kim Mã` → street `Phố Kim Mã`, chuyển `Ngõ 371` sang số nhà |
| A9.4 | Ngõ ở số nhà và ngõ ở đường mâu thuẫn nhau | house `24 ngõ 358/40` vs street `Ngõ 583 Phố Vũ Tông Phan` |
| A11.2 | Rỗng | |

## 2. Dạng chuẩn (canonical) cần điền vào trường "fixed"

**Tên**: NFC, 1 khoảng trắng, Title Case tự nhiên (mỗi từ của tên riêng/mô tả viết hoa chữ đầu: `Bánh Mì Huỳnh Hoa`, `Quán Nước Mộc`), riêng **phần loại hình** viết kiểu câu: `Nhà hàng`, `Khách sạn`, `Cửa hàng`, `Nhà thuốc`, `Nhà nghỉ`, `Nhà sách`, `Bệnh viện`, `Phòng khám`, `Công viên`, `Siêu thị`, `Ngân hàng`, `Tạp hóa`, `Trạm sạc`, `Bãi đỗ xe`, `Khu đô thị`, `Trường Mầm non`, `Trường Tiểu học`, `Thẩm mỹ viện`. Brand giữ đúng cách viết chính thức (`VPBank`, `WinMart+`, `KFC`, `CGV`, `AEON`, `GS25`). Chuỗi: `Brand - Chi nhánh/Địa điểm` (không số nhà). POI con: `Parent - Child`. Từ nước ngoài như `the`, `of`, `&`, `de` có thể giữ thường khi ở giữa tên.
Nếu không chắc tên thật (P3.7) → `fixed` để `null`.

**Số nhà (miền Bắc)**: `{số} {Cấp} {chuỗi}` với Cấp viết hoa: `Ngõ A`, `Ngách A/B` (A = ngõ, B = ngách), `Hẻm A/B/C`. Không có `Số`, tên đường, phường, thành phố, mã bưu chính.
- `2 ngõ 371` → `2 Ngõ 371`
- `4 ngách 10 ngõ 199` → `4 Ngách 199/10`
- `22 Ngh. 23/72 Đ. Đức Diễn, Phú Diễn, Hà Nội` → `22 Ngách 23/72`
- `69 ngách 32/84` → `69 Ngách 32/84`
- `27/8 ngõ 294` → `8 Ngách 294/27`
- `150/34` (Bắc, A-02 §3.1 đọc ngoài vào trong, số cuối là số nhà) → `34 Ngõ 150`
- Miền Nam: giữ dạng gạch chéo `75/1`, `Hẻm 1031/44` hợp lệ (A-02 §5), KHÔNG tự suy cấp.
- Mã toà/lô/tầng: giữ nguyên phần mã nhưng bỏ phần địa chỉ hành chính; gắn A2.5.
- Nếu không xác định được → `fixed` = `null`.

**Đường**: `Phố X` / `Đường X` Title Case, không chứa ngõ/ngách (đã chuyển sang số nhà), không chứa phường/quận/thành phố. Nếu không phải đường → `fixed` = `null`.

Vùng miền: Bắc = Hà Nội, Hải Phòng, Bắc Ninh, Hưng Yên, Quảng Ninh, Phú Thọ, Tuyên Quang, Ninh Bình, Thái Nguyên, Lạng Sơn, Lào Cai, Điện Biên, Lai Châu, Sơn La, Cao Bằng, Thanh Hóa(*Trung Bắc*, coi như Trung). Trung = Thanh Hóa → Khánh Hòa, Huế, Đà Nẵng, Lâm Đồng, Đắk Lắk, Gia Lai, Quảng Ngãi, Quảng Trị, Nghệ An, Hà Tĩnh. Nam = TP.HCM, Đồng Nai, Tây Ninh, Vĩnh Long, Cần Thơ, An Giang, Cà Mau, Đồng Tháp.

## 3. Định dạng đầu ra (JSONL, mỗi dòng một bản ghi)
```json
{"id":"3892","name_codes":["P3.2"],"name_fixed":"Barber An Thuyên","house_codes":[],"house_fixed":"22","street_codes":[],"street_fixed":"Đường Đại Phùng I","note":"ngắn gọn, tiếng Việt"}
```
- `*_codes` = [] nghĩa là trường đó đúng quy chuẩn; khi đó `*_fixed` = giá trị gốc.
- Hãy gán nhãn **độc lập, theo phán đoán của bạn** đọc từ quy chuẩn; không cần nhất quán với tool nào.
- Không thêm mã ngoài bảng trên.


## 4. Quy ước đã chốt cho v2 (BẮT BUỘC — để nhãn giữa các annotator thống nhất)

1. **Tiền tố đường (A6.1)** áp dụng MỌI miền. Miền Nam/Trung thiếu tiền tố → `A6.1`, `street_fixed` = `Đường X`. Miền Bắc thiếu tiền tố → `A6.1`, `street_fixed` = `Phố X` hoặc `Đường X` theo hiểu biết của bạn về tuyến đó (Hà Nội: phố nội đô thường là "Phố", trục lớn/ngoại thành thường là "Đường"); không chắc thì chọn `Đường X`. Tên đường số/khu mới giữ dạng `Đường Số 4`. `Quốc lộ`, `Tỉnh lộ`, `Đường tỉnh`, `Đại lộ`, `Cầu`, `Đê`, tên ngõ có chữ (`Ngõ Thọ Xương`) là hợp lệ, không cần thêm tiền tố.
2. **Ngõ nằm ở ô đường** (`Ngõ 371 Phố Kim Mã`): gắn `A2.7` cho **street** (street_fixed = `Phố Kim Mã`). `house_fixed` = số nhà đã gộp ngõ (`2 Ngõ 371`), nhưng KHÔNG gắn mã cho house chỉ vì việc gộp này (chỉ gắn nếu bản thân ô số nhà có lỗi khác). Nếu ngõ ở hai ô khác số nhau → thêm `A9.4` cho **street**.
3. **Mã lô/số nhà dính ở đầu ô đường** (`Lô 9-TT4 Trần Văn Lai`, `78 Duy Tân`): street `A6.6`, street_fixed = tên đường (thêm tiền tố nếu thiếu, kèm A6.1); house_fixed nhận phần mã nếu ô số nhà trống.
4. **Ô đường không phải đường** (KĐT, toà, TTTM, thôn, xóm, tổ dân phố, tên phường/khu): gắn A3.x, `street_fixed` = `null` (trừ khi chính bản ghi cho thấy tên đường thật, ví dụ trong ô số nhà).
5. **Số nhà chứa mã toà/lô/tầng/gian (A2.5)**: `house_fixed` = chỉ giữ các mã + số, nối bằng `, `, viết hoa từ khoá (`Tầng 1, T145`; `Toà T3, 458`; `Lô 8, A10`); bỏ tên khu đô thị, TTTM, tên đường, phường, thành phố (kèm A2.7 nếu có phần bị bỏ). Không có số/mã nào → `A11.1`, house_fixed = `null`.
6. **Số nhà miền Bắc dạng gạch chéo không có chữ** (`150/34`, `24/6`): `A2.2`, house_fixed = `34 Ngõ 150` theo A-02 §3. Miền Nam giữ nguyên (`75/1` hợp lệ, KHÔNG gắn mã). Dạng chuẩn số nhà: `{số} Ngõ A` / `{số} Ngách A/B` / `{số} Hẻm A/B/C`.
7. **Phần loại hình đầu tên** viết kiểu câu (`Nhà hàng`, `Khách sạn`, `Cửa hàng`, `Nhà thuốc`, `Bệnh viện`, `Phòng khám`, `Trường Mầm non`, `Tòa nhà`, `Trung tâm`, `Công ty`, `Siêu thị`, `Tạp hóa`…): `Nhà Hàng` → P3.2. Ngay sau phần loại hình, một cụm loại hình con chung chung (`Cà phê`, `Đa khoa`, `Xăng dầu`, `Ngoại ngữ`, `Tiệc cưới`) viết kiểu câu HAY Title Case đều CHẤP NHẬN (không gắn mã). Phần còn lại (tên riêng, món, mô tả) phải Title Case: `Quán Bún Cá Thái Hà`, `Lyna Beauty Spa`. Tên bắt đầu bằng từ thường (`Phở bò Dũng`, `Cây xăng Hùng Xuyến`) → P3.2 → `Phở Bò Dũng`, `Cây Xăng Hùng Xuyến`.
8. **Tên cơ quan/tổ chức chính thức** (Viện, Sở, Cục, Bộ, Ủy ban, Tòa án, Viện kiểm sát, Bệnh viện công, Trường Đại học…) giữ cách viết chính thức kiểu câu (`Viện Kiểm sát Nhân dân Quận Tây Hồ`, `Bệnh viện Trung ương Quân đội 108`); chỉ gắn P3.2 nếu TOÀN HOA, toàn thường, hoặc viết hoa sai rõ (`Viện Kiểm Sát Nhân Dân` → P3.2).
9. **Chuỗi**: P-03 §7 thắng — chi nhánh viết `Brand - Chi nhánh` (`Gong Cha - Nguyễn Huệ`), không số nhà. Brand + loại dịch vụ (`ACB ATM`, `ATM Techcombank`, `Highlands Coffee`) không phải chi nhánh.
10. **POI con** theo P-03 §8 `Parent - Child` (`Times City - Toà T3`). Tên chỉ là mã toà, không có parent (`Toà nhà CT4-2`) → giữ, không gắn P9.2.
11. **Ngoặc** `(…)` trong tên → P3.5, bỏ phần ngoặc. Chữ Hán/Hàn/Nhật → P3.1, bỏ. Hậu tố thành phố/quận (`HN`, `Hà Nội`, `Cầu Giấy`) → P3.5, bỏ — TRỪ khi là một phần tên chính thức/thương hiệu (`Bảo tàng Hà Nội`, `Trường Đại học Bách khoa Hà Nội`, `InterContinental Hanoi Landmark72`, `Bánh Mì Sài Gòn`).
12. **Tên chỉ là loại hình chung** (`Gym`, `Nhà riêng`, `Trạm sạc xe điện`, `Buffet`, `Tạp hoá`) hoặc là địa chỉ → P3.7, name_fixed = `null`.
13. Category rỗng → `P7.1` (luôn gắn).
14. `*_fixed` luôn là giá trị cuối cùng ĐÃ sửa hết mọi lỗi đã gắn mã (không sửa nửa vời). Không có lỗi → copy nguyên giá trị gốc (kể cả khi gốc rỗng → "").
