# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-154753-55c7325`
**Session file**: [`./20260615-154753-55c7325.md`](../20260615-154753-55c7325.md)
**Commit**: `55c7325` — auto: session update
**Last updated**: 2026-06-15 15:47:53 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/jt-tracking/index.html`
- `web2/jt-tracking/js/jt-tracking-app.js`

## Last 5 commits touching `web2/`

- `e19f7c7f3` feat(web2/jt-tracking): nút 'Quét lịch sử' — đọc lịch sử nhóm Zalo (zca) quét đơn cũ/thiếu _(2026-06-15)_
- `7974959b4` feat(web2): Zalo chat-by-phone (chưa nhắn vẫn chat) + auto-scroll + nút tag đổi trạng thái _(2026-06-15)_
- `4b66aa685` auto: session update _(2026-06-15)_
- `039a43845` feat(web2): adopt Web2CustomerChat ở balance-history + customers (chỉ-xem → full chat) _(2026-06-15)_
- `ed751d65f` feat(web2/shared): Web2CustomerChat — launcher FULL chat KH (Pancake + Zalo) dùng chung _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-154753-55c7325` cho Claude walk chain theo CLAUDE.md protocol.
