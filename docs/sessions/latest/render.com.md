# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-192358-3d11612`
**Session file**: [`./20260625-192358-3d11612.md`](../20260625-192358-3d11612.md)
**Commit**: `3d11612` — auto: session update
**Last updated**: 2026-06-25 19:23:58 +07
**Summary**: auto: session update

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-zalo.js`
- `render.com/services/web2-zalo-zca.js`

## Last 5 commits touching `render.com/`

- `927c3e8a3` fix(web2/zalo): focus-lease phiên Zalo — hết spam 'Đổi thiết bị' trên chat.zalo.me _(2026-06-25)_
- `03107ca6f` fix(web2): SSE audit — KPI employee-ranges publish + assignments/returns PII/zalo debounce _(2026-06-25)_
- `6a0e651f0` fix(web2/balance-history): broadcast SSE khi cleanup-stale-pending + audit SSE toàn Web 2.0 _(2026-06-25)_
- `ac6f6ce5d` fix(web2/products): SSE realtime hiện SP mới từ so-order (không cần F5) + region-derive prefix mã _(2026-06-25)_
- `a90cf119b` fix(web2): backfill region từ PREFIX MÃ (HN/HC) — note ILIKE chữ Việt không khớp Unicode _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-192358-3d11612` cho Claude walk chain theo CLAUDE.md protocol.
