# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-195102-123e6d5`
**Session file**: [`./20260613-195102-123e6d5.md`](../20260613-195102-123e6d5.md)
**Commit**: `123e6d5` — auto: session update
**Last updated**: 2026-06-13 19:51:02 +07
**Summary**: auto: session update

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `e0a74e0d0` feat(web2): bắt buộc đăng nhập — page guard redirect /web2/login khi chưa auth _(2026-06-13)_
- `dd5e25c86` polish(web2): dedupe source-pill hide rule (gộp 3 block trùng → 1) _(2026-06-13)_
- `0c3188894` polish(web2): ẩn source-pill (tên bảng DB) — commit --only chống race _(2026-06-13)_
- `9b9d1ac64` polish(web2): ẩn source-pill (re-apply — lần trước mất do race commit đồng thời) _(2026-06-13)_
- `29bb8688f` polish(web2): ẩn source-pill (tên bảng DB kỹ thuật) khỏi UI sản xuất _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-195102-123e6d5` cho Claude walk chain theo CLAUDE.md protocol.
