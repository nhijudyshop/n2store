# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-080135-1e4c4ab`
**Session file**: [`./20260620-080135-1e4c4ab.md`](../20260620-080135-1e4c4ab.md)
**Commit**: `1e4c4ab` — feat(vieneu-tts): thêm engine OmniVoice (Apache-2.0) cạnh VieNeu qua TTS_ENGINE, giữ nguyên frontend
**Last updated**: 2026-06-20 08:01:35 +07
**Summary**: feat(vieneu-tts): thêm engine OmniVoice (Apache-2.0) cạnh VieNeu qua TTS_ENGINE, giữ nguyên frontend

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `1e4c4ab0b` feat(vieneu-tts): thêm engine OmniVoice (Apache-2.0) cạnh VieNeu qua TTS*ENGINE, giữ nguyên frontend *(2026-06-20)\_
- `087477ef9` chore(session): RESUME:20260620-070025-54f30a1 _(2026-06-20)_
- `f5b6f71e5` chore(session): RESUME:20260620-063953-04af663 _(2026-06-20)_
- `04af663e2` feat(web2/picker): xem SP dang DANH SACH (anh + ten + ma + gia) thay vi luoi anh _(2026-06-20)_
- `b00d2c67a` chore(session): RESUME:20260620-010941-09ed855 _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-080135-1e4c4ab` cho Claude walk chain theo CLAUDE.md protocol.
