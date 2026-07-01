# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-143640-18523d2`
**Session file**: [`./20260701-143640-18523d2.md`](../20260701-143640-18523d2.md)
**Commit**: `18523d2` — fix(reconcile): quét tem per-unit ra mã SP thay vì link
**Last updated**: 2026-07-01 14:36:40 +07
**Summary**: fix reconcile: quét tem per-unit ra mã SP thay vì link (resolve unit-scan URL)

## Files changed in this commit (`web2/`)

- `web2/reconcile/index.html`
- `web2/reconcile/js/reconcile-actions.js`

## Last 5 commits touching `web2/`

- `18523d2ba` fix(reconcile): quét tem per-unit ra mã SP thay vì link _(2026-07-01)_
- `20c123ec4` feat(tryon-widget): ✨ ghép đồ/mặt cũng paid-first như ai-hub _(2026-07-01)_
- `2108c84ee` feat(web2-shared): Web2PinchZoom + goods-weight preview pinch-to-zoom (2 ngón) _(2026-07-01)_
- `d0da89dd5` feat(ai-hub): ảnh ưu tiên paid trước, hết lượt mới free; text vẫn free _(2026-07-01)_
- `6531ff93e` feat(goods-weight): thêm nút 'Tải ảnh lên' (gallery/file) cạnh 'Chụp ảnh' _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-143640-18523d2` cho Claude walk chain theo CLAUDE.md protocol.
