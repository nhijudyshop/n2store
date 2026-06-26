# Latest Snapshot — `issue-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-140813-d220ce9`
**Session file**: [`./20260626-140813-d220ce9.md`](../20260626-140813-d220ce9.md)
**Commit**: `d220ce9` — auto: session update
**Last updated**: 2026-06-26 14:08:13 +07
**Summary**: auto: session update

## Files changed in this commit (`issue-tracking/`)

- `issue-tracking/index.html`
- `issue-tracking/js/script.js`

## Last 5 commits touching `issue-tracking/`

- `83a6bfb12` feat(issue-tracking): nút Xóa CHỈ ADMIN + hard delete (soft bị DB constraint chặn) _(2026-06-26)_
- `7470460f6` feat(issue-tracking): nút Xóa phiếu (🗑️) cho phiếu đã hoàn tất/đã hủy/chờ đối soát _(2026-06-26)_
- `2704ef6f0` fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password _(2026-06-20)_
- `85771c3f7` fix(auth): SwitchCompany theo công ty đang chọn — NJD Live = Company 1 (kho live) _(2026-06-16)_
- `845fe3649` fix(web2): icon columns-3→columns (Lucide 0.294.0) + revert WS proxy về broker n2store-realtime _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-140813-d220ce9` cho Claude walk chain theo CLAUDE.md protocol.
