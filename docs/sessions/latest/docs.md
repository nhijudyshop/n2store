# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-144551-1015d5b`
**Session file**: [`./20260522-144551-1015d5b.md`](../20260522-144551-1015d5b.md)
**Commit**: `1015d5b` — feat(web2/products): NCC dropdown từ so_order_v2 + auto-regen mã khi đổi NCC/Tên/Biến thể
**Last updated**: 2026-05-22 14:45:51 +07
**Summary**: feat(web2/products): NCC dropdown từ so_order_v2 + auto-regen mã khi đổi NCC/Tên/Biến thể

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `1015d5bc4` feat(web2/products): NCC dropdown từ so*order_v2 + auto-regen mã khi đổi NCC/Tên/Biến thể *(2026-05-22)\_
- `90dadc4c3` fix(issue-tracking): ép timestamp hiển thị về UTC+7 (Asia/Ho*Chi_Minh) *(2026-05-22)\_
- `1ca408d66` chore(session): RESUME:20260522-143823-44f60e4 _(2026-05-22)_
- `44f60e4fb` fix(web2/products): bỏ customPrefix + prompt — mã auto-gen từ NCC, không phải 'gợi ý' _(2026-05-22)_
- `4a8797928` chore(session): RESUME:20260522-143349-0e1cb1f _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-144551-1015d5b` cho Claude walk chain theo CLAUDE.md protocol.
