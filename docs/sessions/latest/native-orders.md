# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-131141-746ac8c`
**Session file**: [`./20260630-131141-746ac8c.md`](../20260630-131141-746ac8c.md)
**Commit**: `746ac8c` — feat(native-orders): gỡ tạo+gán chiến dịch → chỉ chọn để lọc (1 nguồn=live-chat) [#1 bước 2]
**Last updated**: 2026-06-30 13:11:41 +07
**Summary**: feat(native-orders): gỡ tạo+gán chiến dịch → chỉ chọn để lọc (1 nguồn=live-chat) [#1 bước 2]

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-filters-campaigns.js`
- `native-orders/js/native-orders-realtime-init.js`

## Last 5 commits touching `native-orders/`

- `746ac8c5c` feat(native-orders): gỡ tạo+gán chiến dịch → chỉ chọn để lọc (1 nguồn=live-chat) [#1 bước 2] _(2026-06-30)_
- `79afb759a` fix(soan-hang): tách toggle IN khỏi is*active → cột print_enabled (tag VẪN hiện khi tắt in) *(2026-06-30)\_
- `126821a10` fix(soan-hang): toggle = bật/tắt IN GIẤY (không khoá nút); bấm nút LUÔN gắn tag _(2026-06-30)_
- `345a9c000` fix(native-orders): order-tags /list trả {records} không phải {tags} — gate soan*hang đọc đúng key *(2026-06-30)\_
- `904effde6` feat(order-tags): tag SOẠN HÀNG cho giỏ khi in phiếu soạn hàng + toggle admin bật/tắt in _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-131141-746ac8c` cho Claude walk chain theo CLAUDE.md protocol.
