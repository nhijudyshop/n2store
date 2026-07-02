# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260702-094210-2e643ba`
**Session file**: [`./20260702-094210-2e643ba.md`](../20260702-094210-2e643ba.md)
**Commit**: `2e643ba` — feat(cham-cong): bảng lương bấm ô mở modal kiểu TPOS (bỏ nút Sửa) + chấm đủ = trọn lương ngày
**Last updated**: 2026-07-02 09:42:10 +07
**Summary**: feat(cham-cong): bảng lương bấm ô mở modal kiểu TPOS (bỏ nút Sửa) + chấm đủ = trọn lương ngày

## Files changed in this commit (`so-order/`)

- `so-order/js/so-order-receive.js`

## Last 5 commits touching `so-order/`

- `573db79f5` refactor(web2): worker-base dedup hoàn tất — 18 file config-first, 0 primary-literal còn _(2026-07-02)_
- `a67b70118` feat(so-order+live-control): hiện return*qty (thu về chờ duyệt) → tránh đặt dư NCC *(2026-07-01)\_
- `415e1eb3c` fix(web2 audit vòng4): fix tất cả — 4 HIGH security + medium/low (34 file) _(2026-06-30)_
- `cd1613916` fix(web2 audit vòng4): CRITICAL so-order mất data partial*received + nhãn confirm; doc 92-agent audit *(2026-06-30)\_
- `85f9fe063` refactor(web2 util): gộp money(11)→Web2Format.vnd + escape(76)→Web2Escape.escapeHtml (delegate-with-fallback); date đã-delegate, phone hoãn _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260702-094210-2e643ba` cho Claude walk chain theo CLAUDE.md protocol.
