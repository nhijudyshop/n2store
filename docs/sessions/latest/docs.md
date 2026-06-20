# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-194138-a9cfb54`
**Session file**: [`./20260620-194138-a9cfb54.md`](../20260620-194138-a9cfb54.md)
**Commit**: `a9cfb54` — auto: session update
**Last updated**: 2026-06-20 19:41:38 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `481b1364f` fix(vieneu-tts): PS1 cài giọng vỡ parse 'Unexpected token }' — bỏ em-dash trong string literal + thêm UTF-8 BOM _(2026-06-20)_
- `749709e58` chore(session): RESUME:20260620-192116-3e3021e _(2026-06-20)_
- `3e3021e45` feat(native-orders): Đơn Inbox 'Gán FB khác' — gán lại Facebook đúng nếu auto-dò nhầm _(2026-06-20)_
- `ecf89facc` chore(session): RESUME:20260620-191005-dea2c18 _(2026-06-20)_
- `dea2c1821` docs(dev-log): native-orders inbox admin delete + FB avatar trong ô tìm KH _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-194138-a9cfb54` cho Claude walk chain theo CLAUDE.md protocol.
