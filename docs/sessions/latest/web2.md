# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-103854-9292343`
**Session file**: [`./20260616-103854-9292343.md`](../20260616-103854-9292343.md)
**Commit**: `9292343` — feat(web2-zalo): @mention — gõ @ lên danh sách thành viên nhóm để tag
**Last updated**: 2026-06-16 10:38:54 +07
**Summary**: feat(web2-zalo): @mention — gõ @ lên danh sách thành viên nhóm để tag

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customers/index.html`
- `web2/jt-tracking/index.html`
- `web2/shared/web2-zalo.js`
- `web2/shared/zalo-chat/chat-composer.css`
- `web2/shared/zalo-chat/composer.js`
- `web2/zalo/index.html`

## Last 5 commits touching `web2/`

- `79afdb96a` auto: session update _(2026-06-16)_
- `043bf7763` auto: session update _(2026-06-16)_
- `c4052b90f` auto: session update _(2026-06-16)_
- `6aaa49f8f` feat(web2-realtime): proxy-only — bỏ direct WS pancake.vn (hết log đỏ 1006) _(2026-06-16)_
- `8b0a8cec4` docs(web2-realtime): sửa comment stale n2store-realtime → web2-realtime (broker đã fold) _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-103854-9292343` cho Claude walk chain theo CLAUDE.md protocol.
