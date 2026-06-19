# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-230524-91f12f3`
**Session file**: [`./20260619-230524-91f12f3.md`](../20260619-230524-91f12f3.md)
**Commit**: `91f12f3` — docs(web2): dev-log + codemap cho multi-SP picker shared + page order
**Last updated**: 2026-06-19 23:05:24 +07
**Summary**: Chọn nhiều SP từ Kho cho AI (shared Web2ProductPicker) + caption tổng hợp + thứ tự page Store→House→Ơi→Nè

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/WEB2-CODEMAP.md`
- `docs/web2/web2-codemap.json`

## Last 5 commits touching `docs/`

- `91f12f310` docs(web2): dev-log + codemap cho multi-SP picker shared + page order _(2026-06-19)_
- `b735585aa` chore(session): RESUME:20260619-225749-2c73f6a _(2026-06-19)_
- `6a4aa6493` chore(session): RESUME:20260619-225213-d70b709 _(2026-06-19)_
- `d70b709d6` feat(vieneu-tts): installer 1-click Win/Mac + serve.py + tự dò máy online (registry) _(2026-06-19)_
- `f04d71d1a` chore(session): RESUME:20260619-224652-046821a _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-230524-91f12f3` cho Claude walk chain theo CLAUDE.md protocol.
