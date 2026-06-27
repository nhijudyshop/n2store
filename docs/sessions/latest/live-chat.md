# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-102830-15668b5`
**Session file**: [`./20260627-102830-15668b5.md`](../20260627-102830-15668b5.md)
**Commit**: `15668b5` — docs(dev-log): audit 5 bug user + fix AI tên chiến dịch/lag/zalo cookie/hardening
**Last updated**: 2026-06-27 10:28:30 +07
**Summary**: Audit 5 bug user: 3 fixed sẵn (ai-hub/chat-jump/native-split) + fix AI tên chiến dịch + lag firebase + zalo cookie bootstrap + msgTs hardening; regression 124 assertions GREEN; browser smoke 0 errors

## Files changed in this commit (`live-chat/`)

- `live-chat/index.html`
- `live-chat/js/live/live-campaign-manager.js`

## Last 5 commits touching `live-chat/`

- `7aa1f2507` feat(live-chat): AI gợi ý tên chiến dịch + giảm lag (firebase head→body) + hardening msgTs _(2026-06-27)_
- `6704382ea` fix(web2): thêm x-web2-token cho 5 web2 WRITE còn thiếu (Part A) _(2026-06-26)_
- `e5d158191` fix(live-chat): live-hidden-commenters _save gửi x-web2-token (hết 401 create/update) _(2026-06-26)\_
- `25b23634c` auto: session update _(2026-06-25)_
- `28cf5a5f2` fix(web2): quét 107 file — 18 nhãn native-cart sót → Giỏ hàng (audit vòng 4) _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-102830-15668b5` cho Claude walk chain theo CLAUDE.md protocol.
