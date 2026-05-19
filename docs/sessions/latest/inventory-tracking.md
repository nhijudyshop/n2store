# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-111653-24c24b0`
**Session file**: [`./20260519-111653-24c24b0.md`](../20260519-111653-24c24b0.md)
**Commit**: `24c24b0` — fix(web2/balance-history): opt out legacy navigation-modern.js auth redirect
**Last updated**: 2026-05-19 11:16:53 +07
**Summary**: fix(web2/balance-history): opt out legacy navigation-modern.js auth redirect

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/css/modern.css`
- `inventory-tracking/index.html`
- `inventory-tracking/js/column-toggle.js`
- `inventory-tracking/js/main.js`
- `inventory-tracking/js/modal-image-manager.js`
- `inventory-tracking/js/table-renderer.js`
- `inventory-tracking/js/ui-state.js`

## Last 5 commits touching `inventory-tracking/`

- `ad61d967` feat(web2/balance-history): embed metadata block + re-run manifest builder _(2026-05-19)_
- `164b1d17` auto: session update _(2026-05-19)_
- `2a63aac7` fix(inventory-tracking/modal-convert-po): dropdown gợi ý SP trải rộng hết bảng, không cắt tên dài _(2026-05-18)_
- `025598ea` feat(inventory↔po): badge inventory products đã được đưa qua PO Draft + chip đếm _(2026-05-07)_
- `cb2bcc24` feat(inventory/convert-po): iPad SL readability + persistent suggest dropdown + Đồng bộ giá _(2026-05-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-111653-24c24b0` cho Claude walk chain theo CLAUDE.md protocol.
