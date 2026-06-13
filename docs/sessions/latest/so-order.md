# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-154059-e4f48d8`
**Session file**: [`./20260613-154059-e4f48d8.md`](../20260613-154059-e4f48d8.md)
**Commit**: `e4f48d8` — docs(web2): C8 done phase 1 — so-order Firestore→Postgres (15/15 audit ĐÓNG)
**Last updated**: 2026-06-13 15:40:59 +07
**Summary**: docs(web2): C8 done phase 1 — so-order Firestore→Postgres (15/15 audit ĐÓNG)

## Files changed in this commit (`so-order/`)

- `so-order/js/so-order-storage.js`

## Last 5 commits touching `so-order/`

- `e7beb4a0d` fix(so-order): data ngẫu nhiên lấy màu/size từ Kho Biến Thể (bỏ Xanh Navy hardcoded) _(2026-06-13)_
- `5620b5b51` auto: session update _(2026-06-13)_
- `eba151f2b` fix(so-order): mã SP encode màu/size — tách biến thể gộp 'Màu / Size' khi tra cứu override _(2026-06-13)_
- `147e0a0fc` auto: session update _(2026-06-13)_
- `ccf8b4a3b` fix(web2): Batch 1 audit — công nợ draft/cancelled (A3) + manualSepayId wrap (C17) + partial-return filter (A2) _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-154059-e4f48d8` cho Claude walk chain theo CLAUDE.md protocol.
