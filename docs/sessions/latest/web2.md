# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-023307-7fa6e53`
**Session file**: [`./20260623-023307-7fa6e53.md`](../20260623-023307-7fa6e53.md)
**Commit**: `7fa6e53` — fix(web2-pbh) pbh-render detail/history: inject auth (bare-fetch 401 cho NV KPI-scope) + dev-log audit
**Last updated**: 2026-06-23 02:33:07 +07
**Summary**: audit hệ PBH: fix money-leak reconcile return-failed (hoàn ví) + merged dedup + pbh-render auth; Web2PBH design ready

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-invoice/pbh-render.js`

## Last 5 commits touching `web2/`

- `7fa6e535e` fix(web2-pbh) pbh-render detail/history: inject auth (bare-fetch 401 cho NV KPI-scope) + dev-log audit _(2026-06-23)_
- `4be494aaf` fix(web2): bỏ Reset STT + fix khe hở 8px thanh menu (32 trang) + gỡ chữ TPOS + chặn tạo PBH tay _(2026-06-23)_
- `c0681a9df` chore(web2): xoá trang product-category (Nhóm sản phẩm) + khôi phục Kho Biến Thể (108) _(2026-06-23)_
- `e26fa4998` feat(web2-audit): Wave 3 FE — 🕘 per-record history buttons on 10 sink-wired pages _(2026-06-23)_
- `d5d79eb9a` feat(web2-audit): Wave 2 backend — 9 routes → event-sink + entityId purge + entity labels _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-023307-7fa6e53` cho Claude walk chain theo CLAUDE.md protocol.
