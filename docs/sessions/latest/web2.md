# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-110637-159ebbc`
**Session file**: [`./20260630-110637-159ebbc.md`](../20260630-110637-159ebbc.md)
**Commit**: `159ebbc` — feat(system): thêm card 'Địa danh (vùng nguồn hàng)' vào tab services — CHO VƯỢT vs pre-order + công thức NCC/GIỎ/CÒN/VƯỢT
**Last updated**: 2026-06-30 11:06:37 +07
**Summary**: feat(system): thêm card 'Địa danh (vùng nguồn hàng)' vào tab services — CHO VƯỢT vs pre-order + công t...

## Files changed in this commit (`web2/`)

- `web2/live-control/css/live-control.css`
- `web2/live-control/index.html`
- `web2/live-control/js/live-control.js`
- `web2/live-tv/index.html`
- `web2/shared/web2-live-tv-display.js`
- `web2/system/index.html`

## Last 5 commits touching `web2/`

- `159ebbc74` feat(system): thêm card 'Địa danh (vùng nguồn hàng)' vào tab services — CHO VƯỢT vs pre-order + công thức NCC/GIỎ/CÒN/VƯỢT _(2026-06-30)_
- `0128f1a27` fix(live-control): sửa nhầm 'pre-order' — vùng CHỌN = CHO VƯỢT (hàng có sẵn), vùng KHÔNG chọn mới là pre-order _(2026-06-30)_
- `34f23fef2` fix(live-control): đổi nhãn dropdown 'MỚI theo' → 'Cho VƯỢT theo' (đúng chức năng pre-order, không lọc cột MỚI) _(2026-06-30)_
- `79afb759a` fix(soan-hang): tách toggle IN khỏi is*active → cột print_enabled (tag VẪN hiện khi tắt in) *(2026-06-30)\_
- `a45eb07b8` feat(unit-scan): modal chi tiết ghi rõ SP nào đang chờ hàng (pill ⏳ từ cho*hang.detail) *(2026-06-30)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-110637-159ebbc` cho Claude walk chain theo CLAUDE.md protocol.
