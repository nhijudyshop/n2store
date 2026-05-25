# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-150343-9c80024`
**Session file**: [`./20260525-150343-9c80024.md`](../20260525-150343-9c80024.md)
**Commit**: `9c80024` — auto: session update
**Last updated**: 2026-05-25 15:03:43 +07
**Summary**: auto: session update

## Files changed in this commit (`scripts/`)

- `scripts/capture-tpos-print-blob.js`

## Last 5 commits touching `scripts/`

- `9c80024b2` auto: session update _(2026-05-25)_
- `e3d369bba` fix(web2/products): CSS print*barcode verbatim TPOS — fetched /Content/print_barcode.css *(2026-05-25)\_
- `f6c0fe137` fix(snap): FB seek URL = /plugins/video.php?href=URL&t=N (verified) _(2026-05-25)_
- `5b782f7fc` fix(snap): FB seek param = 'start' (not 't') — verified qua Playwright test _(2026-05-25)_
- `69f2dc6d6` perf(delivery-report/report): view-swap thay modal overlay — tab switch ~5ms _(2026-05-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-150343-9c80024` cho Claude walk chain theo CLAUDE.md protocol.
