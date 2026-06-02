# Latest Snapshot — `soluong-live/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260602-165058-37f707d`
**Session file**: [`./20260602-165058-37f707d.md`](../20260602-165058-37f707d.md)
**Commit**: `37f707d` — auto: session update
**Last updated**: 2026-06-02 16:50:58 +07
**Summary**: auto: session update

## Files changed in this commit (`soluong-live/`)

- `soluong-live/firebase-helpers.js`
- `soluong-live/js/hidden-soluong.js`
- `soluong-live/js/main.js`
- `soluong-live/js/soluong-list.js`

## Last 5 commits touching `soluong-live/`

- `f53cadce2` feat(soluong-live): sắp xếp 'Sản phẩm đã ẩn' món mới ẩn lên đầu (hiddenAt) _(2026-06-02)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `411482c33` feat(domain): rewire codebase sang custom domain nhijudy.store _(2026-05-21)_
- `445c4a21d` fix(invoice-compare): thêm shared/js/firebase-config.js trước token-manager _(2026-04-28)_
- `cf93f9a0f` fix(smoke phase 3 batch 2): G3 sales-report ready event + G4 null DOM guards + G5 AI widget basePath _(2026-04-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260602-165058-37f707d` cho Claude walk chain theo CLAUDE.md protocol.
