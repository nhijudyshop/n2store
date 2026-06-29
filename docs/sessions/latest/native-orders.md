# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-130146-04b6612`
**Session file**: [`./20260629-130146-04b6612.md`](../20260629-130146-04b6612.md)
**Commit**: `04b6612` — fix(native-orders): expand hiện mã đơn vị "-xxx" (o.id string → ép Number)
**Last updated**: 2026-06-29 13:01:46 +07
**Summary**: fix(native-orders): expand hiện mã đơn vị "-xxx" (o.id string → ép Number)

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-unit-serials.js`

## Last 5 commits touching `native-orders/`

- `04b66121c` fix(native-orders): expand hiện mã đơn vị "-xxx" (o.id string → ép Number) _(2026-06-29)_
- `09123bcbc` docs(native-orders): dọn comment STT cũ ('1 + 2') cho khớp hành vi gộp mới _(2026-06-29)_
- `04579a1c5` fix(native-orders): đơn GỘP hiện STT kệ MỚI (campaign*stt) khớp tem, bỏ "1 + 2" *(2026-06-29)\_
- `8c1a9c556` feat(goods-weight): trang Cân Nặng Hàng ⚖️ — hàng về kiện cân + ảnh BYTEA + SSE web2:goods-weight _(2026-06-29)_
- `b5afc142f` fix(web2/ai-assistant): lỗi provider chứa "token" bị nhầm là phiên hết hạn → đăng xuất oan _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-130146-04b6612` cho Claude walk chain theo CLAUDE.md protocol.
