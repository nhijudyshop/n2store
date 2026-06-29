# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-125215-1f56a64`
**Session file**: [`./20260629-125215-1f56a64.md`](../20260629-125215-1f56a64.md)
**Commit**: `1f56a64` — docs(web2): KB cách vận hành mã SP & per-unit QR (mint→so-order→Kho SP→unit-scan)
**Last updated**: 2026-06-29 12:52:15 +07
**Summary**: Mint theo SL kho (SP-001..SP-N lúc tạo SP) + gán seq nhỏ nhất/tái dùng freed + KB mã SP; verified online

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/KB-PRODUCT-CODE-UNITS.md`
- `docs/web2/KB-SYSTEM-SERVICES.md`

## Last 5 commits touching `docs/`

- `1f56a64ae` docs(web2): KB cách vận hành mã SP & per-unit QR (mint→so-order→Kho SP→unit-scan) _(2026-06-29)_
- `668550f86` feat(units): mint theo SL kho (SP-001..SP-SL) lúc tạo SP + gán seq nhỏ nhất / tái dùng freed _(2026-06-29)_
- `acfc3eadf` chore(session): RESUME:20260629-120124-09123bc _(2026-06-29)_
- `04579a1c5` fix(native-orders): đơn GỘP hiện STT kệ MỚI (campaign*stt) khớp tem, bỏ "1 + 2" *(2026-06-29)\_
- `007c69119` chore(session): RESUME:20260629-114803-038a746 _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-125215-1f56a64` cho Claude walk chain theo CLAUDE.md protocol.
