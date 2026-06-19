# Latest Snapshot — `vieneu-tts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-222154-e3e76f6`
**Session file**: [`./20260619-222154-e3e76f6.md`](../20260619-222154-e3e76f6.md)
**Commit**: `e3e76f6` — fix(web2/fb-graph): tách post_video_views khỏi cụm metric (bài ảnh reject cả cụm) → retry không-video lấy reach per-post
**Last updated**: 2026-06-19 22:21:54 +07
**Summary**: fix(web2/fb-graph): tách post_video_views khỏi cụm metric (bài ảnh reject cả cụm) → retry không-video ...

## Files changed in this commit (`vieneu-tts/`)

- `vieneu-tts/.python-version`
- `vieneu-tts/README.md`
- `vieneu-tts/app.py`
- `vieneu-tts/requirements.txt`

## Last 5 commits touching `vieneu-tts/`

- `8e8656b6b` feat(vieneu-tts): service VieNeu-TTS (Web 2.0) — giọng Việt + clone giọng, FastAPI/ONNX CPU _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-222154-e3e76f6` cho Claude walk chain theo CLAUDE.md protocol.
