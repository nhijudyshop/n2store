# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-161007-f586ac7`
**Session file**: [`./20260615-161007-f586ac7.md`](../20260615-161007-f586ac7.md)
**Commit**: `f586ac7` — feat(web2/jt-tracking): nút 'Dán lịch sử' — paste text Zalo → quét mã đơn cũ
**Last updated**: 2026-06-15 16:10:07 +07
**Summary**: feat(web2/jt-tracking): nút 'Dán lịch sử' — paste text Zalo → quét mã đơn cũ

## Files changed in this commit (`web2/`)

- `web2/jt-tracking/index.html`
- `web2/jt-tracking/js/jt-tracking-app.js`

## Last 5 commits touching `web2/`

- `f586ac776` feat(web2/jt-tracking): nút 'Dán lịch sử' — paste text Zalo → quét mã đơn cũ _(2026-06-15)_
- `5e08afb67` feat(web2/jt-tracking): Quét lịch sử 14 ngày (days filter) + chẩn đoán độ sâu (more/oldestDate) _(2026-06-15)_
- `e19f7c7f3` feat(web2/jt-tracking): nút 'Quét lịch sử' — đọc lịch sử nhóm Zalo (zca) quét đơn cũ/thiếu _(2026-06-15)_
- `7974959b4` feat(web2): Zalo chat-by-phone (chưa nhắn vẫn chat) + auto-scroll + nút tag đổi trạng thái _(2026-06-15)_
- `4b66aa685` auto: session update _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-161007-f586ac7` cho Claude walk chain theo CLAUDE.md protocol.
