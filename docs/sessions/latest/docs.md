# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-084511-45b9702`
**Session file**: [`./20260629-084511-45b9702.md`](../20260629-084511-45b9702.md)
**Commit**: `45b9702` — fix(native-orders): PATCH fire reconcile khi đổi tên/SĐT KH → denorm sync triệt để
**Last updated**: 2026-06-29 08:45:11 +07
**Summary**: TTL phiên web2 theo role (admin 90d, user 14d) deploy live + verify 90d; widget AI 401 redirect chuẩn + notice login expired=1

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `45b9702a9` fix(native-orders): PATCH fire reconcile khi đổi tên/SĐT KH → denorm sync triệt để _(2026-06-29)_
- `afbf84a5f` chore(session): RESUME:20260629-083824-5ebfd63 _(2026-06-29)_
- `5ebfd6374` docs(dev-log): denorm-sync verified live (audit per-unit 1 vòng done) _(2026-06-29)_
- `816b11d9a` feat(web2/auth): TTL phiên theo role — admin 90 ngày, user 14 ngày _(2026-06-29)_
- `de304b6c2` fix(web2-product-units): reconcile sync denorm (STT/customer) cho unit đã gán _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-084511-45b9702` cho Claude walk chain theo CLAUDE.md protocol.
