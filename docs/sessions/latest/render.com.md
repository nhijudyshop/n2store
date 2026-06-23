# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-191834-601dace`
**Session file**: [`./20260623-191834-601dace.md`](../20260623-191834-601dace.md)
**Commit**: `601dace` — auto: session update
**Last updated**: 2026-06-23 19:18:34 +07
**Summary**: auto: session update

## Files changed in this commit (`render.com/`)

- `render.com/db/web2-zalo-schema.js`
- `render.com/routes/web2-attendance.js`
- `render.com/services/web2-zalo-zca.js`

## Last 5 commits touching `render.com/`

- `601dace2a` auto: session update _(2026-06-23)_
- `42fb07988` tweak(web2-cham-cong): dung sai mặc định 5→6 phút (8h06/19h54 vẫn đúng giờ) + migrate _(2026-06-23)_
- `2b159d663` feat(web2-cham-cong): lương theo tháng (cố định) + dung sai ±phút vào/ra _(2026-06-23)_
- `af2ca38c6` fix(web2): cost-cap hoàn NCC server-side + cart race lock + refund SSE web2:products _(2026-06-23)_
- `bb3a488e9` fix(web2): gate 11 native-orders mutation routes (requireWeb2AuthSoft) + BIGINT Number() in balance-history _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-191834-601dace` cho Claude walk chain theo CLAUDE.md protocol.
