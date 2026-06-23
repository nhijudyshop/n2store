# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-165702-821b884`
**Session file**: [`./20260623-165702-821b884.md`](../20260623-165702-821b884.md)
**Commit**: `821b884` — auto: session update
**Last updated**: 2026-06-23 16:57:02 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/ai-hub/js/ai-chat.js`
- `web2/cham-cong/css/cham-cong.css`
- `web2/cham-cong/index.html`
- `web2/cham-cong/js/cham-cong-api.js`
- `web2/cham-cong/js/cham-cong-app.js`
- `web2/cham-cong/js/cham-cong-employees.js`
- `web2/cham-cong/js/cham-cong-payroll.js`
- `web2/zalo/css/web2-zalo.css`
- `web2/zalo/index.html`
- `web2/zalo/js/web2-zalo-accounts.js`

## Last 5 commits touching `web2/`

- `821b884c8` auto: session update _(2026-06-23)_
- `3ee7ce904` feat(web2-cham-cong): NV thủ công + ghi chú theo ngày + modal Chi tiết bảng lương _(2026-06-23)_
- `b3ae8c021` feat(web2-image): Web2ImagePaste.enhance() — mọi Choose File ảnh dán Ctrl+V + kéo-thả _(2026-06-23)_
- `d33d61f3f` auto: session update _(2026-06-23)_
- `11b139eb0` feat(web2-printer): 2 chức năng tự chọn sẵn máy mặc định theo tên (PBH Huyền+Hạnh+Còi+Hồng, tem 2 mã SP) _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-165702-821b884` cho Claude walk chain theo CLAUDE.md protocol.
