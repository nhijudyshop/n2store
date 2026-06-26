# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-112641-3937235`
**Session file**: [`./20260626-112641-3937235.md`](../20260626-112641-3937235.md)
**Commit**: `3937235` — fix(so-order): in tem/mã SP dùng CHUNG module web2/products, gỡ modal 'In mã vạch' legacy fork
**Last updated**: 2026-06-26 11:26:41 +07
**Summary**: so-order in tem/mã SP dùng chung module web2/products, gỡ modal In mã vạch legacy

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-barcode.js`

## Last 5 commits touching `so-order/`

- `39372353d` fix(so-order): in tem/mã SP dùng CHUNG module web2/products, gỡ modal 'In mã vạch' legacy fork _(2026-06-26)_
- `cc7cb0d99` auto: session update _(2026-06-26)_
- `25b23634c` auto: session update _(2026-06-25)_
- `501cf9933` fix(web2/ai-assistant): ẩn khối <think> reasoning model khỏi chat _(2026-06-25)_
- `2557fef33` feat(so-order/AI): đối chiếu Sổ Order ⇄ Kho SP tính sẵn — AI hết xin data _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-112641-3937235` cho Claude walk chain theo CLAUDE.md protocol.
