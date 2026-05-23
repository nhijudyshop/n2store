# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260523-121047-4e2163d`
**Session file**: [`./20260523-121047-4e2163d.md`](../20260523-121047-4e2163d.md)
**Commit**: `4e2163d` — auto: session update
**Last updated**: 2026-05-23 12:10:47 +07
**Summary**: auto: session update

## Files changed in this commit (`scripts/`)

- `scripts/snap-auto-accuracy-test.js`

## Last 5 commits touching `scripts/`

- `4e2163d66` auto: session update _(2026-05-23)_
- `4e045b7bb` fix(snap): parse channelCreatedTime ISO + all-pages top-2 campaigns resolve _(2026-05-23)_
- `f9995fbd2` fix(snap): credentials 'include' → 'omit' để bypass CORS preflight block _(2026-05-23)_
- `bbab64083` fix(snap): button không nhấp nháy + chip floating fallback mount _(2026-05-23)_
- `5e5ec5372` fix(web2/products SSE): tách _sseReloadTimer + \_sseUsageTimer riêng _(2026-05-23)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260523-121047-4e2163d` cho Claude walk chain theo CLAUDE.md protocol.
