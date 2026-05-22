# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-183556-0c75e48`
**Session file**: [`./20260522-183556-0c75e48.md`](../20260522-183556-0c75e48.md)
**Commit**: `0c75e48` — docs(dev-log): note 2 fix drag SP — fb context resolution + self-heal
**Last updated**: 2026-05-22 18:35:56 +07
**Summary**: docs(dev-log): note 2 fix drag SP — fb context resolution + self-heal

## Files changed in this commit (`render.com/`)

- `render.com/routes/native-orders.js`
- `render.com/routes/v2/cart.js`

## Last 5 commits touching `render.com/`

- `e5fcbff20` fix(tpos-pancake/cart): /add cũng self-heal native*order broken khi cart đã linked *(2026-05-22)\_
- `cf7c4897c` fix(native-orders/from-comment): tự heal fb*page_id/fb_post_id null khi merge vào draft cũ *(2026-05-22)\_
- `6b05bc3cb` fix(tpos-pancake): đơn drag SP mất fbPageId/fbPostId không mở chat được _(2026-05-22)_
- `ea15fb97b` feat(tpos-pancake/cart + native-orders): giữ cart 15 ngày + auto-clear khi tạo PBH + stock sync _(2026-05-22)_
- `ea3553cd5` fix(tpos-pancake/inv): cart gắn theo CUSTOMER (fbUserId), không phải comment*id *(2026-05-22)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-183556-0c75e48` cho Claude walk chain theo CLAUDE.md protocol.
