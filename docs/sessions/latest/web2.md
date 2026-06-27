# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-102830-15668b5`
**Session file**: [`./20260627-102830-15668b5.md`](../20260627-102830-15668b5.md)
**Commit**: `15668b5` — docs(dev-log): audit 5 bug user + fix AI tên chiến dịch/lag/zalo cookie/hardening
**Last updated**: 2026-06-27 10:28:30 +07
**Summary**: Audit 5 bug user: 3 fixed sẵn (ai-hub/chat-jump/native-split) + fix AI tên chiến dịch + lag firebase + zalo cookie bootstrap + msgTs hardening; regression 124 assertions GREEN; browser smoke 0 errors

## Files changed in this commit (`web2/`)

- `web2/jt-tracking/index.html`
- `web2/shared/chat-panel/web2-chat-panel-state.js`
- `web2/shared/web2-zalo-presence.js`
- `web2/zalo/index.html`
- `web2/zalo/js/web2-zalo-accounts.js`

## Last 5 commits touching `web2/`

- `f614de58c` feat(web2 zalo R3): auto-bootstrap account từ cookie chat.zalo.me (không cần bấm nút) _(2026-06-27)_
- `7aa1f2507` feat(live-chat): AI gợi ý tên chiến dịch + giảm lag (firebase head→body) + hardening msgTs _(2026-06-27)_
- `fd83d2453` fix(web2/overview): sửa 404 toàn bộ link card/tĩnh (thiếu resolveOur) + login → native-orders _(2026-06-27)_
- `a71968341` feat(web2/login): redirect sau đăng nhập theo role — admin → system?tab=services, nhân viên → overview _(2026-06-27)_
- `ce9f30b26` feat(web2/overview): trang giới thiệu Framer-style showcase toàn bộ Web 2.0 + login → overview _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-102830-15668b5` cho Claude walk chain theo CLAUDE.md protocol.
