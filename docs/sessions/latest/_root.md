# Latest Snapshot — `_root/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-100104-b968047`
**Session file**: [`./20260521-100104-b968047.md`](../20260521-100104-b968047.md)
**Commit**: `b968047` — docs(web2-products): dev-log entry cho migration 078 backfill + force-sync GIÀY ĐEN
**Last updated**: 2026-05-21 10:01:04 +07
**Summary**: docs(web2-products): dev-log entry cho migration 078 backfill + force-sync GIÀY ĐEN

## Files changed in this commit (`_root/`)

- `CLAUDE.md`

## Last 5 commits touching `_root/`

- `243383d0` fix(purchase-orders): paste image lớn không bị lỗi nữa + persistent session restore + debug-via-console rule _(2026-05-21)_
- `ae200b35` docs(web2): SSE realtime pattern guide + cập nhật CLAUDE.md/MEMORY rule bắt buộc _(2026-05-19)_
- `cc2c8ff4` refactor(web2): move web2-products + web2-variants into web2/ _(2026-05-18)_
- `7eb39f57` refactor(web2): move web2-shared to web2/shared (consolidate Web 2.0) _(2026-05-18)_
- `c049756e` feat(web2): filter cancelled PBH + pagination + stock tracking + SePay endpoint + WEB2.0 markers _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-100104-b968047` cho Claude walk chain theo CLAUDE.md protocol.
