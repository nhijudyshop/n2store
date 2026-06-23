# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-185502-583ffca`
**Session file**: [`./20260623-185502-583ffca.md`](../20260623-185502-583ffca.md)
**Commit**: `583ffca` — fix(web2-cham-cong): lương tháng KHÔNG auto-OT (hourlyRate suy từ lương tháng sai khổng lồ → otPay=0)
**Last updated**: 2026-06-23 18:55:02 +07
**Summary**: fix(web2-cham-cong): lương tháng KHÔNG auto-OT (hourlyRate suy từ lương tháng sai khổng lồ → otPay=0)

## Files changed in this commit (`web2/`)

- `web2/cham-cong/index.html`
- `web2/cham-cong/js/cham-cong-app.js`
- `web2/cham-cong/js/cham-cong-employees.js`
- `web2/cham-cong/js/cham-cong-payroll.js`
- `web2/cham-cong/js/cham-cong-salary.js`

## Last 5 commits touching `web2/`

- `583ffcaea` fix(web2-cham-cong): lương tháng KHÔNG auto-OT (hourlyRate suy từ lương tháng sai khổng lồ → otPay=0) _(2026-06-23)_
- `2b159d663` feat(web2-cham-cong): lương theo tháng (cố định) + dung sai ±phút vào/ra _(2026-06-23)_
- `80cfd2d63` refactor(web2-zalo): bỏ lưu phiên trên server + bỏ QR — chỉ đăng nhập qua chat.zalo.me (browser) _(2026-06-23)_
- `e01086f60` auto: session update _(2026-06-23)_
- `465bb904a` auto: session update _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-185502-583ffca` cho Claude walk chain theo CLAUDE.md protocol.
