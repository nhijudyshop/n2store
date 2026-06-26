# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-105748-cc7cb0d`
**Session file**: [`./20260626-105748-cc7cb0d.md`](../20260626-105748-cc7cb0d.md)
**Commit**: `cc7cb0d` — auto: session update
**Last updated**: 2026-06-26 10:57:48 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/cham-cong/css/cham-cong.css`
- `web2/cham-cong/index.html`
- `web2/cham-cong/js/cham-cong-app.js`
- `web2/products/index.html`
- `web2/shared/web2-import.js`

## Last 5 commits touching `web2/`

- `cc7cb0d99` auto: session update _(2026-06-26)_
- `21ef9d2e3` fix(web2/cham-cong): hôm nay chưa tan ca = 'đang làm', không tính chấm thiếu/đối soát (đến work*end+grace mới tính) *(2026-06-26)\_
- `523991aa3` feat(web2/cham-cong): NV chưa gán user không cần chấm công (ẩn khỏi Bảng công/Hôm nay/đối soát, giữ Bảng lương) _(2026-06-26)_
- `6e056382e` auto: session update _(2026-06-26)_
- `131aa950b` refactor(web2/cham-cong): gỡ tham chiếu lay-du-lieu.bat — trỏ về 1 nguồn auto duy nhất (Cài máy chấm công DG-600 ở printer-settings) _(2026-06-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-105748-cc7cb0d` cho Claude walk chain theo CLAUDE.md protocol.
