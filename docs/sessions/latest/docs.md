# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-184631-03107ca`
**Session file**: [`./20260625-184631-03107ca.md`](../20260625-184631-03107ca.md)
**Commit**: `03107ca` — fix(web2): SSE audit — KPI employee-ranges publish + assignments/returns PII/zalo debounce
**Last updated**: 2026-06-25 18:46:31 +07
**Summary**: Fix regression so-order \_rowToKhoMatch (xóa/sửa lô vỡ) + vá 16 gap audit SSE (6 MED/10 LOW)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `03107ca6f` fix(web2): SSE audit — KPI employee-ranges publish + assignments/returns PII/zalo debounce _(2026-06-25)_
- `016373032` chore(session): RESUME:20260625-182129-6a0e651 _(2026-06-25)_
- `6a0e651f0` fix(web2/balance-history): broadcast SSE khi cleanup-stale-pending + audit SSE toàn Web 2.0 _(2026-06-25)_
- `b05de8ac8` chore(session): RESUME:20260625-181147-9591e8c _(2026-06-25)_
- `9591e8c00` feat(web2/ai-hub): Ghép đồ — dán ảnh (Ctrl+V) + kéo-thả cho ô Ảnh người & Ảnh quần áo _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-184631-03107ca` cho Claude walk chain theo CLAUDE.md protocol.
