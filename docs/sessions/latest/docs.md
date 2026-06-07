# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-161507-190b7fa`
**Session file**: [`./20260607-161507-190b7fa.md`](../20260607-161507-190b7fa.md)
**Commit**: `190b7fa` — feat(web2): Phase 1 — gộp kho KH thành 1 warehouse web2_customers (bỏ TPOS) + CRUD route + SSE + dọn dead migrate
**Last updated**: 2026-06-07 16:15:07 +07
**Summary**: feat(web2): Phase 1 — gộp kho KH thành 1 warehouse web2_customers (bỏ TPOS) + CRUD route + SSE + dọn dead mi...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/plans/web2-customer-warehouse.md`

## Last 5 commits touching `docs/`

- `190b7fa91` feat(web2): Phase 1 — gộp kho KH thành 1 warehouse web2*customers (bỏ TPOS) + CRUD route + SSE + dọn dead migrate *(2026-06-07)\_
- `c57d5251f` chore(session): RESUME:20260607-160758-30b6184 _(2026-06-07)_
- `30b61846c` auto: session update _(2026-06-07)_
- `2709efaf0` chore(session): RESUME:20260607-160426-fbb5117 _(2026-06-07)_
- `b292fa673` docs(dev-log): dọn DB chết (drop 59 backup + orphan, 255→57MB) + re-seed delivery zones + handoff Phase 1 _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-161507-190b7fa` cho Claude walk chain theo CLAUDE.md protocol.
