# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-160901-dbcaf6a`
**Session file**: [`./20260701-160901-dbcaf6a.md`](../20260701-160901-dbcaf6a.md)
**Commit**: `dbcaf6a` — fix(web2-campaign): M2 — trim newCust SQL trên board khớp cart-detail popup
**Last updated**: 2026-07-01 16:09:01 +07
**Summary**: Overhaul chiến dịch: shipped H1/H2/M1/M2/M8/M9/L2/F1/M7 + #1 admin-lock + native-orders 1-picker + foundation; còn Web2CampaignManager/#3/#2 wire 9 trang/H4/M10

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-filters-campaigns.js`
- `native-orders/js/native-orders-realtime-init.js`
- `native-orders/js/native-orders-render.js`

## Last 5 commits touching `native-orders/`

- `f5884aebb` feat(native-orders): gom 2 dropdown chiến dịch → 1 Web2CampaignPicker + fix M8/M9 _(2026-07-01)_
- `c02606bcc` feat(native-orders bill): in KHUNG 'THU LẠI TỪ KHÁCH' cho shipper trên bill PBH _(2026-07-01)_
- `415e1eb3c` fix(web2 audit vòng4): fix tất cả — 4 HIGH security + medium/low (34 file) _(2026-06-30)_
- `cd1613916` fix(web2 audit vòng4): CRITICAL so-order mất data partial*received + nhãn confirm; doc 92-agent audit *(2026-06-30)\_
- `85f9fe063` refactor(web2 util): gộp money(11)→Web2Format.vnd + escape(76)→Web2Escape.escapeHtml (delegate-with-fallback); date đã-delegate, phone hoãn _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-160901-dbcaf6a` cho Claude walk chain theo CLAUDE.md protocol.
