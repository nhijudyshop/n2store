# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-195953-33bc3d7`
**Session file**: [`./20260701-195953-33bc3d7.md`](../20260701-195953-33bc3d7.md)
**Commit**: `33bc3d7` — refactor(live-chat): gộp 1 nguồn chiến dịch — live-chat CHỈ XEM, tạo/quản lý ở campaign-manager
**Last updated**: 2026-07-01 19:59:53 +07
**Summary**: refactor(live-chat): gộp 1 nguồn chiến dịch — live-chat CHỈ XEM, tạo/quản lý ở campaign-manager

## Files changed in this commit (`live-chat/`)

- `live-chat/index.html`
- `live-chat/js/live/live-campaign-manager.js`

## Last 5 commits touching `live-chat/`

- `33bc3d7ed` refactor(live-chat): gộp 1 nguồn chiến dịch — live-chat CHỈ XEM, tạo/quản lý ở campaign-manager _(2026-07-01)_
- `2458c99d4` fix(web2 audit): boost-purge realtime (desktop+mobile) + LiveCustomerSync token fallback _(2026-06-30)_
- `415e1eb3c` fix(web2 audit vòng4): fix tất cả — 4 HIGH security + medium/low (34 file) _(2026-06-30)_
- `1cc04a641` auto: session update _(2026-06-30)_
- `85f9fe063` refactor(web2 util): gộp money(11)→Web2Format.vnd + escape(76)→Web2Escape.escapeHtml (delegate-with-fallback); date đã-delegate, phone hoãn _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-195953-33bc3d7` cho Claude walk chain theo CLAUDE.md protocol.
