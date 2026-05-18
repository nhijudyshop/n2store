# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-121431-c6e4d31`
**Session file**: [`./20260518-121431-c6e4d31.md`](../20260518-121431-c6e4d31.md)
**Commit**: `c6e4d31` — refactor(web2/supplier-debt): modal → inline row expand giống legacy
**Last updated**: 2026-05-18 12:14:31 +07
**Summary**: refactor(web2/supplier-debt): modal → inline row expand giống legacy

## Files changed in this commit (`web2/`)

- `web2/supplier-debt/css/styles.css`
- `web2/supplier-debt/index.html`
- `web2/supplier-debt/js/supplier-debt-app.js`

## Last 5 commits touching `web2/`

- `c6e4d316` refactor(web2/supplier-debt): modal → inline row expand giống legacy _(2026-05-18)_
- `d6e767b3` feat(web2/supplier-debt): tab "Công nợ" chronological + running balance _(2026-05-18)_
- `04d43e40` feat(web2/supplier-debt): Báo cáo công nợ NCC theo kỳ — clone UX legacy supplier-debt _(2026-05-18)_
- `6f055e41` fix(web2): broken paths sau khi move web2-products/web2-variants vào web2/ _(2026-05-18)_
- `a291f4d8` feat(web2-wallet): SePay deposit poll — ví KH match phone + ví NCC match content _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-121431-c6e4d31` cho Claude walk chain theo CLAUDE.md protocol.
