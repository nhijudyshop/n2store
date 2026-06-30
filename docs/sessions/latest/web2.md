# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-061921-3868f6b`
**Session file**: [`./20260701-061921-3868f6b.md`](../20260701-061921-3868f6b.md)
**Commit**: `3868f6b` — auto: session update
**Last updated**: 2026-07-01 06:19:21 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/unit-scan/index.html`
- `web2/unit-scan/js/unit-scan.js`

## Last 5 commits touching `web2/`

- `3868f6b80` auto: session update _(2026-07-01)_
- `ec1dfb06b` fix(web2 system): siết services-overview gate requireWeb2Auth → requireWeb2Admin _(2026-06-30)_
- `de5ef0811` fix(web2 audit): wire x-web2-token cho customer-wallet by-phone/orders (gated route) _(2026-06-30)_
- `415e1eb3c` fix(web2 audit vòng4): fix tất cả — 4 HIGH security + medium/low (34 file) _(2026-06-30)_
- `bf09bab4f` fix(web2 util-money): ₫ 1-nguồn — load web2-format.js cho unit-scan (không sidebar) _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-061921-3868f6b` cho Claude walk chain theo CLAUDE.md protocol.
