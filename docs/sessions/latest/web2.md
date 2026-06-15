# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-163444-2f6d22e`
**Session file**: [`./20260615-163444-2f6d22e.md`](../20260615-163444-2f6d22e.md)
**Commit**: `2f6d22e` — fix(web2/jt-tracking): script Console Zalo bỏ IndexedDB (treo) → auto-scroll DOM + cap 60s
**Last updated**: 2026-06-15 16:34:44 +07
**Summary**: fix(web2/jt-tracking): script Console Zalo bỏ IndexedDB (treo) → auto-scroll DOM + cap 60s

## Files changed in this commit (`web2/`)

- `web2/jt-tracking/index.html`
- `web2/jt-tracking/js/jt-tracking-app.js`
- `web2/multi-tool/index.html`
- `web2/multi-tool/js/multi-tool.js`

## Last 5 commits touching `web2/`

- `918b3f163` feat(web2/multi-tool): chọn Bài live (gồm đã xong) auto mới nhất + ẩn spam khỏi live-chat _(2026-06-15)_
- `f48d9a42f` auto: session update _(2026-06-15)_
- `4822b3c5b` feat(web2/jt-tracking): modal 'Dán lịch sử' kèm script Console Zalo Web + hướng dẫn _(2026-06-15)_
- `d51cda70b` feat(web2): trang Đa dụng Web 2.0 + tab Tăng số lượng comment _(2026-06-15)_
- `f586ac776` feat(web2/jt-tracking): nút 'Dán lịch sử' — paste text Zalo → quét mã đơn cũ _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-163444-2f6d22e` cho Claude walk chain theo CLAUDE.md protocol.
