# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-091440-65c9694`
**Session file**: [`./20260626-091440-65c9694.md`](../20260626-091440-65c9694.md)
**Commit**: `65c9694` — feat(web2/cham-cong): hàng đợi đối soát chấm thiếu + a11y (glyph chấm/aria/Esc) + perf (event delegation) + name truncate
**Last updated**: 2026-06-26 09:14:40 +07
**Summary**: feat(web2/cham-cong): hàng đợi đối soát chấm thiếu + a11y (glyph chấm/aria/Esc) + perf (event delegatio...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `65c969445` feat(web2/cham-cong): hàng đợi đối soát chấm thiếu + a11y (glyph chấm/aria/Esc) + perf (event delegation) + name truncate _(2026-06-26)_
- `8c93064f0` fix(web2/cham-cong BE): secret ingest fail-closed + web2-users/list bỏ PII non-admin + validate snapshot chốt lương _(2026-06-26)_
- `ccb3bd40a` fix(web2/cham-cong): grace smooth (bỏ cliff) + lương tháng không auto phạt muộn + dup-PIN không cộng đôi tổng _(2026-06-26)_
- `a0ec6587d` fix(web2/cham-cong): OT override không inflate lương tháng (CRITICAL overpay ~26×) + hệ số OT=0 không bị ép 1× _(2026-06-26)_
- `2c0126da3` chore(session): RESUME:20260626-083217-c5d43f1 _(2026-06-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-091440-65c9694` cho Claude walk chain theo CLAUDE.md protocol.
