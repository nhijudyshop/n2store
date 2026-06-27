# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-165831-664f089`
**Session file**: [`./20260627-165831-664f089.md`](../20260627-165831-664f089.md)
**Commit**: `664f089` — feat(web2/live-control): bấm GIỎ/KH MỚI ở board → popup chi tiết giỏ khách
**Last updated**: 2026-06-27 16:58:31 +07
**Summary**: feat(web2/live-control): bấm GIỎ/KH MỚI ở board → popup chi tiết giỏ khách

## Files changed in this commit (`web2/`)

- `web2/live-control/css/live-control.css`
- `web2/live-control/index.html`
- `web2/live-control/js/live-control.js`
- `web2/shared/web2-campaign.js`

## Last 5 commits touching `web2/`

- `664f08956` feat(web2/live-control): bấm GIỎ/KH MỚI ở board → popup chi tiết giỏ khách _(2026-06-27)_
- `ffe6b62eb` fix(web2/live-control): đổi chỗ banner hint ↔ panel điều khiển TV (panel lên trên, hint xuống dưới) _(2026-06-27)_
- `5dd946dc1` fix(web2/live-control): cuộn cả trang được + đẩy panel điều khiển TV xuống dưới _(2026-06-27)_
- `3cd7783fa` feat(gemini-tryon): che do chi-free, bo tu fallback Nano Banana tra phi _(2026-06-27)_
- `266e41768` feat(web2/ai-hub): % tiến trình giữa vòng + tốc độ nhanh hơn; fix(gemini-tryon): retry tunnel chập chờn; fix icon wand-sparkles→sparkles _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-165831-664f089` cho Claude walk chain theo CLAUDE.md protocol.
