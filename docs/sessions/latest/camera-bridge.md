# Latest Snapshot — `camera-bridge/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-105154-f6f27d1`
**Session file**: [`./20260701-105154-f6f27d1.md`](../20260701-105154-f6f27d1.md)
**Commit**: `f6f27d1` — feat(camera-bridge): sidecar KBVision/Dahua snapshot cho đối soát tay (Phase 2)
**Last updated**: 2026-07-01 10:51:54 +07
**Summary**: reconcile: camera bằng chứng đối soát tay + session model (đủ mới lưu) + KBVision camera-bridge sidecar

## Files changed in this commit (`camera-bridge/`)

- `camera-bridge/README.md`
- `camera-bridge/camera-bridge.js`
- `camera-bridge/camera-tunnel.ps1`
- `camera-bridge/camera.config.example.json`
- `camera-bridge/run-camera-bridge.bat`

## Last 5 commits touching `camera-bridge/`

- `f6f27d100` feat(camera-bridge): sidecar KBVision/Dahua snapshot cho đối soát tay (Phase 2) _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-105154-f6f27d1` cho Claude walk chain theo CLAUDE.md protocol.
