# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-005037-c0681a9`
**Session file**: [`./20260623-005037-c0681a9.md`](../20260623-005037-c0681a9.md)
**Commit**: `c0681a9` — chore(web2): xoá trang product-category (Nhóm sản phẩm) + khôi phục Kho Biến Thể (108)
**Last updated**: 2026-06-23 00:50:37 +07
**Summary**: xoá trang product-category + khôi phục Kho Biến Thể 108 (bienthe.txt seed)

## Files changed in this commit (`scripts/`)

- `scripts/n2store-smoke-all-pages.js`
- `scripts/seed-web2-variants.sh`
- `scripts/web2-clickall-probe-v2.js`
- `scripts/web2-clickall-probe.js`
- `scripts/web2-full-page-audit.js`
- `scripts/web2-ui-test.js`
- `scripts/web2-verify-data-load.js`

## Last 5 commits touching `scripts/`

- `c0681a9df` chore(web2): xoá trang product-category (Nhóm sản phẩm) + khôi phục Kho Biến Thể (108) _(2026-06-23)_
- `463e7d5bc` test(web2-zalo): Phase 5 — render-engine regression test + docs (no backend change) _(2026-06-22)_
- `e8b26bae1` fix(tooling) browser-session --start flag (stop landing on Web 1.0) + dev-log: 32-page browser SSE test ALL PASS _(2026-06-22)_
- `b80527e5e` chore(test): scripts/save-web2-session.js — lưu phiên WEB 2.0 (web2*auth) riêng → browser test web2 vào thẳng (không phải web1) *(2026-06-21)\_
- `5f31054ad` chore(test): save-login-session cũng login web2 + lưu web2*auth → browser test web2 vào thẳng bằng cookies *(2026-06-21)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-005037-c0681a9` cho Claude walk chain theo CLAUDE.md protocol.
