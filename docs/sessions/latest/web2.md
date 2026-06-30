# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-222130-de5ef08`
**Session file**: [`./20260630-222130-de5ef08.md`](../20260630-222130-de5ef08.md)
**Commit**: `de5ef08` — fix(web2 audit): wire x-web2-token cho customer-wallet by-phone/orders (gated route)
**Last updated**: 2026-06-30 22:21:30 +07
**Summary**: Sweep cuối: wire token customer-wallet gated route; xong fix tất cả vòng-4 (backend cần verify deploy Render)

## Files changed in this commit (`web2/`)

- `web2/customer-wallet/js/web2-customer-wallet-api.js`

## Last 5 commits touching `web2/`

- `de5ef0811` fix(web2 audit): wire x-web2-token cho customer-wallet by-phone/orders (gated route) _(2026-06-30)_
- `415e1eb3c` fix(web2 audit vòng4): fix tất cả — 4 HIGH security + medium/low (34 file) _(2026-06-30)_
- `bf09bab4f` fix(web2 util-money): ₫ 1-nguồn — load web2-format.js cho unit-scan (không sidebar) _(2026-06-30)_
- `b97a54dc1` feat(web2 zalo): tự chọn tài khoản chat khi chỉ có 1 tài khoản cá nhân _(2026-06-30)_
- `2da2cde5a` refactor(web2 dedup): re-verify audit 16-agent — fix esc 4→5char (3 leaf), util-money→partial, +print-unit group _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-222130-de5ef08` cho Claude walk chain theo CLAUDE.md protocol.
