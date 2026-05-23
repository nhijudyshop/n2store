# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260523-142547-13f17c6`
**Session file**: [`./20260523-142547-13f17c6.md`](../20260523-142547-13f17c6.md)
**Commit**: `13f17c6` — feat(snap): toggle chip inline thumb (default OFF) + move thumb inline với phone/address
**Last updated**: 2026-05-23 14:25:47 +07
**Summary**: feat(snap): toggle chip inline thumb (default OFF) + move thumb inline với phone/address

## Files changed in this commit (`scripts/`)

- `scripts/snap-e2e-full-test.js`

## Last 5 commits touching `scripts/`

- `13f17c601` feat(snap): toggle chip inline thumb (default OFF) + move thumb inline với phone/address _(2026-05-23)_
- `d3a191f6e` feat(snap): compact thumb (chỉ ảnh) + click zoom lightbox _(2026-05-23)_
- `c3c02600c` feat(snap): inline thumbnail strip dưới comment row + by-comment-ids endpoint _(2026-05-23)_
- `2a57e7031` perf(snap): inline SVG + scoped observer + idle-defer refresh _(2026-05-23)_
- `42fe43a33` fix(snap): offset*seconds dùng commentTime, không phải Date.now() *(2026-05-23)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260523-142547-13f17c6` cho Claude walk chain theo CLAUDE.md protocol.
