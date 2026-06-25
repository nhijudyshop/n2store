# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-184631-03107ca`
**Session file**: [`./20260625-184631-03107ca.md`](../20260625-184631-03107ca.md)
**Commit**: `03107ca` — fix(web2): SSE audit — KPI employee-ranges publish + assignments/returns PII/zalo debounce
**Last updated**: 2026-06-25 18:46:31 +07
**Summary**: Fix regression so-order \_rowToKhoMatch (xóa/sửa lô vỡ) + vá 16 gap audit SSE (6 MED/10 LOW)

## Files changed in this commit (`web2/`)

- `web2/fb-posts/js/fb-posts-app.js`
- `web2/kpi/assignments.html`
- `web2/kpi/js/kpi-assignments.js`
- `web2/live-control/js/live-control.js`
- `web2/livestream-poller/index.html`
- `web2/shared/web2-msg-template-core.js`
- `web2/shared/web2-quick-reply.js`
- `web2/zalo/js/web2-zalo-app.js`

## Last 5 commits touching `web2/`

- `03107ca6f` fix(web2): SSE audit — KPI employee-ranges publish + assignments/returns PII/zalo debounce _(2026-06-25)_
- `c9495a30a` auto: session update _(2026-06-25)_
- `9591e8c00` feat(web2/ai-hub): Ghép đồ — dán ảnh (Ctrl+V) + kéo-thả cho ô Ảnh người & Ảnh quần áo _(2026-06-25)_
- `ac6f6ce5d` fix(web2/products): SSE realtime hiện SP mới từ so-order (không cần F5) + region-derive prefix mã _(2026-06-25)_
- `5d6d71300` feat(web2/live-control,live-tv): ĐỊA DANH riêng + TV NCC/Bán/Cọc/Còn _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-184631-03107ca` cho Claude walk chain theo CLAUDE.md protocol.
