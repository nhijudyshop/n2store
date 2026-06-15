# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-155727-5e08afb`
**Session file**: [`./20260615-155727-5e08afb.md`](../20260615-155727-5e08afb.md)
**Commit**: `5e08afb` — feat(web2/jt-tracking): Quét lịch sử 14 ngày (days filter) + chẩn đoán độ sâu (more/oldestDate)
**Last updated**: 2026-06-15 15:57:27 +07
**Summary**: feat(web2/jt-tracking): Quét lịch sử 14 ngày (days filter) + chẩn đoán độ sâu (more/oldestDate)

## Files changed in this commit (`orders-report/`)

- `orders-report/js/lib/jsbarcode-code128.min.js`
- `orders-report/js/utils/bill-service.js`
- `orders-report/tab-pending-delete.html`
- `orders-report/tab1-orders.html`

## Last 5 commits touching `orders-report/`

- `c0038ee92` fix(bill): PBH lẻ in MẤT MÃ VẠCH — pre-render CODE128 data-URI (bỏ race ảnh ngoài) _(2026-06-15)_
- `0ea763dee` feat(orders-report): trừ ví "ghi nhớ đầu" + đối chiếu TPOS khi mất phản hồi (Lên đơn lẻ) _(2026-06-15)_
- `2cb6f2356` fix(orders-report/KPI): "Làm mới dữ liệu" fetch được đơn thật TPOS — load token-manager trong iframe KPI _(2026-06-14)_
- `8a1ad8016` fix(orders-report): bấm cột TIN NHẮN mở nhầm page — bỏ ghi đè preferred-page _(2026-06-14)_
- `768d518aa` feat(orders-report,render): match badge cột TIN NHẮN theo SĐT (fallback PSID) _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-155727-5e08afb` cho Claude walk chain theo CLAUDE.md protocol.
