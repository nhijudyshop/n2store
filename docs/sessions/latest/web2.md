# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-234101-0ca48ac`
**Session file**: [`./20260619-234101-0ca48ac.md`](../20260619-234101-0ca48ac.md)
**Commit**: `0ca48ac` — docs(dev-log): shared Web2PosInstaller
**Last updated**: 2026-06-19 23:41:01 +07
**Summary**: docs(dev-log): shared Web2PosInstaller

## Files changed in this commit (`web2/`)

- `web2/printer-settings/index.html`
- `web2/shared/web2-pos-installer.js`
- `web2/video-maker/index.html`
- `web2/video-maker/js/video-vieneu.js`

## Last 5 commits touching `web2/`

- `19a57582f` refactor(web2): tách nút Tải bộ cài máy POS → shared Web2PosInstaller (printer-settings + video-maker dùng chung) _(2026-06-19)_
- `f64ff57cc` feat(printer-settings): bat cài máy POS gộp Print Bridge + Giọng VieNeu (auto-start nền, xoá auto cũ) _(2026-06-19)_
- `9e78c109d` feat(web2/fb): nut Xem truoc bai (giong Facebook) qua shared Web2FbPostPreview _(2026-06-19)_
- `c3d009824` ux(web2/fb): gop 2 nut tao noi dung thanh 1 (AI free + tu fallback mau) - bo du thua _(2026-06-19)_
- `2c73f6a76` feat(web2/fb): chọn NHIỀU SP từ Kho cho AI (caption tổng hợp + tự thêm ảnh) qua shared Web2ProductPicker; sort page Store→House→Ơi→Nè _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-234101-0ca48ac` cho Claude walk chain theo CLAUDE.md protocol.
