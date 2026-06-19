# Latest Snapshot — `vieneu-tts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-232723-f64ff57`
**Session file**: [`./20260619-232723-f64ff57.md`](../20260619-232723-f64ff57.md)
**Commit**: `f64ff57` — feat(printer-settings): bat cài máy POS gộp Print Bridge + Giọng VieNeu (auto-start nền, xoá auto cũ)
**Last updated**: 2026-06-19 23:27:23 +07
**Summary**: feat(printer-settings): bat cài máy POS gộp Print Bridge + Giọng VieNeu (auto-start nền, xoá auto cũ)

## Files changed in this commit (`vieneu-tts/`)

- `vieneu-tts/vieneu-windows-setup.ps1`

## Last 5 commits touching `vieneu-tts/`

- `f64ff57cc` feat(printer-settings): bat cài máy POS gộp Print Bridge + Giọng VieNeu (auto-start nền, xoá auto cũ) _(2026-06-19)_
- `38f6e8c03` auto: session update _(2026-06-19)_
- `ba7dd15dd` auto: session update _(2026-06-19)_
- `d70b709d6` feat(vieneu-tts): installer 1-click Win/Mac + serve.py + tự dò máy online (registry) _(2026-06-19)_
- `046821aa0` auto: session update _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-232723-f64ff57` cho Claude walk chain theo CLAUDE.md protocol.
