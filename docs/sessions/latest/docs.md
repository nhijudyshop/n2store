# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-110637-159ebbc`
**Session file**: [`./20260630-110637-159ebbc.md`](../20260630-110637-159ebbc.md)
**Commit**: `159ebbc` — feat(system): thêm card 'Địa danh (vùng nguồn hàng)' vào tab services — CHO VƯỢT vs pre-order + công thức NCC/GIỎ/CÒN/VƯỢT
**Last updated**: 2026-06-30 11:06:37 +07
**Summary**: feat(system): thêm card 'Địa danh (vùng nguồn hàng)' vào tab services — CHO VƯỢT vs pre-order + công t...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `159ebbc74` feat(system): thêm card 'Địa danh (vùng nguồn hàng)' vào tab services — CHO VƯỢT vs pre-order + công thức NCC/GIỎ/CÒN/VƯỢT _(2026-06-30)_
- `0128f1a27` fix(live-control): sửa nhầm 'pre-order' — vùng CHỌN = CHO VƯỢT (hàng có sẵn), vùng KHÔNG chọn mới là pre-order _(2026-06-30)_
- `f87af816c` chore(session): RESUME:20260630-104701-34f23fe _(2026-06-30)_
- `34f23fef2` fix(live-control): đổi nhãn dropdown 'MỚI theo' → 'Cho VƯỢT theo' (đúng chức năng pre-order, không lọc cột MỚI) _(2026-06-30)_
- `81ba9acc3` chore(session): RESUME:20260630-095017-d707c58 _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-110637-159ebbc` cho Claude walk chain theo CLAUDE.md protocol.
