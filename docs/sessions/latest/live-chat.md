# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260608-125616-0e9dc20`
**Session file**: [`./20260608-125616-0e9dc20.md`](../20260608-125616-0e9dc20.md)
**Commit**: `0e9dc20` — fix(live-chat): tab Kho SP bien mat khi live - mode-switcher self-heal
**Last updated**: 2026-06-08 12:56:16 +07
**Summary**: fix(live-chat): tab Kho SP bien mat khi live - mode-switcher self-heal

## Files changed in this commit (`live-chat/`)

- `live-chat/index.html`
- `live-chat/js/pancake/pancake-mode-switcher.js`

## Last 5 commits touching `live-chat/`

- `0e9dc2028` fix(live-chat): tab Kho SP bien mat khi live - mode-switcher self-heal _(2026-06-08)_
- `395b3e7e5` fix(live-chat): bo lap comment (dedupe theo id o loadComments + merge) _(2026-06-08)_
- `46b933e8c` refactor(web2): tách localStorage Pancake sang web2* namespace (độc lập Web1) *(2026-06-08)\_
- `e512f88df` refactor(web2): quét sạch chữ 'tpos' trong Web 2.0 (identifiers/UI/comments) _(2026-06-08)_
- `6922ce2c6` feat(web2): backfill fb*id↔phone từ Web1 customers → warehouse + live-chat enrich SĐT/địa chỉ *(2026-06-08)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260608-125616-0e9dc20` cho Claude walk chain theo CLAUDE.md protocol.
