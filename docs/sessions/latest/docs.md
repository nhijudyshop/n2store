# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-182129-6a0e651`
**Session file**: [`./20260625-182129-6a0e651.md`](../20260625-182129-6a0e651.md)
**Commit**: `6a0e651` — fix(web2/balance-history): broadcast SSE khi cleanup-stale-pending + audit SSE toàn Web 2.0
**Last updated**: 2026-06-25 18:21:29 +07
**Summary**: audit SSE toàn Web 2.0: kiến trúc lành mạnh; web2-products là bug duy nhất (đã fix); +broadcast cleanup-stale-pending

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `6a0e651f0` fix(web2/balance-history): broadcast SSE khi cleanup-stale-pending + audit SSE toàn Web 2.0 _(2026-06-25)_
- `b05de8ac8` chore(session): RESUME:20260625-181147-9591e8c _(2026-06-25)_
- `9591e8c00` feat(web2/ai-hub): Ghép đồ — dán ảnh (Ctrl+V) + kéo-thả cho ô Ảnh người & Ảnh quần áo _(2026-06-25)_
- `076735fea` chore(session): RESUME:20260625-173630-9d637c7 _(2026-06-25)_
- `9d637c720` docs(dev-log): so-order browser-test — fix SSE realtime + địa danh derive (verified) _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-182129-6a0e651` cho Claude walk chain theo CLAUDE.md protocol.
