# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-211040-25b2363`
**Session file**: [`./20260625-211040-25b2363.md`](../20260625-211040-25b2363.md)
**Commit**: `25b2363` — auto: session update
**Last updated**: 2026-06-25 21:10:40 +07
**Summary**: auto: session update

## Files changed in this commit (`live-chat/`)

- `live-chat/chat.html`
- `live-chat/index.html`

## Last 5 commits touching `live-chat/`

- `25b23634c` auto: session update _(2026-06-25)_
- `28cf5a5f2` fix(web2): quét 107 file — 18 nhãn native-cart sót → Giỏ hàng (audit vòng 4) _(2026-06-25)_
- `eeaa6024a` auto: session update _(2026-06-25)_
- `314e8fa2e` fix(web2): dead partner-customer link → customers deep-link (?phone=); clean smoke harness _(2026-06-24)_
- `af9eb99af` feat(web2-sidebar): tạo group menu 'AI' — gom Trợ lý AI + Xưởng Video AI; bump sidebar v=20260623ai3 _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-211040-25b2363` cho Claude walk chain theo CLAUDE.md protocol.
