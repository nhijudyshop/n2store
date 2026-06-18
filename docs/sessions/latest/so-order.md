# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-192635-a122c7d`
**Session file**: [`./20260618-192635-a122c7d.md`](../20260618-192635-a122c7d.md)
**Commit**: `a122c7d` — auto: session update
**Last updated**: 2026-06-18 19:26:35 +07
**Summary**: auto: session update

## Files changed in this commit (`so-order/`)

- `so-order/js/so-order-app.js`

## Last 5 commits touching `so-order/`

- `6d1fc53f2` fix(web2): audit toàn bộ Web 2.0 — 16 bug (IME, race, null-deref, leak, double-submit, money display) _(2026-06-18)_
- `d68cf952d` feat(web2): Popup dùng chung — alert/confirm/popup nhiều loại + hiệu ứng custom + migrate toàn cục _(2026-06-17)_
- `8ffcdb496` fix(so-order): meta per-NCC sub-header value-driven + cụm Sửa lô luôn hiện đủ 5 ô (verified end-to-end) _(2026-06-17)_
- `f5b81826f` auto: session update _(2026-06-17)_
- `970000a95` fix(so-order): Sửa lô tách NCC per-row (lô = nguyên ngày giao, nhiều NCC) — ẩn ô NCC chung, thêm cột NCC mỗi dòng + picker Ví NCC _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-192635-a122c7d` cho Claude walk chain theo CLAUDE.md protocol.
