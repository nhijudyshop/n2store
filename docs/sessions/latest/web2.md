# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-165352-c23125c`
**Session file**: [`./20260630-165352-c23125c.md`](../20260630-165352-c23125c.md)
**Commit**: `c23125c` — auto: session update
**Last updated**: 2026-06-30 16:53:52 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/printer-settings/index.html`
- `web2/products/index.html`
- `web2/shared/web2-pos-installer.js`
- `web2/shared/web2-printer.js`
- `web2/system/data/web2-dedup-audit.json`
- `web2/system/js/system-dedup.js`
- `web2/unit-scan/index.html`
- `web2/video-maker/index.html`

## Last 5 commits touching `web2/`

- `c23125cd9` auto: session update _(2026-06-30)_
- `cc6bfa7d2` feat(system): tab 'Trùng lặp / 1-nguồn' (dedup audit toàn bộ Web 2.0) — 15 nhóm, JSON-driven _(2026-06-30)_
- `19471a7f8` auto: session update _(2026-06-30)_
- `662ee1163` refactor(web2-products): computeProductStatus 1 nguồn + fix confirm-partial HET*HANG; cross-link công thức chờ hàng (audit #2,#3) *(2026-06-30)\_
- `a45bb6d50` refactor(order-tags): gộp tag 'Âm mã' → 'Chờ hàng' (over-sell = chờ hàng = cần đặt NCC, 1 khái niệm) _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-165352-c23125c` cho Claude walk chain theo CLAUDE.md protocol.
