# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-155727-5e08afb`
**Session file**: [`./20260615-155727-5e08afb.md`](../20260615-155727-5e08afb.md)
**Commit**: `5e08afb` — feat(web2/jt-tracking): Quét lịch sử 14 ngày (days filter) + chẩn đoán độ sâu (more/oldestDate)
**Last updated**: 2026-06-15 15:57:27 +07
**Summary**: feat(web2/jt-tracking): Quét lịch sử 14 ngày (days filter) + chẩn đoán độ sâu (more/oldestDate)

## Files changed in this commit (`web2/`)

- `web2/jt-tracking/index.html`
- `web2/jt-tracking/js/jt-tracking-app.js`

## Last 5 commits touching `web2/`

- `5e08afb67` feat(web2/jt-tracking): Quét lịch sử 14 ngày (days filter) + chẩn đoán độ sâu (more/oldestDate) _(2026-06-15)_
- `e19f7c7f3` feat(web2/jt-tracking): nút 'Quét lịch sử' — đọc lịch sử nhóm Zalo (zca) quét đơn cũ/thiếu _(2026-06-15)_
- `7974959b4` feat(web2): Zalo chat-by-phone (chưa nhắn vẫn chat) + auto-scroll + nút tag đổi trạng thái _(2026-06-15)_
- `4b66aa685` auto: session update _(2026-06-15)_
- `039a43845` feat(web2): adopt Web2CustomerChat ở balance-history + customers (chỉ-xem → full chat) _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-155727-5e08afb` cho Claude walk chain theo CLAUDE.md protocol.
