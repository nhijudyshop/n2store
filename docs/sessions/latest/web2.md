# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-202800-97ee76a`
**Session file**: [`./20260604-202800-97ee76a.md`](../20260604-202800-97ee76a.md)
**Commit**: `97ee76a` — auto: session update
**Last updated**: 2026-06-04 20:28:00 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/overview/index.html`
- `web2/pancake-settings/index.html`
- `web2/printer-settings/index.html`
- `web2/shared/web2-chat-client.js`
- `web2/shared/web2-printer.js`

## Last 5 commits touching `web2/`

- `97ee76acb` auto: session update _(2026-06-04)_
- `d65400306` feat(web2): tu dong lam giau kho KH (fb*id) khi bat chat Pancake moi noi *(2026-06-04)\_
- `abe886f0c` fix(web2-chat-readonly): strip HTML tag trong message Pancake (msgPlain) -> text sach _(2026-06-04)_
- `8b078c107` auto: session update _(2026-06-04)_
- `e1c402b9c` feat(printer-settings): nut tai .bat cai Print Bridge 1-click (chay nen + tu bat khi mo may, dung PowerShell khong can Node) _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-202800-97ee76a` cho Claude walk chain theo CLAUDE.md protocol.
