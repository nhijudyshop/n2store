# Latest Snapshot — `soluong-live/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-111903-954852a`
**Session file**: [`./20260604-111903-954852a.md`](../20260604-111903-954852a.md)
**Commit**: `954852a` — feat(soluong-live): realtime TPOS sync tên/hình/số lượng (giữ logic biến thể)
**Last updated**: 2026-06-04 11:19:03 +07
**Summary**: feat(soluong-live): realtime TPOS sync tên/hình/số lượng (giữ logic biến thể)

## Files changed in this commit (`soluong-live/`)

- `soluong-live/index.html`
- `soluong-live/js/main.js`
- `soluong-live/js/soluong-list.js`
- `soluong-live/js/warehouse-realtime.js`
- `soluong-live/soluong-list.html`

## Last 5 commits touching `soluong-live/`

- `954852a89` feat(soluong-live): realtime TPOS sync tên/hình/số lượng (giữ logic biến thể) _(2026-06-04)_
- `f53cadce2` feat(soluong-live): sắp xếp 'Sản phẩm đã ẩn' món mới ẩn lên đầu (hiddenAt) _(2026-06-02)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `411482c33` feat(domain): rewire codebase sang custom domain nhijudy.store _(2026-05-21)_
- `445c4a21d` fix(invoice-compare): thêm shared/js/firebase-config.js trước token-manager _(2026-04-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-111903-954852a` cho Claude walk chain theo CLAUDE.md protocol.
