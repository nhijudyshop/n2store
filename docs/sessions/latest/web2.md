# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-111350-0b54f1b`
**Session file**: [`./20260701-111350-0b54f1b.md`](../20260701-111350-0b54f1b.md)
**Commit**: `0b54f1b` — fix(overview): CTA + module grid chỉ trỏ trang user có quyền (Web2Perm)
**Last updated**: 2026-07-01 11:13:50 +07
**Summary**: overview CTA/grid lọc theo Web2Perm (trang có quyền)

## Files changed in this commit (`web2/`)

- `web2/overview/index.html`
- `web2/overview/overview.js`

## Last 5 commits touching `web2/`

- `0b54f1bb5` fix(overview): CTA + module grid chỉ trỏ trang user có quyền (Web2Perm) _(2026-07-01)_
- `4c2ee36fa` feat(overview): thêm nút Đăng xuất trên trang giới thiệu Web 2.0 _(2026-07-01)_
- `07fbc1ef1` auto: session update _(2026-07-01)_
- `f6f27d100` feat(camera-bridge): sidecar KBVision/Dahua snapshot cho đối soát tay (Phase 2) _(2026-07-01)_
- `93f58e9d1` docs(web2): register Web2Drawer in codemap/system data + verify goods-weight drawer _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-111350-0b54f1b` cho Claude walk chain theo CLAUDE.md protocol.
