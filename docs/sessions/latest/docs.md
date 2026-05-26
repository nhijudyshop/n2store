# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260526-112148-b1bb5bc`
**Session file**: [`./20260526-112148-b1bb5bc.md`](../20260526-112148-b1bb5bc.md)
**Commit**: `b1bb5bc` — auto: session update
**Last updated**: 2026-05-26 11:21:48 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `6c0c62531` feat(web2/customer-wallet): server-side aggregate endpoint cho 100k KH scale _(2026-05-26)_
- `113740318` chore(session): RESUME:20260526-111707-1fc24e0 _(2026-05-26)_
- `7e41801db` chore(session): RESUME:20260526-110520-49e6599 _(2026-05-26)_
- `0b0211ac5` chore(session): RESUME:20260526-110455-5b9a7eb _(2026-05-26)_
- `bac281d4c` feat(issue-tracking): nút Ẩn hiện cột — default ẩn Kênh (BÁN HÀNG) + Kênh & PBH gốc (TRẢ HÀNG) _(2026-05-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260526-112148-b1bb5bc` cho Claude walk chain theo CLAUDE.md protocol.
