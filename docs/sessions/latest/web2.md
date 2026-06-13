# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-145512-bed1cb3`
**Session file**: [`./20260613-145512-bed1cb3.md`](../20260613-145512-bed1cb3.md)
**Commit**: `bed1cb3` — fix(web2): Batch 5b audit — C7 token hash at-rest (zero-lockout, backward-compat)
**Last updated**: 2026-06-13 14:55:12 +07
**Summary**: fix(web2): Batch 5b audit — C7 token hash at-rest (zero-lockout, backward-compat)

## Files changed in this commit (`web2/`)

- `web2/shared/web2-sidebar.js`
- `web2/shared/web2-zalo.js`
- `web2/zalo/css/web2-zalo.css`
- `web2/zalo/index.html`
- `web2/zalo/js/web2-zalo-api.js`
- `web2/zalo/js/web2-zalo-app.js`

## Last 5 commits touching `web2/`

- `bed1cb391` fix(web2): Batch 5b audit — C7 token hash at-rest (zero-lockout, backward-compat) _(2026-06-13)_
- `147e0a0fc` auto: session update _(2026-06-13)_
- `76b4261b5` fix(web2): Batch 3 audit — cụm refund/ví NCC (C11 picker, C9 atomic, C12 sepay match, C18 qty0) _(2026-06-13)_
- `1fb64f925` auto: session update _(2026-06-13)_
- `ccf8b4a3b` fix(web2): Batch 1 audit — công nợ draft/cancelled (A3) + manualSepayId wrap (C17) + partial-return filter (A2) _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-145512-bed1cb3` cho Claude walk chain theo CLAUDE.md protocol.
