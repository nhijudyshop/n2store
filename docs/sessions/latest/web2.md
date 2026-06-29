# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-125215-1f56a64`
**Session file**: [`./20260629-125215-1f56a64.md`](../20260629-125215-1f56a64.md)
**Commit**: `1f56a64` — docs(web2): KB cách vận hành mã SP & per-unit QR (mint→so-order→Kho SP→unit-scan)
**Last updated**: 2026-06-29 12:52:15 +07
**Summary**: Mint theo SL kho (SP-001..SP-N lúc tạo SP) + gán seq nhỏ nhất/tái dùng freed + KB mã SP; verified online

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-render.js`

## Last 5 commits touching `web2/`

- `668550f86` feat(units): mint theo SL kho (SP-001..SP-SL) lúc tạo SP + gán seq nhỏ nhất / tái dùng freed _(2026-06-29)_
- `343ba2e48` fix(goods-weight): hết tràn ngang mobile — number input co được trong grid (min-width:0 + width:100%) _(2026-06-29)_
- `78dd026c1` feat(unit-scan): danh sách TẤT CẢ tem của SP (ẩn/bật, mỗi tem→STT) + QR tem TO HƠN _(2026-06-29)_
- `968eadd74` feat(goods-weight): rebuild MOBILE-NATIVE theo unit-scan (no sidebar, PWA, safe-area, Zalo tokens) _(2026-06-29)_
- `e3c37b66b` docs(web2): regen codemap + system-data (goods-weight page/route/SSE registered) _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-125215-1f56a64` cho Claude walk chain theo CLAUDE.md protocol.
