# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-175140-2801011`
**Session file**: [`./20260609-175140-2801011.md`](../20260609-175140-2801011.md)
**Commit**: `2801011` — feat(web2): tem SP — biến thể bake vào giữa QR (Web2QR.centerLabel), đồng bộ bill
**Last updated**: 2026-06-09 17:51:40 +07
**Summary**: feat(web2): tem SP — biến thể bake vào giữa QR (Web2QR.centerLabel), đồng bộ bill

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `28010116d` feat(web2): tem SP — biến thể bake vào giữa QR (Web2QR.centerLabel), đồng bộ bill _(2026-06-09)_
- `ef23228b5` chore(session): RESUME:20260609-173720-602a658 _(2026-06-09)_
- `602a658e3` feat(web2-kpi): tách Dự báo(draft)/Thực(confirmed) theo status + KPI strip trên native-orders (scope admin/staff) _(2026-06-09)_
- `41eed7695` chore(session): RESUME:20260609-172641-288e691 _(2026-06-09)_
- `288e691f6` docs(dev-log): kết quả test KPI model base-delta (21/21 pass) + manual lock endpoint _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-175140-2801011` cho Claude walk chain theo CLAUDE.md protocol.
