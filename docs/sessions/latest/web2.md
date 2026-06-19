# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-140731-46d037b`
**Session file**: [`./20260619-140731-46d037b.md`](../20260619-140731-46d037b.md)
**Commit**: `46d037b` — perf(web2/photo-editor): preload model nhận diện mặt ở nền khi tải ảnh → bấm công cụ làm đẹp mặt nhanh ~1s (thay vì ~3.5s cold)
**Last updated**: 2026-06-19 14:07:31 +07
**Summary**: perf(web2/photo-editor): preload model nhận diện mặt ở nền khi tải ảnh → bấm công cụ làm đẹp...

## Files changed in this commit (`web2/`)

- `web2/photo-editor/index.html`
- `web2/photo-editor/js/photo-editor.js`
- `web2/video-maker/index.html`
- `web2/video-maker/js/video-audio.js`
- `web2/video-maker/js/video-maker.js`
- `web2/video-maker/js/video-scene-editor.js`
- `web2/video-maker/video-maker.css`

## Last 5 commits touching `web2/`

- `46d037b38` perf(web2/photo-editor): preload model nhận diện mặt ở nền khi tải ảnh → bấm công cụ làm đẹp mặt nhanh ~1s (thay vì ~3.5s cold) _(2026-06-19)_
- `1198d48ee` feat(web2/video-maker): chỉnh chi tiết từng cảnh (chuyển động/hiệu ứng/lọc/vị trí chữ/khung) + nhạc nền (chèn/ghép/âm lượng) + tách nhạc karaoke + trích audio .wav _(2026-06-19)_
- `90e1604c8` auto: session update _(2026-06-19)_
- `d49b4508f` fix(web2/jt-tracking): backfill src*at từ tin Zalo cho row cũ → sort theo giờ tin nhắn nhận chạy được ngay *(2026-06-19)\_
- `221665adb` fix(web2/jt-tracking + zalo-chat): sort theo giờ Zalo (src*at) + bỏ Chuyển tiếp + fix react z-index + reply quote thật *(2026-06-19)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-140731-46d037b` cho Claude walk chain theo CLAUDE.md protocol.
