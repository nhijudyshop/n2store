# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-013538-afe1607`
**Session file**: [`./20260624-013538-afe1607.md`](../20260624-013538-afe1607.md)
**Commit**: `afe1607` — docs(web2): dev-log — full menu audit (50 pages load+interaction+CRUD), fixes recorded
**Last updated**: 2026-06-24 01:35:38 +07
**Summary**: docs(web2): dev-log — full menu audit (50 pages load+interaction+CRUD), fixes recorded

## Files changed in this commit (`scripts/`)

- `scripts/n2store-smoke-all-pages.js`

## Last 5 commits touching `scripts/`

- `314e8fa2e` fix(web2): dead partner-customer link → customers deep-link (?phone=); clean smoke harness _(2026-06-24)_
- `c0681a9df` chore(web2): xoá trang product-category (Nhóm sản phẩm) + khôi phục Kho Biến Thể (108) _(2026-06-23)_
- `463e7d5bc` test(web2-zalo): Phase 5 — render-engine regression test + docs (no backend change) _(2026-06-22)_
- `e8b26bae1` fix(tooling) browser-session --start flag (stop landing on Web 1.0) + dev-log: 32-page browser SSE test ALL PASS _(2026-06-22)_
- `b80527e5e` chore(test): scripts/save-web2-session.js — lưu phiên WEB 2.0 (web2*auth) riêng → browser test web2 vào thẳng (không phải web1) *(2026-06-21)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-013538-afe1607` cho Claude walk chain theo CLAUDE.md protocol.
