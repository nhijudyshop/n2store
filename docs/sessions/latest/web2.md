# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-200449-7628f1e`
**Session file**: [`./20260623-200449-7628f1e.md`](../20260623-200449-7628f1e.md)
**Commit**: `7628f1e` — security(web2-login): bỏ dòng lộ tài khoản mặc định admin/admin@@
**Last updated**: 2026-06-23 20:04:49 +07
**Summary**: security(web2-login): bỏ dòng lộ tài khoản mặc định admin/admin@@

## Files changed in this commit (`web2/`)

- `web2/login/index.html`

## Last 5 commits touching `web2/`

- `7628f1e10` security(web2-login): bỏ dòng lộ tài khoản mặc định admin/admin@@ _(2026-06-23)_
- `33b442681` auto: session update _(2026-06-23)_
- `6dfdad3ab` feat(web2-zalo): per-máy owner-scoped — mỗi máy chỉ thấy/dùng account chat.zalo.me của máy đó _(2026-06-23)_
- `42fb07988` tweak(web2-cham-cong): dung sai mặc định 5→6 phút (8h06/19h54 vẫn đúng giờ) + migrate _(2026-06-23)_
- `583ffcaea` fix(web2-cham-cong): lương tháng KHÔNG auto-OT (hourlyRate suy từ lương tháng sai khổng lồ → otPay=0) _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-200449-7628f1e` cho Claude walk chain theo CLAUDE.md protocol.
