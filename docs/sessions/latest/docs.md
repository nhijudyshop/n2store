# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-174322-61fba73`
**Session file**: [`./20260621-174322-61fba73.md`](../20260621-174322-61fba73.md)
**Commit**: `61fba73` — auto: session update
**Last updated**: 2026-06-21 17:43:22 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `a0236bba9` feat(web2): popup lý do tag hiện ẢNH sản phẩm (catalog image*url + fallback snapshot) *(2026-06-21)\_
- `23080242e` chore(session): RESUME:20260621-173150-81eb667 _(2026-06-21)_
- `da74a07c5` feat(web2): bấm pill TAG đơn → popup lý do chi tiết (SP chờ hàng / âm mã + ai đang giữ) _(2026-06-21)_
- `9e6da9673` chore(session): RESUME:20260621-170354-bc77504 _(2026-06-21)_
- `bc77504c8` docs(web2): sửa số trigger 22->21 trong dev-log (order tags) _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-174322-61fba73` cho Claude walk chain theo CLAUDE.md protocol.
