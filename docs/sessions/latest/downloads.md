# Latest Snapshot — `downloads/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-093311-bb40f46`
**Session file**: [`./20260519-093311-bb40f46.md`](../20260519-093311-bb40f46.md)
**Commit**: `bb40f46` — feat(native-orders): realtime data CRUD qua SSE topic 'web2:native-orders'
**Last updated**: 2026-05-19 09:33:11 +07
**Summary**: feat(native-orders): realtime data CRUD qua SSE topic 'web2:native-orders'

## Files changed in this commit (`downloads/`)

- `downloads/n2store-session/native-orders-sse.png`

## Last 5 commits touching `downloads/`

- `bb40f462` feat(native-orders): realtime data CRUD qua SSE topic 'web2:native-orders' _(2026-05-19)_
- `3c5d5c10` feat(web2-products): SSE pub/sub thay Firestore tickle — server broadcast khi DB write _(2026-05-19)_
- `228e8cf2` feat(so-order): nút edit ảnh overlay (pencil) — sửa được ảnh kể cả khi đã có ảnh _(2026-05-18)_
- `20edfcd1` refactor(so-order): sync sang local-first — bỏ onSnapshot, debounce push, pull-on-focus _(2026-05-18)_
- `3e5e034a` feat(so-order): inline edit Ngày giao / Đợt / Kiện / KG ở shipment header (click → input → Enter/blur commit) _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-093311-bb40f46` cho Claude walk chain theo CLAUDE.md protocol.
