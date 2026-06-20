# Latest Snapshot — `vieneu-tts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-194138-a9cfb54`
**Session file**: [`./20260620-194138-a9cfb54.md`](../20260620-194138-a9cfb54.md)
**Commit**: `a9cfb54` — auto: session update
**Last updated**: 2026-06-20 19:41:38 +07
**Summary**: auto: session update

## Files changed in this commit (`vieneu-tts/`)

- `vieneu-tts/vieneu-windows-setup.ps1`

## Last 5 commits touching `vieneu-tts/`

- `481b1364f` fix(vieneu-tts): PS1 cài giọng vỡ parse 'Unexpected token }' — bỏ em-dash trong string literal + thêm UTF-8 BOM _(2026-06-20)_
- `5c4f6d941` feat(web2/pos-installer): bo cai .bat -> MENU bam so (Print Bridge / VieNeu / OmniVoice / cai het) + rule doc shared truoc khi code _(2026-06-20)_
- `1e4c4ab0b` feat(vieneu-tts): thêm engine OmniVoice (Apache-2.0) cạnh VieNeu qua TTS*ENGINE, giữ nguyên frontend *(2026-06-20)\_
- `f64ff57cc` feat(printer-settings): bat cài máy POS gộp Print Bridge + Giọng VieNeu (auto-start nền, xoá auto cũ) _(2026-06-19)_
- `38f6e8c03` auto: session update _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-194138-a9cfb54` cho Claude walk chain theo CLAUDE.md protocol.
