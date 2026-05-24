# Latest Snapshot — `shared/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260524-185502-d295a18`
**Session file**: [`./20260524-185502-d295a18.md`](../20260524-185502-d295a18.md)
**Commit**: `d295a18` — auto: session update
**Last updated**: 2026-05-24 18:55:02 +07
**Summary**: auto: session update

## Files changed in this commit (`shared/`)

- `shared/js/navigation-modern.js`

## Last 5 commits touching `shared/`

- `d295a18d4` auto: session update _(2026-05-24)_
- `411482c33` feat(domain): rewire codebase sang custom domain nhijudy.store _(2026-05-21)_
- `76fc24cd5` fix(tpos-pancake): gỡ legacy auth → opt-in qua flag \__SKIP_LEGACY_NAV_AUTH _(2026-05-18)\_
- `cc2c8ff4b` refactor(web2): move web2-products + web2-variants into web2/ _(2026-05-18)_
- `0c3c13100` chore(web2): xóa nốt fastpurchaseorder-refund + audit data flow _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260524-185502-d295a18` cho Claude walk chain theo CLAUDE.md protocol.
