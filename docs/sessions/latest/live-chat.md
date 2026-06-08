# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260608-104726-96291b8`
**Session file**: [`./20260608-104726-96291b8.md`](../20260608-104726-96291b8.md)
**Commit**: `96291b8` — fix(web2-customers): SĐT bị mất do wallet-balance pill ghi đè span
**Last updated**: 2026-06-08 10:47:26 +07
**Summary**: fix(web2-customers): SĐT bị mất do wallet-balance pill ghi đè span

## Files changed in this commit (`live-chat/`)

- `live-chat/index.html`
- `live-chat/js/live/live-init.js`
- `live-chat/js/pancake/pancake-token-manager.js`

## Last 5 commits touching `live-chat/`

- `0298b6f38` perf(live-chat): cache Pancake accounts vào localStorage → boot nhanh (~2s vs ~13s) _(2026-06-08)_
- `97b2338b2` fix(live-chat): campaign load được ngay lần đầu vào (không phải chọn lại page) _(2026-06-08)_
- `1161a3b1b` auto: session update _(2026-06-08)_
- `c66f0f041` feat(live-chat): dropdown chiến dịch xen kẽ Store/House mới nhất lên đầu + mặc định chọn newest mỗi page _(2026-06-08)_
- `a1037d2a1` refactor(web2): rename design-system tpos-_ → web2-_ (classes + --vars), files + theme class _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260608-104726-96291b8` cho Claude walk chain theo CLAUDE.md protocol.
