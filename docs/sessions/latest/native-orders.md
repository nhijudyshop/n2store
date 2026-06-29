# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-162120-17f400a`
**Session file**: [`./20260629-162120-17f400a.md`](../20260629-162120-17f400a.md)
**Commit**: `17f400a` — feat(sort-station): trang "Bàn chia hàng" 📱 — put-wall sortation guided
**Last updated**: 2026-06-29 16:21:20 +07
**Summary**: Trang MỚI Bàn chia hàng (sort-station) — put-wall guided: quét→KỆ+đủ/thiếu+manifest; verified e2e

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `17f400a21` feat(sort-station): trang "Bàn chia hàng" 📱 — put-wall sortation guided _(2026-06-29)_
- `04b66121c` fix(native-orders): expand hiện mã đơn vị "-xxx" (o.id string → ép Number) _(2026-06-29)_
- `09123bcbc` docs(native-orders): dọn comment STT cũ ('1 + 2') cho khớp hành vi gộp mới _(2026-06-29)_
- `04579a1c5` fix(native-orders): đơn GỘP hiện STT kệ MỚI (campaign*stt) khớp tem, bỏ "1 + 2" *(2026-06-29)\_
- `8c1a9c556` feat(goods-weight): trang Cân Nặng Hàng ⚖️ — hàng về kiện cân + ảnh BYTEA + SSE web2:goods-weight _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-162120-17f400a` cho Claude walk chain theo CLAUDE.md protocol.
