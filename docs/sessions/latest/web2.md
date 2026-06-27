# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-195141-4265971`
**Session file**: [`./20260627-195141-4265971.md`](../20260627-195141-4265971.md)
**Commit**: `4265971` — feat(web2/live): gom SP cha-con nhiều biến thể thành 1 card (by:'parent')
**Last updated**: 2026-06-27 19:51:41 +07
**Summary**: feat(web2/live): gom SP cha-con nhiều biến thể thành 1 card (by:'parent')

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/live-control/index.html`
- `web2/live-control/js/live-control.js`
- `web2/live-tv/index.html`
- `web2/live-tv/js/live-tv.js`
- `web2/shared/web2-tryon.js`
- `web2/shared/web2-variant-group.js`

## Last 5 commits touching `web2/`

- `426597158` feat(web2/live): gom SP cha-con nhiều biến thể thành 1 card (by:'parent') _(2026-06-27)_
- `9ce19fc45` fix(gemini-tryon): watchdog*timeout + timeout cao cho image gen (research issue #294/#252) - tao anh >120s khong bi giet *(2026-06-27)\_
- `6f6dc5c56` feat(gemini-tryon): uu tien model Flash o cookie + xoay tua, fail thi fallback Nano Banana paid (+model fallback resilience) _(2026-06-27)_
- `0e1fd29c5` feat(web2/live): mô hình GIỎ·MỚI + badge VƯỢT theo địa danh pre-order _(2026-06-27)_
- `1b3222458` auto: session update _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-195141-4265971` cho Claude walk chain theo CLAUDE.md protocol.
