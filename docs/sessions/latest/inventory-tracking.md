# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260531-141234-83f9046`
**Session file**: [`./20260531-141234-83f9046.md`](../20260531-141234-83f9046.md)
**Commit**: `83f9046` — docs(plans): KPI plan v2 — campaign-scoped + beneficiary-based + STT visibility
**Last updated**: 2026-05-31 14:12:34 +07
**Summary**: docs(plans): KPI plan v2 — campaign-scoped + beneficiary-based + STT visibility

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/css/modern.css`
- `inventory-tracking/index.html`
- `inventory-tracking/js/data-loader.js`
- `inventory-tracking/js/filters.js`
- `inventory-tracking/js/table-renderer.js`

## Last 5 commits touching `inventory-tracking/`

- `3c14c4c30` fix(inventory-tracking): bỏ chia theo ngày — tách đợt thuần dotSo (giữ de-dup CP) _(2026-05-31)_
- `32d295faf` fix(inventory-tracking): ẩn hẳn CK ngoài khoảng đợt trong modal (bỏ gạch ngang) _(2026-05-31)_
- `1652676f8` fix(inventory-tracking): khoảng ngày đợt = lọc duy nhất + sửa CP đếm trùng NCC (B & C) _(2026-05-31)_
- `cb06f24ef` feat(inventory-tracking): khoảng ngày bắt đầu/kết thúc cho từng đợt — bound thanh toán CK theo ngày _(2026-05-31)_
- `0ac86941e` fix(inventory-tracking): chặn realtime self-reload phá tạo biến thể / sửa inline _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260531-141234-83f9046` cho Claude walk chain theo CLAUDE.md protocol.
