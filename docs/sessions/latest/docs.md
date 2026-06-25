# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-170704-a90cf11`
**Session file**: [`./20260625-170704-a90cf11.md`](../20260625-170704-a90cf11.md)
**Commit**: `a90cf11` — fix(web2): backfill region từ PREFIX MÃ (HN/HC) — note ILIKE chữ Việt không khớp Unicode
**Last updated**: 2026-06-25 17:07:04 +07
**Summary**: live-control TV NCC/Bán/Cọc/Còn + địa danh riêng (region) — fix backfill code-prefix, verify heal 5/5

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `5d6d71300` feat(web2/live-control,live-tv): ĐỊA DANH riêng + TV NCC/Bán/Cọc/Còn _(2026-06-25)_
- `ad187a9bd` chore(session): RESUME:20260625-163554-dfde626 _(2026-06-25)_
- `0ee9d2872` chore(session): RESUME:20260625-161605-234147e _(2026-06-25)_
- `9f86eab9f` chore(session): RESUME:20260625-160839-7a694d2 _(2026-06-25)_
- `7a694d23a` fix(web2/ai-hub): chat fallback non-stream khi stream lỗi + xoay key org-restricted; nút "✨ AI viết mô tả" cho Ghép đồ & HTML Studio _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-170704-a90cf11` cho Claude walk chain theo CLAUDE.md protocol.
