# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-203311-f19fcbd`
**Session file**: [`./20260618-203311-f19fcbd.md`](../20260618-203311-f19fcbd.md)
**Commit**: `f19fcbd` — auto: session update
**Last updated**: 2026-06-18 20:33:11 +07
**Summary**: auto: session update

## Files changed in this commit (`native-orders/`)

- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `26a18e91c` fix(native-orders): giữ modal 3-cột Pancake (có tìm kiếm) + fallback resolve hội thoại theo SĐT khi fbid lệch PSID _(2026-06-18)_
- `5f656a890` feat(web2/product-counter): phone-only app-like UI (full-screen, safe-area, bottom-bar thumb-zone) _(2026-06-18)_
- `6d1fc53f2` fix(web2): audit toàn bộ Web 2.0 — 16 bug (IME, race, null-deref, leak, double-submit, money display) _(2026-06-18)_
- `d68cf952d` feat(web2): Popup dùng chung — alert/confirm/popup nhiều loại + hiệu ứng custom + migrate toàn cục _(2026-06-17)_
- `75f7c5a08` fix(native-orders): bộ lọc chiến dịch NHÓM (cha) vs RIÊNG LẺ (bài) — loại trừ 2 chiều + tự chọn 2 bài mới nhất _(2026-06-17)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-203311-f19fcbd` cho Claude walk chain theo CLAUDE.md protocol.
