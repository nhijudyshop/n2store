# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-094554-f97ef68`
**Session file**: [`./20260521-094554-f97ef68.md`](../20260521-094554-f97ef68.md)
**Commit**: `f97ef68` — auto: session update
**Last updated**: 2026-05-21 09:45:54 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `5351b208` docs(web2-products): dev-log entry cho cascade snapshot realtime _(2026-05-21)_
- `a2978c64` docs(native-orders): dev-log entry cho migration 076+077 + screenshot verify _(2026-05-21)_
- `d1d798bb` fix(native-orders): backfill time prefix [HH:mm:ss D/M/YYYY] cho ghi chú đầu của đơn cũ _(2026-05-21)_
- `3d8c6384` feat(showroom): viewer order tuy chinh 1->0->2->3->4 (mo o anh 1, anh 0 xem qua next) _(2026-05-20)_
- `3ffd16bc` fix(showroom): viewer bat dau tu anh 0.jpg, total = tong anh (incl 0.jpg) _(2026-05-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-094554-f97ef68` cho Claude walk chain theo CLAUDE.md protocol.
