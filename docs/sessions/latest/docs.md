# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-194843-0291022`
**Session file**: [`./20260603-194843-0291022.md`](../20260603-194843-0291022.md)
**Commit**: `0291022` — feat(web2): photo-studio v3 — thêm engine 'AI nét' (@imgly/background-removal) + 3 mode cached
**Last updated**: 2026-06-03 19:48:43 +07
**Summary**: feat(web2): photo-studio v3 — thêm engine 'AI nét' (@imgly/background-removal) + 3 mode cached

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `0291022a3` feat(web2): photo-studio v3 — thêm engine 'AI nét' (@imgly/background-removal) + 3 mode cached _(2026-06-03)_
- `ffeb3bbec` chore(session): RESUME:20260603-194751-1a4fb73 _(2026-06-03)_
- `2081cee4b` chore(session): RESUME:20260603-193815-fb2a1c6 _(2026-06-03)_
- `fb2a1c683` feat(web2): photo-studio v2 — fix loading overlay + tỉ lệ khung, spill, mờ nền, chụp full-res, PNG/JPG _(2026-06-03)_
- `0d69b76ea` feat(balance-history): bỏ cột Mã tham chiếu + nút ↗ + modal chi tiết KH (info/ví/đơn hàng, sửa→sync TPOS) _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-194843-0291022` cho Claude walk chain theo CLAUDE.md protocol.
