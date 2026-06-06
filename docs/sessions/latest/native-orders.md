# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-133354-484f64b`
**Session file**: [`./20260606-133354-484f64b.md`](../20260606-133354-484f64b.md)
**Commit**: `484f64b` — feat(web2/native-orders): badge 'KH báo đã CK' cập nhật LIVE qua SSE
**Last updated**: 2026-06-06 13:33:54 +07
**Summary**: feat(web2/native-orders): badge 'KH báo đã CK' cập nhật LIVE qua SSE

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `484f64bd1` feat(web2/native-orders): badge 'KH báo đã CK' cập nhật LIVE qua SSE _(2026-06-06)_
- `0a0637eb1` fix(native-orders): bill In bill tinh PHI SHIP (truoc hardcode 0) - tra gia theo delivery method (DeliveryMethodPicker) -> Phi ship + cong vao TONG TIEN + COD. PBH SHOP=0 _(2026-06-05)_
- `c70542eee` auto: session update _(2026-06-05)_
- `c4f2fe91d` chore(web2): bump cache-bust version (inbox) - ep browser tai lai JS co channel/PBH INBOX _(2026-06-05)_
- `163982c3f` feat(web2 bill): don kenh INBOX -> tieu de 'PBH INBOX' / 'PBH SHOP INBOX' (phan biet Livestream). Truyen channel tu native order -> bill isInbox _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-133354-484f64b` cho Claude walk chain theo CLAUDE.md protocol.
