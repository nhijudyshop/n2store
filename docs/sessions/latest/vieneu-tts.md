# Latest Snapshot — `vieneu-tts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-160827-f7b4ef1`
**Session file**: [`./20260622-160827-f7b4ef1.md`](../20260622-160827-f7b4ef1.md)
**Commit**: `f7b4ef1` — auto: session update
**Last updated**: 2026-06-22 16:08:27 +07
**Summary**: auto: session update

## Files changed in this commit (`vieneu-tts/`)

- `vieneu-tts/engine_omnivoice.py`
- `vieneu-tts/requirements-omnivoice.txt`
- `vieneu-tts/vieneu-windows-setup.ps1`

## Last 5 commits touching `vieneu-tts/`

- `f7b4ef136` auto: session update _(2026-06-22)_
- `516671deb` auto: session update _(2026-06-22)_
- `481b1364f` fix(vieneu-tts): PS1 cài giọng vỡ parse 'Unexpected token }' — bỏ em-dash trong string literal + thêm UTF-8 BOM _(2026-06-20)_
- `5c4f6d941` feat(web2/pos-installer): bo cai .bat -> MENU bam so (Print Bridge / VieNeu / OmniVoice / cai het) + rule doc shared truoc khi code _(2026-06-20)_
- `1e4c4ab0b` feat(vieneu-tts): thêm engine OmniVoice (Apache-2.0) cạnh VieNeu qua TTS*ENGINE, giữ nguyên frontend *(2026-06-20)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-160827-f7b4ef1` cho Claude walk chain theo CLAUDE.md protocol.
