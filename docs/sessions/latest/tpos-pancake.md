# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260524-111152-81f16b3`
**Session file**: [`./20260524-111152-81f16b3.md`](../20260524-111152-81f16b3.md)
**Commit**: `81f16b3` — revert(snap): restore iframe + sharing (Step A baseline) — user muốn giữ flow share
**Last updated**: 2026-05-24 11:11:52 +07
**Summary**: revert(snap): restore iframe + sharing (Step A baseline) — user muốn giữ flow share

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-livestream-snap.js`

## Last 5 commits touching `tpos-pancake/`

- `81f16b3c7` revert(snap): restore iframe + sharing (Step A baseline) — user muốn giữ flow share _(2026-05-24)_
- `1a201728b` auto: session update _(2026-05-24)_
- `c7adc3f70` revert: Step B (video + dash.js) — FB CDN không có CORS, không play được DASH chunks _(2026-05-24)_
- `c5fe9b5b3` debug: add AbortController + log to stream-url fetch (track 'Failed to fetch') _(2026-05-24)_
- `e243945fd` fix(snap-embed): gọi Render TRỰC TIẾP cho /api/livestream/stream-url (CF worker không proxy path này) _(2026-05-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260524-111152-81f16b3` cho Claude walk chain theo CLAUDE.md protocol.
