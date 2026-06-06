# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-185212-4c06d93`
**Session file**: [`./20260606-185212-4c06d93.md`](../20260606-185212-4c06d93.md)
**Commit**: `4c06d93` — merge origin/main: barcode crisp fix + CK ví; KPI NET + edit-modal (dev-log both)
**Last updated**: 2026-06-06 18:52:12 +07
**Summary**: merge origin/main: barcode crisp fix + CK ví; KPI NET + edit-modal (dev-log both)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/orders-report/DOI-SOAT-KPI.md`

## Last 5 commits touching `docs/`

- `4c06d93ae` merge origin/main: barcode crisp fix + CK ví; KPI NET + edit-modal (dev-log both) _(2026-06-06)_
- `207dbc12c` fix(web2-products-print): barcode crisp dot-aligned (quét được mã dài) + giữ khổ 2 Tem 25mm mặc định _(2026-06-06)_
- `5346a521d` feat(web2): CK cộng ví → tự trừ vào PBH chưa trả của SĐT (đơn đã thanh toán) _(2026-06-06)_
- `b99877c8f` fix(orders/KPI): tính NET theo ĐƠN THẬT TPOS (final − BASE), hết lệch do audit log drift _(2026-06-06)_
- `0b80fbb44` fix(orders): modal Sua don hang mo len hien SP cu -> luon revalidate tu TPOS (SWR) + invalidate edit-cache khi mutate _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-185212-4c06d93` cho Claude walk chain theo CLAUDE.md protocol.
