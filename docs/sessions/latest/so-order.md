# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-114339-12ad549`
**Session file**: [`./20260613-114339-12ad549.md`](../20260613-114339-12ad549.md)
**Commit**: `12ad549` — auto: session update
**Last updated**: 2026-06-13 11:43:39 +07
**Summary**: auto: session update

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `12ad549cd` auto: session update _(2026-06-13)_
- `d5b84c1fd` fix(web2-sse): reload-on-reconnect — re-fetch sau khi SSE nối lại _(2026-06-13)_
- `40f62805f` auto: session update _(2026-06-13)_
- `1a4ba7421` fix(so-order): SP tạo từ Sổ Order nhận NCC từ sharedFields → mã SP có prefix NCC đúng (hết fallback KHO) _(2026-06-13)_
- `d2190c0aa` feat(so-order): 2 nút sinh data ngẫu nhiên — toolbar tạo N đơn + modal điền 1-4 SP kèm ảnh (test data) _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-114339-12ad549` cho Claude walk chain theo CLAUDE.md protocol.
