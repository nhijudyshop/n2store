# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-152855-5620b5b`
**Session file**: [`./20260613-152855-5620b5b.md`](../20260613-152855-5620b5b.md)
**Commit**: `5620b5b` — auto: session update
**Last updated**: 2026-06-13 15:28:55 +07
**Summary**: auto: session update

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-app.js`
- `so-order/js/so-order-storage.js`

## Last 5 commits touching `so-order/`

- `5620b5b51` auto: session update _(2026-06-13)_
- `eba151f2b` fix(so-order): mã SP encode màu/size — tách biến thể gộp 'Màu / Size' khi tra cứu override _(2026-06-13)_
- `147e0a0fc` auto: session update _(2026-06-13)_
- `ccf8b4a3b` fix(web2): Batch 1 audit — công nợ draft/cancelled (A3) + manualSepayId wrap (C17) + partial-return filter (A2) _(2026-06-13)_
- `93d29cedb` docs(web2): 3W6 ✅ trong đợt I (sửa dòng còn lệch) — sidebar _isAdmin ưu tiên Web2Auth role _(2026-06-13)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-152855-5620b5b` cho Claude walk chain theo CLAUDE.md protocol.
