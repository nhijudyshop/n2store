# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-095017-d707c58`
**Session file**: [`./20260630-095017-d707c58.md`](../20260630-095017-d707c58.md)
**Commit**: `d707c58` — docs(soan-hang): desc thẻ rõ 🖨 = in giấy, tách is_active (ẩn/hiện tag); E2E verified ✅
**Last updated**: 2026-06-30 09:50:17 +07
**Summary**: docs(soan-hang): desc thẻ rõ 🖨 = in giấy, tách is_active (ẩn/hiện tag); E2E verified ✅

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `d707c5858` docs(soan-hang): desc thẻ rõ 🖨 = in giấy, tách is*active (ẩn/hiện tag); E2E verified ✅ *(2026-06-30)\_
- `01bdd5cd5` chore(session): RESUME:20260630-094213-79afb75 _(2026-06-30)_
- `79afb759a` fix(soan-hang): tách toggle IN khỏi is*active → cột print_enabled (tag VẪN hiện khi tắt in) *(2026-06-30)\_
- `f85994c26` chore(session): RESUME:20260630-092840-126821a _(2026-06-30)_
- `126821a10` fix(soan-hang): toggle = bật/tắt IN GIẤY (không khoá nút); bấm nút LUÔN gắn tag _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-095017-d707c58` cho Claude walk chain theo CLAUDE.md protocol.
