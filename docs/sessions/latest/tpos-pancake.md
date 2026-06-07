# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-181747-88c9a26`
**Session file**: [`./20260607-181747-88c9a26.md`](../20260607-181747-88c9a26.md)
**Commit**: `88c9a26` — feat(tpos-pancake): rewire cột comment live TPOS→FB Graph (flag-gated, fallback-safe)
**Last updated**: 2026-06-07 18:17:47 +07
**Summary**: feat(tpos-pancake): rewire cột comment live TPOS→FB Graph (flag-gated, fallback-safe)

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-api.js`
- `tpos-pancake/js/tpos/tpos-fb-live-source.js`
- `tpos-pancake/js/tpos/tpos-realtime.js`

## Last 5 commits touching `tpos-pancake/`

- `88c9a2660` feat(tpos-pancake): rewire cột comment live TPOS→FB Graph (flag-gated, fallback-safe) _(2026-06-07)_
- `9e07f2e67` chore(tpos-pancake): Phase A1 — xóa code chết (index.old.html + 9 file monolith orphan) _(2026-06-07)_
- `2b1a72bb8` feat(web2/chat): Feature 2 sticker-send (built-in pack qua REPLY*INBOX_PHOTO STICKER, không cần sửa extension); test OK *(2026-06-07)\_
- `d9ae5666d` auto: session update _(2026-06-07)_
- `89826ae43` feat(web2/chat): Feature 1 — paste ảnh ctrl+v vào Web2ChatPanel (native-orders + tpos-pancake); test OK _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-181747-88c9a26` cho Claude walk chain theo CLAUDE.md protocol.
