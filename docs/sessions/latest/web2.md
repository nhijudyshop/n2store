# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-105608-07fbc1e`
**Session file**: [`./20260701-105608-07fbc1e.md`](../20260701-105608-07fbc1e.md)
**Commit**: `07fbc1e` — auto: session update
**Last updated**: 2026-07-01 10:56:08 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/goods-weight/css/goods-weight.css`
- `web2/goods-weight/index.html`
- `web2/goods-weight/js/goods-weight.js`

## Last 5 commits touching `web2/`

- `07fbc1ef1` auto: session update _(2026-07-01)_
- `f6f27d100` feat(camera-bridge): sidecar KBVision/Dahua snapshot cho đối soát tay (Phase 2) _(2026-07-01)_
- `93f58e9d1` docs(web2): register Web2Drawer in codemap/system data + verify goods-weight drawer _(2026-07-01)_
- `a67b70118` feat(so-order+live-control): hiện return*qty (thu về chờ duyệt) → tránh đặt dư NCC *(2026-07-01)\_
- `20ecb0b89` feat(web2 reconcile): camera bằng chứng đối soát tay + session model (đủ mới lưu) _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-105608-07fbc1e` cho Claude walk chain theo CLAUDE.md protocol.
