# Latest Snapshot — `vieneu-tts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-224652-046821a`
**Session file**: [`./20260619-224652-046821a.md`](../20260619-224652-046821a.md)
**Commit**: `046821a` — auto: session update
**Last updated**: 2026-06-19 22:46:52 +07
**Summary**: auto: session update

## Files changed in this commit (`vieneu-tts/`)

- `vieneu-tts/run_local.sh`

## Last 5 commits touching `vieneu-tts/`

- `046821aa0` auto: session update _(2026-06-19)_
- `94dfe5df4` feat(video-maker): tích hợp VieNeu-TTS clone giọng — server máy shop + tunnel + frontend Web2Vieneu _(2026-06-19)_
- `8e8656b6b` feat(vieneu-tts): service VieNeu-TTS (Web 2.0) — giọng Việt + clone giọng, FastAPI/ONNX CPU _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-224652-046821a` cho Claude walk chain theo CLAUDE.md protocol.
