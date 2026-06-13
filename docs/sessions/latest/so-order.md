# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-133602-ad01d13`
**Session file**: [`./20260613-133602-ad01d13.md`](../20260613-133602-ad01d13.md)
**Commit**: `ad01d13` — fix(so-order): in tem dùng chung nguồn web2/products — load Web2QR + Web2Printer
**Last updated**: 2026-06-13 13:36:02 +07
**Summary**: fix(so-order): in tem dùng chung nguồn web2/products — load Web2QR + Web2Printer

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `ad01d1395` fix(so-order): in tem dùng chung nguồn web2/products — load Web2QR + Web2Printer _(2026-06-13)_
- `12ad549cd` auto: session update _(2026-06-13)_
- `d5b84c1fd` fix(web2-sse): reload-on-reconnect — re-fetch sau khi SSE nối lại _(2026-06-13)_
- `40f62805f` auto: session update _(2026-06-13)_
- `1a4ba7421` fix(so-order): SP tạo từ Sổ Order nhận NCC từ sharedFields → mã SP có prefix NCC đúng (hết fallback KHO) _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-133602-ad01d13` cho Claude walk chain theo CLAUDE.md protocol.
