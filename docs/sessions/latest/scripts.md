# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260523-125659-6780c0f`
**Session file**: [`./20260523-125659-6780c0f.md`](../20260523-125659-6780c0f.md)
**Commit**: `6780c0f` — test(snap-e2e): filter favicon + FB CDN noise from console error check
**Last updated**: 2026-05-23 12:56:59 +07
**Summary**: test(snap-e2e): filter favicon + FB CDN noise from console error check

## Files changed in this commit (`scripts/`)

- `scripts/snap-e2e-full-test.js`

## Last 5 commits touching `scripts/`

- `6780c0fb0` test(snap-e2e): filter favicon + FB CDN noise from console error check _(2026-05-23)_
- `faa623934` fix(snap): self-served thumbnail URL force HTTPS behind Render proxy _(2026-05-23)_
- `278311c29` fix(snap vanity): _isVanitySlug check — Facebook_UserName là display name không phải vanity _(2026-05-23)\_
- `4e2163d66` auto: session update _(2026-05-23)_
- `4e045b7bb` fix(snap): parse channelCreatedTime ISO + all-pages top-2 campaigns resolve _(2026-05-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260523-125659-6780c0f` cho Claude walk chain theo CLAUDE.md protocol.
