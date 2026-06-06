# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-190242-5cd867b`
**Session file**: [`./20260606-190242-5cd867b.md`](../20260606-190242-5cd867b.md)
**Commit**: `5cd867b` — feat(web2): click pill Ví → lịch sử thanh toán KH (mọi nơi có tên/SĐT)
**Last updated**: 2026-06-06 19:02:42 +07
**Summary**: feat(web2): click pill Ví → lịch sử thanh toán KH (mọi nơi có tên/SĐT)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `5cd867bf4` feat(web2): click pill Ví → lịch sử thanh toán KH (mọi nơi có tên/SĐT) _(2026-06-06)_
- `cc8776be7` chore(session): RESUME:20260606-185212-4c06d93 _(2026-06-06)_
- `4c06d93ae` merge origin/main: barcode crisp fix + CK ví; KPI NET + edit-modal (dev-log both) _(2026-06-06)_
- `207dbc12c` fix(web2-products-print): barcode crisp dot-aligned (quét được mã dài) + giữ khổ 2 Tem 25mm mặc định _(2026-06-06)_
- `5346a521d` feat(web2): CK cộng ví → tự trừ vào PBH chưa trả của SĐT (đơn đã thanh toán) _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-190242-5cd867b` cho Claude walk chain theo CLAUDE.md protocol.
