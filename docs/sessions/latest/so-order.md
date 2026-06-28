# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-112707-035960e`
**Session file**: [`./20260628-112707-035960e.md`](../20260628-112707-035960e.md)
**Commit**: `035960e` — docs(dev-log): vòng đời SP HẾT HÀNG (nhận→bán→hết hàng) + invariant manual-pause
**Last updated**: 2026-06-28 11:27:07 +07
**Summary**: docs(dev-log): vòng đời SP HẾT HÀNG (nhận→bán→hết hàng) + invariant manual-pause

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `c4da6cce1` fix(web2): HET*HANG review-fixes — preserve manual pause + parent badge + refund paths *(2026-06-28)\_
- `73195acbd` auto: session update _(2026-06-28)_
- `32a6ce594` fix(so-order): picker không auto-đặt tên cho dòng đã chọn SP (matchedCode) _(2026-06-28)_
- `71b9d98e9` auto: session update _(2026-06-28)_
- `ff504d7ac` feat(so-order): SP cha nhiều biến thể = khối tách biệt rõ (giữ NCC/Ảnh-HĐ rowspan) _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-112707-035960e` cho Claude walk chain theo CLAUDE.md protocol.
