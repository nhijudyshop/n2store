# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260529-121353-1bcb2ec`
**Session file**: [`./20260529-121353-1bcb2ec.md`](../20260529-121353-1bcb2ec.md)
**Commit**: `1bcb2ec` — auto: session update
**Last updated**: 2026-05-29 12:13:53 +07
**Summary**: auto: session update

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/index.html`
- `inventory-tracking/js/data-loader.js`

## Last 5 commits touching `inventory-tracking/`

- `1bcb2ecab` auto: session update _(2026-05-29)_
- `09d2e3120` feat(inventory): sort NCC theo createdAt ASC trong mỗi shipment (cũ trên, mới dưới) _(2026-05-24)_
- `fcf5876a4` feat(inventory/header): VND fallback rate cho mọi đợt + bỏ permission gate trên row 2 _(2026-05-24)_
- `320365531` fix(inventory): chi phí mirror per-(date,đợt) + table auto-refresh khi đổi CP/payment _(2026-05-24)_
- `bcf235f87` feat(snap-embed): Step B — dash.js raw stream + video.captureStream (no FB iframe, no share popup) _(2026-05-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260529-121353-1bcb2ec` cho Claude walk chain theo CLAUDE.md protocol.
