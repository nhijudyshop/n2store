# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-165429-6a40c72`
**Session file**: [`./20260519-165429-6a40c72.md`](../20260519-165429-6a40c72.md)
**Commit**: `6a40c72` — perf(bill): pre-render barcode SVG ở parent → bill HTML thuần static, in instant
**Last updated**: 2026-05-19 16:54:29 +07
**Summary**: perf(bill): pre-render barcode SVG ở parent → bill HTML thuần static, in instant

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `2291e264` fix(orders/kpi-commission): confirm modal kiểm tra đơn hiển thị cho cả đơn chưa có phiếu bán hàng _(2026-05-19)_
- `c0992f3a` chore(session): RESUME:20260519-164413-36b72c3 _(2026-05-19)_
- `1f62e123` chore(session): RESUME:20260519-164031-665ec94 _(2026-05-19)_
- `cdc9f03d` chore(session): RESUME:20260519-154003-afade1d _(2026-05-19)_
- `cb9fdd3c` chore(session): RESUME:20260519-152906-5e460ac _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-165429-6a40c72` cho Claude walk chain theo CLAUDE.md protocol.
