# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-093312-2fb6309`
**Session file**: [`./20260601-093312-2fb6309.md`](../20260601-093312-2fb6309.md)
**Commit**: `2fb6309` — auto: session update
**Last updated**: 2026-06-01 09:33:12 +07
**Summary**: auto: session update

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/index.html`
- `inventory-tracking/js/api-client.js`

## Last 5 commits touching `inventory-tracking/`

- `e3466d820` chore(inventory-tracking): bump api-client ?v sau khi gỡ map cột date _(2026-06-01)_
- `5d935420c` chore(inventory-tracking): xoá hẳn cột ngay*bat_dau/ngay_ket_thuc + code dư *(2026-06-01)\_
- `3c14c4c30` fix(inventory-tracking): bỏ chia theo ngày — tách đợt thuần dotSo (giữ de-dup CP) _(2026-05-31)_
- `32d295faf` fix(inventory-tracking): ẩn hẳn CK ngoài khoảng đợt trong modal (bỏ gạch ngang) _(2026-05-31)_
- `1652676f8` fix(inventory-tracking): khoảng ngày đợt = lọc duy nhất + sửa CP đếm trùng NCC (B & C) _(2026-05-31)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-093312-2fb6309` cho Claude walk chain theo CLAUDE.md protocol.
