# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-063953-04af663`
**Session file**: [`./20260620-063953-04af663.md`](../20260620-063953-04af663.md)
**Commit**: `04af663` — feat(web2/picker): xem SP dang DANH SACH (anh + ten + ma + gia) thay vi luoi anh
**Last updated**: 2026-06-20 06:39:53 +07
**Summary**: Picker SP doi luoi anh -> danh sach (anh+ten+ma+gia)

## Files changed in this commit (`web2/`)

- `web2/fb-posts/index.html`
- `web2/shared/web2-product-picker.js`

## Last 5 commits touching `web2/`

- `04af663e2` feat(web2/picker): xem SP dang DANH SACH (anh + ten + ma + gia) thay vi luoi anh _(2026-06-20)_
- `b2b899b9d` fix(web2/pwa): bo start*url co dinh -> them man hinh chinh luu DUNG trang dang mo (share trang nao luu trang do) *(2026-06-20)\_
- `23b5e998a` feat(web2): PWA dùng chung (Thêm vào Màn hình chính, iOS/Android) — manifest+apple meta+icon auto-inject qua sidebar.js, không App Store/dev account; bump sidebar ?v _(2026-06-20)_
- `d7296bcfa` feat(web2): shared mobile responsive (web2-mobile.css) — 1 nguồn cho mọi trang qua sidebar.js inject; bump sidebar ?v _(2026-06-19)_
- `19a57582f` refactor(web2): tách nút Tải bộ cài máy POS → shared Web2PosInstaller (printer-settings + video-maker dùng chung) _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-063953-04af663` cho Claude walk chain theo CLAUDE.md protocol.
