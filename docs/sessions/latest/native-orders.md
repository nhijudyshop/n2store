# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-115243-9256bd0`
**Session file**: [`./20260626-115243-9256bd0.md`](../20260626-115243-9256bd0.md)
**Commit**: `9256bd0` — auto: session update
**Last updated**: 2026-06-26 11:52:43 +07
**Summary**: auto: session update

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-pbh-bill.js`

## Last 5 commits touching `native-orders/`

- `9256bd09f` auto: session update _(2026-06-26)_
- `1b6981e10` feat(native-orders): nút xoá admin-only (giỏ hàng/đơn huỷ; đơn chốt PBH không xoá) + feat(audit-log): lọc hành động chi tiết (action filter BE+FE) _(2026-06-26)_
- `7e1bfdb5b` feat(chat): nút 📍 thủ công trên tin KH để thêm địa chỉ vào đơn (fallback auto-detect) _(2026-06-26)_
- `a3b88678e` feat(native-orders/chat): tự nhận diện địa chỉ + nút "Thêm vào đơn" (Feature 3) _(2026-06-26)_
- `a75e147fd` feat(web2/customer-chat): realtime như live-chat — subscribe SSE web2:messages _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-115243-9256bd0` cho Claude walk chain theo CLAUDE.md protocol.
