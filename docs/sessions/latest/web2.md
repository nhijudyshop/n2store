# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-121806-94ad79f`
**Session file**: [`./20260622-121806-94ad79f.md`](../20260622-121806-94ad79f.md)
**Commit**: `94ad79f` — feat(video-maker): ElevenLabs VN — model flash_v2_5 + kho giọng cộng đồng (lọc/cuộn) + voice settings (P2)
**Last updated**: 2026-06-22 12:18:06 +07
**Summary**: feat(video-maker): ElevenLabs VN — model flash_v2_5 + kho giọng cộng đồng (lọc/cuộn) + voice settings (P2)

## Files changed in this commit (`web2/`)

- `web2/delivery-zone/index.html`
- `web2/fastsaleorder-delivery/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-refund/index.html`
- `web2/live-control/index.html`
- `web2/order-tags/index.html`
- `web2/printer-settings/index.html`
- `web2/product-category/index.html`
- `web2/products/index.html`
- `web2/shared/web2-base.css`
- `web2/variants/index.html`
- `web2/video-maker/index.html`
- `web2/video-maker/js/video-library.js`
- `web2/video-maker/js/video-maker.js`
- `web2/video-maker/js/video-tts.js`
- `web2/video-maker/video-maker.css`

## Last 5 commits touching `web2/`

- `94ad79f4f` feat(video-maker): ElevenLabs VN — model flash*v2_5 + kho giọng cộng đồng (lọc/cuộn) + voice settings (P2) *(2026-06-22)\_
- `e3c7e1315` fix(web2) native-orders: add mobile shell pack to base.css (hamburger desktop-hide + drawer) _(2026-06-22)_
- `65fb3bf5e` feat(video-maker): bố cục pro-editor (wide-edit + PiP nổi/preview-focus/hidden) + P1/P3 voice _(2026-06-22)_
- `89bfd9d70` refactor(web2) CSS consolidate: table tokens 1-source + pagination align + drop dead .filters _(2026-06-22)_
- `a13f26e99` refactor(web2-css) align --web2-bg-cell-head token theme=base (#f0eeee) — themed table header khớp đúng native-orders _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-121806-94ad79f` cho Claude walk chain theo CLAUDE.md protocol.
