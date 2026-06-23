# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-013538-afe1607`
**Session file**: [`./20260624-013538-afe1607.md`](../20260624-013538-afe1607.md)
**Commit**: `afe1607` — docs(web2): dev-log — full menu audit (50 pages load+interaction+CRUD), fixes recorded
**Last updated**: 2026-06-24 01:35:38 +07
**Summary**: docs(web2): dev-log — full menu audit (50 pages load+interaction+CRUD), fixes recorded

## Files changed in this commit (`web2/`)

- `web2/customers/js/customers-app.js`
- `web2/video-maker/js/video-vieneu.js`

## Last 5 commits touching `web2/`

- `f095747ae` fix(web2): video-maker stop auto-probing localhost TTS (8123/8124) → no ERR*CONNECTION_REFUSED console noise *(2026-06-24)\_
- `314e8fa2e` fix(web2): dead partner-customer link → customers deep-link (?phone=); clean smoke harness _(2026-06-24)_
- `896c1a855` fix(web2): ai-hub image-gen hang (timeouts) + hide stock brand names + connect video flow + auto-stock _(2026-06-24)_
- `448dd605b` feat(web2): MoneyPrinterTurbo auto-subtitles (karaoke) + one-click topic->video _(2026-06-24)_
- `13d201c35` feat(web2): MoneyPrinterTurbo stock footage (Pexels/Pixabay) in video-maker _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-013538-afe1607` cho Claude walk chain theo CLAUDE.md protocol.
