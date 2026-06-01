# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-184527-2422759`
**Session file**: [`./20260601-184527-2422759.md`](../20260601-184527-2422759.md)
**Commit**: `2422759` — fix(tpos-pancake): bump partnerCache maxSize 200→2000 — không hiện SĐT/địa chỉ KH do LRU evict
**Last updated**: 2026-06-01 18:45:27 +07
**Summary**: fix(tpos-pancake): bump partnerCache maxSize 200→2000 — không hiện SĐT/địa chỉ KH do LRU evict

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/css/modern.css`
- `inventory-tracking/index.html`

## Last 5 commits touching `inventory-tracking/`

- `bdf8f814e` style(inventory-tracking): financial row label + tiền ngoại tệ màu đen size x2, (VND) xám nhạt giữ size _(2026-06-01)_
- `e3466d820` chore(inventory-tracking): bump api-client ?v sau khi gỡ map cột date _(2026-06-01)_
- `5d935420c` chore(inventory-tracking): xoá hẳn cột ngay*bat_dau/ngay_ket_thuc + code dư *(2026-06-01)\_
- `3c14c4c30` fix(inventory-tracking): bỏ chia theo ngày — tách đợt thuần dotSo (giữ de-dup CP) _(2026-05-31)_
- `32d295faf` fix(inventory-tracking): ẩn hẳn CK ngoài khoảng đợt trong modal (bỏ gạch ngang) _(2026-05-31)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-184527-2422759` cho Claude walk chain theo CLAUDE.md protocol.
