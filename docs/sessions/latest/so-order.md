# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260612-183410-7bb139d`
**Session file**: [`./20260612-183410-7bb139d.md`](../20260612-183410-7bb139d.md)
**Commit**: `7bb139d` — auto: session update
**Last updated**: 2026-06-12 18:34:10 +07
**Summary**: auto: session update

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `7bb139d21` auto: session update _(2026-06-12)_
- `5e154518b` fix(web2): H15 so-order double-pending (upsert phần thiếu theo pending tươi + map kết quả theo vị trí) + gate admin delete-all web2-dedicated-entity _(2026-06-11)_
- `330bd95eb` auto: session update _(2026-06-10)_
- `e512f88df` refactor(web2): quét sạch chữ 'tpos' trong Web 2.0 (identifiers/UI/comments) _(2026-06-08)_
- `a1037d2a1` refactor(web2): rename design-system tpos-_ → web2-_ (classes + --vars), files + theme class _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260612-183410-7bb139d` cho Claude walk chain theo CLAUDE.md protocol.
