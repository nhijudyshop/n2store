# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-165654-ae1215e`
**Session file**: [`./20260630-165654-ae1215e.md`](../20260630-165654-ae1215e.md)
**Commit**: `ae1215e` — feat(printer): cloudflared tunnel cho Print Bridge — ĐT/PC khác in qua tunnel không cần cài bridge
**Last updated**: 2026-06-30 16:56:54 +07
**Summary**: Print Bridge cloudflared tunnel: ĐT/PC khác in qua tunnel không cần bridge (reuse registry engine=printer + SSRF allowlist)

## Files changed in this commit (`scripts/`)

- `scripts/print-tunnel.ps1`

## Last 5 commits touching `scripts/`

- `ae1215e4b` feat(printer): cloudflared tunnel cho Print Bridge — ĐT/PC khác in qua tunnel không cần cài bridge _(2026-06-30)_
- `19471a7f8` auto: session update _(2026-06-30)_
- `be910cb67` fix(nav): purge dead tpos-pancake/ paths → live-chat/ (nav href, permissions-registry, 17 test scripts) _(2026-06-29)_
- `e2952425a` feat(web2-vn-address): bộ chọn Tỉnh/TP → Phường/Xã dùng chung (vietnamese-provinces-database, MIT) _(2026-06-28)_
- `20c99cbbd` feat(sepay-invoices): push snapshot từ máy IP nhà + link trực tiếp khi Cloudflare chặn _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-165654-ae1215e` cho Claude walk chain theo CLAUDE.md protocol.
