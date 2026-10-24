# Học lại engine từ nhãn mới

Cần Python 3.9+ với `pandas`, `scikit-learn`, `scipy` (chỉ khi học lại; engine chạy không cần Python).

```sh
cd train
# 1) học từ điển + mô hình category từ toàn bộ nhãn
python3 learn.py ../../contributions.csv ../tests/labels/labels_v2.jsonl ../tests/labels/split_v2.json all learned.json
# 2) nhúng vào engine
python3 build_engine.py learned.json ../lib/naming_engine.js
# 3) kiểm hồi quy + độ chính xác
node ../tests/regression.js && node ../tests/gold_eval.js ../../contributions.csv all
```

Muốn đo độ robust thật thì học với `train` thay cho `all`, rồi chạy `gold_eval.js … test`.
Thêm nhãn mới: thêm dòng vào `labels_v2.jsonl` (cùng định dạng), id phải có trong file contributions.
Sau khi học lại, CLI `vmap-naming.js` và các file HTML trong `tools/` cần build lại để nhúng engine mới (xem `build.sh` của bản nguồn), hoặc dùng thẳng `lib/naming_engine.js`.
