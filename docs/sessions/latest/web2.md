# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-091334-12856d3`
**Session file**: [`./20260522-091334-12856d3.md`](../20260522-091334-12856d3.md)
**Commit**: `12856d3` — feat(web2-balance-history): UI overlay theo phong cách Web 2.0
**Last updated**: 2026-05-22 09:13:34 +07
**Summary**: feat(web2-balance-history): UI overlay theo phong cách Web 2.0

## Files changed in this commit (`web2/`)

- `web2/balance-history/css/web2-theme.css`
- `web2/balance-history/index.html`

## Last 5 commits touching `web2/`

- `12856d39c` feat(web2-balance-history): UI overlay theo phong cách Web 2.0 _(2026-05-22)_
- `73f9f498f` feat: PBH history audit log + fix Ngày HĐ + bỏ nút huỷ PBH _(2026-05-21)_
- `74d0f75eb` feat: lịch sử chỉnh sửa SP + PBH STT sync với native STT _(2026-05-21)_
- `04b8c7599` perf(web2-products): in-place row update — hết giật + SP edit không nhảy lên đầu _(2026-05-21)_
- `65fd9d777` chore(cache-bust): bump asset version v=20260521b → v=20260521c _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-091334-12856d3` cho Claude walk chain theo CLAUDE.md protocol.
