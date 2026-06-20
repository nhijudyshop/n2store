# Latest Snapshot — `vieneu-tts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-080135-1e4c4ab`
**Session file**: [`./20260620-080135-1e4c4ab.md`](../20260620-080135-1e4c4ab.md)
**Commit**: `1e4c4ab` — feat(vieneu-tts): thêm engine OmniVoice (Apache-2.0) cạnh VieNeu qua TTS_ENGINE, giữ nguyên frontend
**Last updated**: 2026-06-20 08:01:35 +07
**Summary**: feat(vieneu-tts): thêm engine OmniVoice (Apache-2.0) cạnh VieNeu qua TTS_ENGINE, giữ nguyên frontend

## Files changed in this commit (`vieneu-tts/`)

- `vieneu-tts/.gitignore`
- `vieneu-tts/README.md`
- `vieneu-tts/app.py`
- `vieneu-tts/engine_base.py`
- `vieneu-tts/engine_omnivoice.py`
- `vieneu-tts/engine_vieneu.py`
- `vieneu-tts/requirements-omnivoice.txt`
- `vieneu-tts/run-omnivoice-mac.command`
- `vieneu-tts/serve.py`

## Last 5 commits touching `vieneu-tts/`

- `1e4c4ab0b` feat(vieneu-tts): thêm engine OmniVoice (Apache-2.0) cạnh VieNeu qua TTS*ENGINE, giữ nguyên frontend *(2026-06-20)\_
- `f64ff57cc` feat(printer-settings): bat cài máy POS gộp Print Bridge + Giọng VieNeu (auto-start nền, xoá auto cũ) _(2026-06-19)_
- `38f6e8c03` auto: session update _(2026-06-19)_
- `ba7dd15dd` auto: session update _(2026-06-19)_
- `d70b709d6` feat(vieneu-tts): installer 1-click Win/Mac + serve.py + tự dò máy online (registry) _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-080135-1e4c4ab` cho Claude walk chain theo CLAUDE.md protocol.
