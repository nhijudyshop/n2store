# Latest Snapshot — `customer-hub/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-151348-d59cf73`
**Session file**: [`./20260605-151348-d59cf73.md`](../20260605-151348-d59cf73.md)
**Commit**: `d59cf73` — fix(cloudflare CORS): allow header X-Web2-Token - sau khi dang nhap Web2.0 client gui x-web2-token bi CORS preflight chan -> moi API web2 fail. Them 1 header, khong dung logic trang khac
**Last updated**: 2026-06-05 15:13:48 +07
**Summary**: fix(cloudflare CORS): allow header X-Web2-Token - sau khi dang nhap Web2.0 client gui x-web2-token bi CORS preflight ...

## Files changed in this commit (`customer-hub/`)

- `customer-hub/js/modules/wallet-panel.js`

## Last 5 commits touching `customer-hub/`

- `6aeb0a0a1` feat(customer-hub): an nut 'Cap cong no ao' o vi khach - chi giu Nap/Rut tien _(2026-06-05)_
- `397da92e5` feat(virtual-credit): hạn cấp công nợ ảo 15 → 30 ngày (chỉ phiếu mới) + finalize refund per-line discount _(2026-06-01)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `0ce7d7629` fix(customer-hub): tab TPOS PBH hiển thị bill thực sự thay vì summary card _(2026-05-16)_
- `effb19967` fix(wallet): rút gọn note thanh toán + ghi đúng user nạp ví _(2026-05-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-151348-d59cf73` cho Claude walk chain theo CLAUDE.md protocol.
