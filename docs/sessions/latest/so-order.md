# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-180736-228e8cf`
**Session file**: [`./20260518-180736-228e8cf.md`](../20260518-180736-228e8cf.md)
**Commit**: `228e8cf` — feat(so-order): nút edit ảnh overlay (pencil) — sửa được ảnh kể cả khi đã có ảnh
**Last updated**: 2026-05-18 18:07:36 +07
**Summary**: feat(so-order): nút edit ảnh overlay (pencil) — sửa được ảnh kể cả khi đã có ảnh

## Files changed in this commit (`so-order/`)

- `so-order/css/so-order.css`
- `so-order/index.html`
- `so-order/js/so-order-app.js`

## Last 5 commits touching `so-order/`

- `228e8cf2` feat(so-order): nút edit ảnh overlay (pencil) — sửa được ảnh kể cả khi đã có ảnh _(2026-05-18)_
- `20edfcd1` refactor(so-order): sync sang local-first — bỏ onSnapshot, debounce push, pull-on-focus _(2026-05-18)_
- `f5cb1cb3` fix(so-order): bỏ giật khi sync — skip Firestore snapshot có hasPendingWrites _(2026-05-18)_
- `3e5e034a` feat(so-order): inline edit Ngày giao / Đợt / Kiện / KG ở shipment header (click → input → Enter/blur commit) _(2026-05-18)_
- `4b338d24` feat(so-order): bảng giống native-orders — font Segoe UI + header bg + button action màu _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-180736-228e8cf` cho Claude walk chain theo CLAUDE.md protocol.
