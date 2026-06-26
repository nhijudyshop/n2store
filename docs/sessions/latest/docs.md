# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-162328-66f79ae`
**Session file**: [`./20260626-162328-66f79ae.md`](../20260626-162328-66f79ae.md)
**Commit**: `66f79ae` — docs: flow audit 12/12 FIXED + dev-log (money/stock fixes verified integration test)
**Last updated**: 2026-06-26 16:23:28 +07
**Summary**: Fix toàn bộ 12 bug audit luồng web2: report merge/refunds KPI, nhận hàng NCC, KNH/native restock, ví NCC cap qty/cost/returned_row_ids — verify integration test Postgres thật (24 assertions)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/FLOW-AUDIT-2026-06-26.md`

## Last 5 commits touching `docs/`

- `66f79ae95` docs: flow audit 12/12 FIXED + dev-log (money/stock fixes verified integration test) _(2026-06-26)_
- `66e5026a2` chore(session): RESUME:20260626-153500-f17cf53 _(2026-06-26)_
- `f17cf5397` docs(dev-log): system UI + flow audit + 5 fixes (2026-06-26) _(2026-06-26)_
- `52f5e4b5a` fix(web2 flow): nhận hàng đúng NCC (#1/#8) + hủy PBH restock per-code (#9) + audit doc _(2026-06-26)_
- `ecb116569` chore(session): RESUME:20260626-150059-b91dee9 _(2026-06-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-162328-66f79ae` cho Claude walk chain theo CLAUDE.md protocol.
