# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-160221-8f29378`
**Session file**: [`./20260620-160221-8f29378.md`](../20260620-160221-8f29378.md)
**Commit**: `8f29378` — auto: session update
**Last updated**: 2026-06-20 16:02:22 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customers/index.html`
- `web2/jt-tracking/index.html`
- `web2/multi-tool/js/multi-tool.js`
- `web2/shared/web2-zalo.js`
- `web2/shared/zalo-chat/chat-view.js`

## Last 5 commits touching `web2/`

- `8f293781e` auto: session update _(2026-06-20)_
- `ed35b22ab` fix(web2/zalo): chip TK Zalo LUON hien - fallback 'TK Zalo khong con' khi account orphaned (vd nhom jt-tracking TK relay da xoa) _(2026-06-20)_
- `12991c95a` feat(web2/multi-tool): tang comment delay mac dinh va toi thieu 1 giay; 6 account chay doc lap _(2026-06-20)_
- `a52dcbdec` auto: session update _(2026-06-20)_
- `cbbcf0141` feat(web2/zalo): chip hien thi TK Zalo dang dung de nhan (tag TK chinh / canh bao TK phu) - dung chung engine chat _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-160221-8f29378` cho Claude walk chain theo CLAUDE.md protocol.
