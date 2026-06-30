# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-090535-904effd`
**Session file**: [`./20260630-090535-904effd.md`](../20260630-090535-904effd.md)
**Commit**: `904effd` — feat(order-tags): tag SOẠN HÀNG cho giỏ khi in phiếu soạn hàng + toggle admin bật/tắt in
**Last updated**: 2026-06-30 09:05:35 +07
**Summary**: feat(order-tags): tag SOẠN HÀNG cho giỏ khi in phiếu soạn hàng + toggle admin bật/tắt in

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-api.js`
- `native-orders/js/native-orders-pbh-bill.js`

## Last 5 commits touching `native-orders/`

- `904effde6` feat(order-tags): tag SOẠN HÀNG cho giỏ khi in phiếu soạn hàng + toggle admin bật/tắt in _(2026-06-30)_
- `f32c9aa65` feat(native-orders): bảng điều khiển trượt phải — tab Thẻ + Sản phẩm + Thống kê _(2026-06-29)_
- `e606c068a` feat(native-orders): bộ lọc Thẻ dạng panel danh sách + drawer chi tiết tổng hợp _(2026-06-29)_
- `9403ec175` perf(in-bill): gộp Phiếu Soạn Hàng vào đường in chung Web2Bill + bridge _(2026-06-29)_
- `6ce9bb94b` feat(native-orders): Phiếu Soạn Hàng tự tick SP đang Chờ Hàng _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-090535-904effd` cho Claude walk chain theo CLAUDE.md protocol.
