# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-104357-b27f50b`
**Session file**: [`./20260627-104357-b27f50b.md`](../20260627-104357-b27f50b.md)
**Commit**: `b27f50b` — auto: session update
**Last updated**: 2026-06-27 10:43:57 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/cham-cong/css/cham-cong.css`
- `web2/cham-cong/index.html`
- `web2/cham-cong/js/cham-cong-api.js`
- `web2/cham-cong/js/cham-cong-app.js`

## Last 5 commits touching `web2/`

- `b27f50bda` auto: session update _(2026-06-27)_
- `f614de58c` feat(web2 zalo R3): auto-bootstrap account từ cookie chat.zalo.me (không cần bấm nút) _(2026-06-27)_
- `7aa1f2507` feat(live-chat): AI gợi ý tên chiến dịch + giảm lag (firebase head→body) + hardening msgTs _(2026-06-27)_
- `fd83d2453` fix(web2/overview): sửa 404 toàn bộ link card/tĩnh (thiếu resolveOur) + login → native-orders _(2026-06-27)_
- `a71968341` feat(web2/login): redirect sau đăng nhập theo role — admin → system?tab=services, nhân viên → overview _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-104357-b27f50b` cho Claude walk chain theo CLAUDE.md protocol.
