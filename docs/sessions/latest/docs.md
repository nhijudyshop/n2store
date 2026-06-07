# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-164345-d8b59e4`
**Session file**: [`./20260607-164345-d8b59e4.md`](../20260607-164345-d8b59e4.md)
**Commit**: `d8b59e4` — feat(web2/bill): PBH đổi Code128 → QR Code
**Last updated**: 2026-06-07 16:43:45 +07
**Summary**: feat(web2/bill): PBH đổi Code128 → QR Code

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `d8b59e44e` feat(web2/bill): PBH đổi Code128 → QR Code _(2026-06-07)_
- `aa78a98a9` chore(session): RESUME:20260607-163837-65df914 _(2026-06-07)_
- `65df914dd` feat(web2): Phase 3 — trang Kho Khách Hàng web2/customers (warehouse UI, KHÔNG TPOS) _(2026-06-07)_
- `22c10ba04` chore(session): RESUME:20260607-161507-190b7fa _(2026-06-07)_
- `190b7fa91` feat(web2): Phase 1 — gộp kho KH thành 1 warehouse web2*customers (bỏ TPOS) + CRUD route + SSE + dọn dead migrate *(2026-06-07)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-164345-d8b59e4` cho Claude walk chain theo CLAUDE.md protocol.
