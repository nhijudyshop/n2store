# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-005336-896c1a8`
**Session file**: [`./20260624-005336-896c1a8.md`](../20260624-005336-896c1a8.md)
**Commit**: `896c1a8` — fix(web2): ai-hub image-gen hang (timeouts) + hide stock brand names + connect video flow + auto-stock
**Last updated**: 2026-06-24 00:53:36 +07
**Summary**: Fix ai-hub image-gen hang (timeouts) + hide stock brand names + connect video-maker flow + auto-stock topic→video

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/ai-hub/js/ai-image.js`
- `web2/video-maker/index.html`
- `web2/video-maker/js/video-maker.js`
- `web2/video-maker/js/video-stock.js`

## Last 5 commits touching `web2/`

- `896c1a855` fix(web2): ai-hub image-gen hang (timeouts) + hide stock brand names + connect video flow + auto-stock _(2026-06-24)_
- `448dd605b` feat(web2): MoneyPrinterTurbo auto-subtitles (karaoke) + one-click topic->video _(2026-06-24)_
- `13d201c35` feat(web2): MoneyPrinterTurbo stock footage (Pexels/Pixabay) in video-maker _(2026-06-23)_
- `153a6091a` refactor(web2): migrate products/variants/customer caches onto Web2SmartCache _(2026-06-23)_
- `fceb82e86` feat(web2): Web2SmartCache primitive (SWR+IDB+SSE+dedup) + adopt in suppliers-cache _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-005336-896c1a8` cho Claude walk chain theo CLAUDE.md protocol.
