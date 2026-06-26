# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-114201-ec8e33a`
**Session file**: [`./20260626-114201-ec8e33a.md`](../20260626-114201-ec8e33a.md)
**Commit**: `ec8e33a` — auto: session update
**Last updated**: 2026-06-26 11:42:01 +07
**Summary**: auto: session update

## Files changed in this commit (`live-chat/`)

- `live-chat/index.html`
- `live-chat/js/live/live-hidden-commenters.js`

## Last 5 commits touching `live-chat/`

- `e5d158191` fix(live-chat): live-hidden-commenters _save gửi x-web2-token (hết 401 create/update) _(2026-06-26)\_
- `25b23634c` auto: session update _(2026-06-25)_
- `28cf5a5f2` fix(web2): quét 107 file — 18 nhãn native-cart sót → Giỏ hàng (audit vòng 4) _(2026-06-25)_
- `eeaa6024a` auto: session update _(2026-06-25)_
- `314e8fa2e` fix(web2): dead partner-customer link → customers deep-link (?phone=); clean smoke harness _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-114201-ec8e33a` cho Claude walk chain theo CLAUDE.md protocol.
