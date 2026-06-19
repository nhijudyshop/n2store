# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-215147-28770db`
**Session file**: [`./20260619-215147-28770db.md`](../20260619-215147-28770db.md)
**Commit**: `28770db` — fix(web2/video-maker): hết lỗi tạo giọng Gather idx=132 — serialize inference TTS
**Last updated**: 2026-06-19 21:51:47 +07
**Summary**: fix(web2/video-maker): hết lỗi tạo giọng Gather idx=132 — serialize inference TTS

## Files changed in this commit (`web2/`)

- `web2/video-maker/index.html`

## Last 5 commits touching `web2/`

- `28770dbdf` fix(web2/video-maker): hết lỗi tạo giọng Gather idx=132 — serialize inference TTS _(2026-06-19)_
- `eb5b0935f` auto: session update _(2026-06-19)_
- `f1e733d18` feat(web2/fb-ads-stats): Nhập tay sổ quảng cáo (gắn bài + tiền QC + số đơn) → tổng hợp ngày/tuần/tháng + ad account qua BM _(2026-06-19)_
- `c352ee31b` auto: session update _(2026-06-19)_
- `37c9717cf` feat(web2/fb-ads-stats): lấy ad account qua Business Manager (owned/client) — không cần đăng nhập đúng người chạy QC _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-215147-28770db` cho Claude walk chain theo CLAUDE.md protocol.
