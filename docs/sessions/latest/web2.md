# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-121007-f550ecf`
**Session file**: [`./20260615-121007-f550ecf.md`](../20260615-121007-f550ecf.md)
**Commit**: `f550ecf` — feat(web2-jt): bấm SĐT trong tin nhắn để copy — không đụng click mở modal
**Last updated**: 2026-06-15 12:10:07 +07
**Summary**: feat(web2-jt): bấm SĐT trong tin nhắn để copy — không đụng click mở modal

## Files changed in this commit (`web2/`)

- `web2/jt-tracking/css/jt-tracking.css`
- `web2/jt-tracking/index.html`
- `web2/jt-tracking/js/jt-tracking-app.js`

## Last 5 commits touching `web2/`

- `f550ecfb3` feat(web2-jt): bấm SĐT trong tin nhắn để copy — không đụng click mở modal _(2026-06-15)_
- `2deb63a01` feat(web2-jt): hiện TOÀN BỘ tin nhắn nhóm chứa mã (tên/SĐT/ghi chú KH) trên row + modal _(2026-06-15)_
- `b33d74d64` fix(web2-jt): composer chat drawer mất (wz-chat-body thiếu flex/scroll) + nén dashboard gọn _(2026-06-15)_
- `4189c9c80` fix(web2-jt/zalo-chat): chat drawer text dọc 1 ký tự — .wz-chat-main layout chỉ có ở web2-zalo.css _(2026-06-15)_
- `a552ff9f4` feat(web2-jt): thêm KPI/filter 'Đã duyệt' + fix giao diện input (cao đều 46px) + bump css/js ver _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-121007-f550ecf` cho Claude walk chain theo CLAUDE.md protocol.
