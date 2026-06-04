# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-094947-a3e1452`
**Session file**: [`./20260604-094947-a3e1452.md`](../20260604-094947-a3e1452.md)
**Commit**: `a3e1452` — auto: session update
**Last updated**: 2026-06-04 09:49:47 +07
**Summary**: auto: session update

## Files changed in this commit (`render.com/`)

- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `cd029da6d` fix(web2): generic /api/web2 route shadow dedicated → data 3 trang load lại _(2026-06-04)_
- `8c6859bf9` feat(web2): đổi tên kho KH đơn hàng customers → web2*order_customers (web2Db) *(2026-06-03)\_
- `8cdc6c407` auto: session update _(2026-06-03)_
- `d6ee4135f` fix(web2): backtick trong SQL comment làm vỡ template literal → server require throw. Đổi sang dấu nháy kép _(2026-06-03)_
- `120b773d3` feat(web2): web2*customers thêm fb_id + helpers (getOrCreateWeb2Customer/findByFbId/linkFbId) — nền tảng gộp kho KH (native-orders chưa migrate vì schema phức tạp) *(2026-06-03)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-094947-a3e1452` cho Claude walk chain theo CLAUDE.md protocol.
