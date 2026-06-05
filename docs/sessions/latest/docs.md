# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-151348-d59cf73`
**Session file**: [`./20260605-151348-d59cf73.md`](../20260605-151348-d59cf73.md)
**Commit**: `d59cf73` — fix(cloudflare CORS): allow header X-Web2-Token - sau khi dang nhap Web2.0 client gui x-web2-token bi CORS preflight chan -> moi API web2 fail. Them 1 header, khong dung logic trang khac
**Last updated**: 2026-06-05 15:13:48 +07
**Summary**: fix(cloudflare CORS): allow header X-Web2-Token - sau khi dang nhap Web2.0 client gui x-web2-token bi CORS preflight ...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `36848d678` docs(dev-log): an nut Cap cong no ao o customer-hub wallet _(2026-06-05)_
- `e62b9512c` chore(session): RESUME:20260605-150626-cf86ff6 _(2026-06-05)_
- `cf86ff65f` feat(native-orders): Đơn Inbox — picker SP inline + search KH không dấu + avatar/hội thoại _(2026-06-05)_
- `140e288bb` chore(session): RESUME:20260605-150331-70e32bb _(2026-06-05)_
- `70e32bb69` refactor(web2): unread logic authoritative thuần (bỏ mirror Web 1.0 + nút Đã đọc) _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-151348-d59cf73` cho Claude walk chain theo CLAUDE.md protocol.
