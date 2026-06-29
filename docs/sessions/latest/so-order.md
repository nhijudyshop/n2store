# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-091958-b5afc14`
**Session file**: [`./20260629-091958-b5afc14.md`](../20260629-091958-b5afc14.md)
**Commit**: `b5afc14` — fix(web2/ai-assistant): lỗi provider chứa "token" bị nhầm là phiên hết hạn → đăng xuất oan
**Last updated**: 2026-06-29 09:19:58 +07
**Summary**: FIX GỐC widget AI: lỗi provider chứa chữ token bị nhầm phiên hết hạn → đăng xuất oan; verified browser click thật AI trả lời OK

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `b5afc142f` fix(web2/ai-assistant): lỗi provider chứa "token" bị nhầm là phiên hết hạn → đăng xuất oan _(2026-06-29)_
- `da9564b40` auto: session update _(2026-06-29)_
- `c466cb7d2` fix(so-order): 8 audit findings (#1 admin gate img + #3,#4,#5,#6,#7,#8) + soft-warn #2 _(2026-06-29)_
- `88ae3878e` fix(so-order): import "Đã nhận" → draft (tránh row kẹt) + dev-log Task 4 verified _(2026-06-28)_
- `7e6950dfe` fix(so-order): audit fixes — per-unit QR on main receive path + orphan dropdown on modal close _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-091958-b5afc14` cho Claude walk chain theo CLAUDE.md protocol.
