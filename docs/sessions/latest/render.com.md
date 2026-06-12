# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260612-183410-7bb139d`
**Session file**: [`./20260612-183410-7bb139d.md`](../20260612-183410-7bb139d.md)
**Commit**: `7bb139d` — auto: session update
**Last updated**: 2026-06-12 18:34:10 +07
**Summary**: auto: session update

## Files changed in this commit (`render.com/`)

- `render.com/routes/delivery-invoices.js`
- `render.com/routes/fast-sale-orders.js`
- `render.com/routes/native-orders.js`
- `render.com/routes/refunds.js`
- `render.com/routes/v2/cart.js`
- `render.com/routes/v2/web2-wallets.js`
- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `7bb139d21` auto: session update _(2026-06-12)_
- `c719b9de4` refactor(web2): gỡ hẳn crm*team_id/crm_team_name — di tích TPOS (DROP COLUMN native_orders + fast_sale_orders, client ngừng gửi, getPartnerInfo bỏ tham số chết) *(2026-06-12)\_
- `cf11709bb` fix(web2): đợt H phần còn lại — 3H9 + 3H8/events + LC-pollnow-auth + 3H15 _(2026-06-12)_
- `276a64355` fix(live-chat): đợt H — realtime mất tin nhắn (cursor updated*at + merge-by-id), drag-drop 500 (crm_team_id BIGINT), auto-snap 3H6, lọc người-ẩn 3H7, live-saved 3H8, gallery che topbar *(2026-06-12)\_
- `11b6d0717` fix(web2): đợt G vòng 3 — auth blanket + enforce-prep (3H14, 3H17-3H19, 3H21 + cụm 1D auth) _(2026-06-12)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260612-183410-7bb139d` cho Claude walk chain theo CLAUDE.md protocol.
