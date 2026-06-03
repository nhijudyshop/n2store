# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-201846-f694619`
**Session file**: [`./20260603-201846-f694619.md`](../20260603-201846-f694619.md)
**Commit**: `f694619` — feat(web2): photo-studio v7 — giao diện mobile camera-app + bottom sheet tùy chọn
**Last updated**: 2026-06-03 20:18:46 +07
**Summary**: feat(web2): photo-studio v7 — giao diện mobile camera-app + bottom sheet tùy chọn

## Files changed in this commit (`render.com/`)

- `render.com/routes/wallet-deposits.js`

## Last 5 commits touching `render.com/`

- `9b4fc5e75` fix(web2): wallet-deposits (ví NCC+KH) đọc web2*balance_history (web2Db) thay balance_history Web 1.0 — 1 nguồn SePay *(2026-06-03)\_
- `e73f9f7f3` feat(web2): rematch-all endpoint (keyset id, xử lý mỗi GD 1 lần) — fix reprocess re-pick recent rows _(2026-06-03)_
- `91c2b764b` feat(web2): admin backup+reset ví/matching web2Db (lấy lại số dư từ đầu, chỉ web2 không đụng Web 1.0) _(2026-06-03)_
- `27d2623fd` feat(web2): kho KH thống nhất — PATCH /api/web2/customers/:id (sửa tên/SĐT/địa chỉ → TPOS by tposId + cache) + native-orders sync phone + fix report-delivery cột thật _(2026-06-03)_
- `3f6341d4f` fix(web2): report-delivery — fast*sale_orders không có cột group, group theo carrier_name *(2026-06-03)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-201846-f694619` cho Claude walk chain theo CLAUDE.md protocol.
