# Latest Snapshot — `vieneu-tts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-225213-d70b709`
**Session file**: [`./20260619-225213-d70b709.md`](../20260619-225213-d70b709.md)
**Commit**: `d70b709` — feat(vieneu-tts): installer 1-click Win/Mac + serve.py + tự dò máy online (registry)
**Last updated**: 2026-06-19 22:52:13 +07
**Summary**: feat(vieneu-tts): installer 1-click Win/Mac + serve.py + tự dò máy online (registry)

## Files changed in this commit (`vieneu-tts/`)

- `vieneu-tts/.gitignore`
- `vieneu-tts/install-windows.bat`
- `vieneu-tts/run-mac.command`
- `vieneu-tts/serve.py`

## Last 5 commits touching `vieneu-tts/`

- `d70b709d6` feat(vieneu-tts): installer 1-click Win/Mac + serve.py + tự dò máy online (registry) _(2026-06-19)_
- `046821aa0` auto: session update _(2026-06-19)_
- `94dfe5df4` feat(video-maker): tích hợp VieNeu-TTS clone giọng — server máy shop + tunnel + frontend Web2Vieneu _(2026-06-19)_
- `8e8656b6b` feat(vieneu-tts): service VieNeu-TTS (Web 2.0) — giọng Việt + clone giọng, FastAPI/ONNX CPU _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-225213-d70b709` cho Claude walk chain theo CLAUDE.md protocol.
