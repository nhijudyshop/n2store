# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-105731-0fb92ed`
**Session file**: [`./20260627-105731-0fb92ed.md`](../20260627-105731-0fb92ed.md)
**Commit**: `0fb92ed` — auto: session update
**Last updated**: 2026-06-27 10:57:31 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/cham-cong/index.html`
- `web2/cham-cong/js/cham-cong-app.js`

## Last 5 commits touching `web2/`

- `6ed930d63` feat(web2/cham-cong): audit "thời gian chỉnh sửa" chấm công (ai + lúc nào) + fix false-stamp nghỉ phép _(2026-06-27)_
- `b27f50bda` auto: session update _(2026-06-27)_
- `f614de58c` feat(web2 zalo R3): auto-bootstrap account từ cookie chat.zalo.me (không cần bấm nút) _(2026-06-27)_
- `7aa1f2507` feat(live-chat): AI gợi ý tên chiến dịch + giảm lag (firebase head→body) + hardening msgTs _(2026-06-27)_
- `fd83d2453` fix(web2/overview): sửa 404 toàn bộ link card/tĩnh (thiếu resolveOur) + login → native-orders _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-105731-0fb92ed` cho Claude walk chain theo CLAUDE.md protocol.
