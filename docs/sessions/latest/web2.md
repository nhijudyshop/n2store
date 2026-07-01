# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-153303-6b9b9d0`
**Session file**: [`./20260701-153303-6b9b9d0.md`](../20260701-153303-6b9b9d0.md)
**Commit**: `6b9b9d0` — fix(web2-campaign): audit chiến dịch livestream + sửa 2 lỗi HIGH
**Last updated**: 2026-07-01 15:33:03 +07
**Summary**: Audit chiến dịch livestream (87 agents) + sửa H1 gate fb_post_id + H2 TV allCodes; H3 quyền + H4 campaign_stt chờ quyết

## Files changed in this commit (`web2/`)

- `web2/live-tv/js/live-tv.js`

## Last 5 commits touching `web2/`

- `6b9b9d002` fix(web2-campaign): audit chiến dịch livestream + sửa 2 lỗi HIGH _(2026-07-01)_
- `5a2158df2` feat(reconcile): gọn tab lọc + Hủy đóng gói chụp ảnh lưu lịch sử _(2026-07-01)_
- `18523d2ba` fix(reconcile): quét tem per-unit ra mã SP thay vì link _(2026-07-01)_
- `20c123ec4` feat(tryon-widget): ✨ ghép đồ/mặt cũng paid-first như ai-hub _(2026-07-01)_
- `2108c84ee` feat(web2-shared): Web2PinchZoom + goods-weight preview pinch-to-zoom (2 ngón) _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-153303-6b9b9d0` cho Claude walk chain theo CLAUDE.md protocol.
