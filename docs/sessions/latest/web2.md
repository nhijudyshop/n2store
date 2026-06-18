# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-190051-6a90f3b`
**Session file**: [`./20260618-190051-6a90f3b.md`](../20260618-190051-6a90f3b.md)
**Commit**: `6a90f3b` — fix(web2-chat): guard Enter-to-send against Vietnamese IME composition (gửi nhầm 2 tin)
**Last updated**: 2026-06-18 19:00:51 +07
**Summary**: fix(web2-chat): guard Enter-to-send against Vietnamese IME composition (gửi nhầm 2 tin)

## Files changed in this commit (`web2/`)

- `web2/shared/web2-quick-reply.js`
- `web2/shared/zalo-chat/composer.js`

## Last 5 commits touching `web2/`

- `6a90f3b83` fix(web2-chat): guard Enter-to-send against Vietnamese IME composition (gửi nhầm 2 tin) _(2026-06-18)_
- `51d9368a1` auto: session update _(2026-06-18)_
- `c9eca6d66` fix(web2/multi-tool): tăng comment auto-clean — mark conv.id THẬT của comment boost _(2026-06-18)_
- `dadf493f6` fix(web2/fastsaleorder-invoice): nút Trả hàng crash — STATE.items→STATE.orders _(2026-06-18)_
- `4aea4b7b0` fix(web2/money): vá 5 HIGH + 3 MED rủi ro tiền NCC + ví khách _(2026-06-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-190051-6a90f3b` cho Claude walk chain theo CLAUDE.md protocol.
