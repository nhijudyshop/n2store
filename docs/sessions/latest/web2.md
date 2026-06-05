# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-163842-39025e6`
**Session file**: [`./20260605-163842-39025e6.md`](../20260605-163842-39025e6.md)
**Commit**: `39025e6` — feat(web2 pancake): server-side auto-refresh token — login service + creds encryption + cron
**Last updated**: 2026-06-05 16:38:42 +07
**Summary**: feat(web2 pancake): server-side auto-refresh token — login service + creds encryption + cron

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/printer-settings/index.html`
- `web2/shared/web2-bill-service.js`

## Last 5 commits touching `web2/`

- `163982c3f` feat(web2 bill): don kenh INBOX -> tieu de 'PBH INBOX' / 'PBH SHOP INBOX' (phan biet Livestream). Truyen channel tu native order -> bill isInbox _(2026-06-05)_
- `67c16589a` docs(dev-log): print count Phase 2 _(2026-06-05)_
- `001b22382` feat(web2 print-count Phase2): ghi so lan in - don (native*orders.print_count) khi in bill/soan hang + SP (web2_products.print_count) khi in tem -> badge 'Da in Nx' tranh in trung. Endpoints /mark-printed (native + products) *(2026-06-05)\_
- `70e32bb69` refactor(web2): unread logic authoritative thuần (bỏ mirror Web 1.0 + nút Đã đọc) _(2026-06-05)_
- `c4557d45a` feat(web2 overview): card dang nhap/danh tinh (web2/login + web2/users) - phan quyen + gan danh tinh nguoi thuc hien + lich su hanh dong; chua login bill ghi 'an danh' _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-163842-39025e6` cho Claude walk chain theo CLAUDE.md protocol.
