# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-032524-2fa39e8`
**Session file**: [`./20260623-032524-2fa39e8.md`](../20260623-032524-2fa39e8.md)
**Commit**: `2fa39e8` — fix(web2-money) round 3: purchase-refund 410 retired state-machine + SePay reassign idempotency
**Last updated**: 2026-06-23 03:25:24 +07
**Summary**: money audit 3 vòng: PBH 8 bug + ngoài-PBH 4 bug (double-refund/over-sell/reassign-mất-tiền/state-machine-410), defer #2 /tx amount

## Files changed in this commit (`render.com/`)

- `render.com/routes/purchase-refund.js`
- `render.com/routes/v2/web2-balance-history.js`

## Last 5 commits touching `render.com/`

- `2fa39e8d4` fix(web2-money) round 3: purchase-refund 410 retired state-machine + SePay reassign idempotency _(2026-06-23)_
- `3ad35df32` fix(web2-pbh) deep money-flow audit: 8 bug (double-refund/over-sell/orphan/double-count) _(2026-06-23)_
- `fde4e4673` fix(web2-pbh) audit bugs: reconcile return-failed hoàn ví + merged-PBH dedup _(2026-06-23)_
- `a7eef5b1e` fix(web2) customer-orders: ẩn Đơn Web đã convert sang PBH (hết trùng dòng + double-count) _(2026-06-23)_
- `4be494aaf` fix(web2): bỏ Reset STT + fix khe hở 8px thanh menu (32 trang) + gỡ chữ TPOS + chặn tạo PBH tay _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-032524-2fa39e8` cho Claude walk chain theo CLAUDE.md protocol.
