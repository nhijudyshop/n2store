# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-094213-79afb75`
**Session file**: [`./20260630-094213-79afb75.md`](../20260630-094213-79afb75.md)
**Commit**: `79afb75` — fix(soan-hang): tách toggle IN khỏi is_active → cột print_enabled (tag VẪN hiện khi tắt in)
**Last updated**: 2026-06-30 09:42:13 +07
**Summary**: fix(soan-hang): tách toggle IN khỏi is_active → cột print_enabled (tag VẪN hiện khi tắt in)

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-order-tags.js`
- `render.com/services/web2-order-tags-service.js`

## Last 5 commits touching `render.com/`

- `79afb759a` fix(soan-hang): tách toggle IN khỏi is*active → cột print_enabled (tag VẪN hiện khi tắt in) *(2026-06-30)\_
- `126821a10` fix(soan-hang): toggle = bật/tắt IN GIẤY (không khoá nút); bấm nút LUÔN gắn tag _(2026-06-30)_
- `904effde6` feat(order-tags): tag SOẠN HÀNG cho giỏ khi in phiếu soạn hàng + toggle admin bật/tắt in _(2026-06-30)_
- `c3121dbb6` fix(unit-scan): sort-manifest tag join — String() 2 phía (id BIGSERIAL=string vs order*id INTEGER=number) *(2026-06-30)\_
- `0d00e40a1` feat(unit-scan): modal đặt lên kệ hiện tag đơn (CHỜ HÀNG/PBH…) — tái dùng engine order-tags _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-094213-79afb75` cho Claude walk chain theo CLAUDE.md protocol.
