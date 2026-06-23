# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-185502-583ffca`
**Session file**: [`./20260623-185502-583ffca.md`](../20260623-185502-583ffca.md)
**Commit**: `583ffca` — fix(web2-cham-cong): lương tháng KHÔNG auto-OT (hourlyRate suy từ lương tháng sai khổng lồ → otPay=0)
**Last updated**: 2026-06-23 18:55:02 +07
**Summary**: fix(web2-cham-cong): lương tháng KHÔNG auto-OT (hourlyRate suy từ lương tháng sai khổng lồ → otPay=0)

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-attendance.js`

## Last 5 commits touching `render.com/`

- `2b159d663` feat(web2-cham-cong): lương theo tháng (cố định) + dung sai ±phút vào/ra _(2026-06-23)_
- `af2ca38c6` fix(web2): cost-cap hoàn NCC server-side + cart race lock + refund SSE web2:products _(2026-06-23)_
- `bb3a488e9` fix(web2): gate 11 native-orders mutation routes (requireWeb2AuthSoft) + BIGINT Number() in balance-history _(2026-06-23)_
- `465bb904a` auto: session update _(2026-06-23)_
- `04783a0f3` auto: session update _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-185502-583ffca` cho Claude walk chain theo CLAUDE.md protocol.
