# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-163842-39025e6`
**Session file**: [`./20260605-163842-39025e6.md`](../20260605-163842-39025e6.md)
**Commit**: `39025e6` — feat(web2 pancake): server-side auto-refresh token — login service + creds encryption + cron
**Last updated**: 2026-06-05 16:38:42 +07
**Summary**: feat(web2 pancake): server-side auto-refresh token — login service + creds encryption + cron

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `163982c3f` feat(web2 bill): don kenh INBOX -> tieu de 'PBH INBOX' / 'PBH SHOP INBOX' (phan biet Livestream). Truyen channel tu native order -> bill isInbox _(2026-06-05)_
- `f3109d660` auto: session update _(2026-06-05)_
- `551ddbf82` fix(web2): detect 'KH báo đã CK' cả trên update*conversation (fix bỏ sót) *(2026-06-05)\_
- `001b22382` feat(web2 print-count Phase2): ghi so lan in - don (native*orders.print_count) khi in bill/soan hang + SP (web2_products.print_count) khi in tem -> badge 'Da in Nx' tranh in trung. Endpoints /mark-printed (native + products) *(2026-06-05)\_
- `474fba13f` fix(native-orders): In bill don MIX trang thai -> moi don in dung loai: draft=Phieu Soan Hang (tuan tu), confirmed=bill PBH (gop). onClose chain mo soan hang tung don roi in PBH _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-163842-39025e6` cho Claude walk chain theo CLAUDE.md protocol.
