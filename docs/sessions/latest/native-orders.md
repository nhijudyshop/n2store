# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-171227-9f5b17a`
**Session file**: [`./20260630-171227-9f5b17a.md`](../20260630-171227-9f5b17a.md)
**Commit**: `9f5b17a` — auto: session update
**Last updated**: 2026-06-30 17:12:27 +07
**Summary**: auto: session update

## Files changed in this commit (`native-orders/`)

- `native-orders/js/native-orders-control-drawer.js`
- `native-orders/js/native-orders-kpi-health.js`
- `native-orders/js/native-orders-kpi.js`

## Last 5 commits touching `native-orders/`

- `85f9fe063` refactor(web2 util): gộp money(11)→Web2Format.vnd + escape(76)→Web2Escape.escapeHtml (delegate-with-fallback); date đã-delegate, phone hoãn _(2026-06-30)_
- `c23125cd9` auto: session update _(2026-06-30)_
- `a45bb6d50` refactor(order-tags): gộp tag 'Âm mã' → 'Chờ hàng' (over-sell = chờ hàng = cần đặt NCC, 1 khái niệm) _(2026-06-30)_
- `746ac8c5c` feat(native-orders): gỡ tạo+gán chiến dịch → chỉ chọn để lọc (1 nguồn=live-chat) [#1 bước 2] _(2026-06-30)_
- `79afb759a` fix(soan-hang): tách toggle IN khỏi is*active → cột print_enabled (tag VẪN hiện khi tắt in) *(2026-06-30)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-171227-9f5b17a` cho Claude walk chain theo CLAUDE.md protocol.
