# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-211013-e035b86`
**Session file**: [`./20260628-211013-e035b86.md`](../20260628-211013-e035b86.md)
**Commit**: `e035b86` — docs(agent-tooling): stitch-skills + agent-reach integration (agent tooling only)
**Last updated**: 2026-06-28 21:10:13 +07
**Summary**: docs(agent-tooling): stitch-skills + agent-reach integration (agent tooling only)

## Files changed in this commit (`web2/`)

- `web2/unit-scan/css/unit-scan.css`
- `web2/unit-scan/index.html`
- `web2/unit-scan/js/unit-scan.js`

## Last 5 commits touching `web2/`

- `f50644a60` feat(permissions+scan): đăng ký phân quyền unit-scan + clearance; fix camera đen trên PWA _(2026-06-28)_
- `81ef7612a` fix(web2-vn-address): gate ghi city/ward theo isReady() — chặn data-loss cửa sổ đang-tải _(2026-06-28)_
- `ac6e7b042` auto: session update _(2026-06-28)_
- `e2952425a` feat(web2-vn-address): bộ chọn Tỉnh/TP → Phường/Xã dùng chung (vietnamese-provinces-database, MIT) _(2026-06-28)_
- `b3b021bbb` feat(sidebar): thêm 'Quét tem đóng gói' (web2/unit-scan) vào nhóm Bán Hàng _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-211013-e035b86` cho Claude walk chain theo CLAUDE.md protocol.
