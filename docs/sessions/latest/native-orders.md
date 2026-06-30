# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-165352-c23125c`
**Session file**: [`./20260630-165352-c23125c.md`](../20260630-165352-c23125c.md)
**Commit**: `c23125c` — auto: session update
**Last updated**: 2026-06-30 16:53:52 +07
**Summary**: auto: session update

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `c23125cd9` auto: session update _(2026-06-30)_
- `a45bb6d50` refactor(order-tags): gộp tag 'Âm mã' → 'Chờ hàng' (over-sell = chờ hàng = cần đặt NCC, 1 khái niệm) _(2026-06-30)_
- `746ac8c5c` feat(native-orders): gỡ tạo+gán chiến dịch → chỉ chọn để lọc (1 nguồn=live-chat) [#1 bước 2] _(2026-06-30)_
- `79afb759a` fix(soan-hang): tách toggle IN khỏi is*active → cột print_enabled (tag VẪN hiện khi tắt in) *(2026-06-30)\_
- `126821a10` fix(soan-hang): toggle = bật/tắt IN GIẤY (không khoá nút); bấm nút LUÔN gắn tag _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-165352-c23125c` cho Claude walk chain theo CLAUDE.md protocol.
