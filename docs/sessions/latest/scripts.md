# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-151802-f2d47f2`
**Session file**: [`./20260525-151802-f2d47f2.md`](../20260525-151802-f2d47f2.md)
**Commit**: `f2d47f2` — auto: session update
**Last updated**: 2026-05-25 15:18:02 +07
**Summary**: auto: session update

## Files changed in this commit (`scripts/`)

- `scripts/capture-tpos-print-blob.js`

## Last 5 commits touching `scripts/`

- `f2d47f235` auto: session update _(2026-05-25)_
- `f2142e160` auto: session update _(2026-05-25)_
- `57b2d4725` auto: session update _(2026-05-25)_
- `9c80024b2` auto: session update _(2026-05-25)_
- `e3d369bba` fix(web2/products): CSS print*barcode verbatim TPOS — fetched /Content/print_barcode.css *(2026-05-25)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-151802-f2d47f2` cho Claude walk chain theo CLAUDE.md protocol.
