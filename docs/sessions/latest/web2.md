# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-003719-b2b899b`
**Session file**: [`./20260620-003719-b2b899b.md`](../20260620-003719-b2b899b.md)
**Commit**: `b2b899b` — fix(web2/pwa): bo start_url co dinh -> them man hinh chinh luu DUNG trang dang mo (share trang nao luu trang do)
**Last updated**: 2026-06-20 00:37:19 +07
**Summary**: fix(web2/pwa): bo start_url co dinh -> them man hinh chinh luu DUNG trang dang mo (share trang nao luu trang do)

## Files changed in this commit (`web2/`)

- `web2/shared/web2-manifest.webmanifest`

## Last 5 commits touching `web2/`

- `b2b899b9d` fix(web2/pwa): bo start*url co dinh -> them man hinh chinh luu DUNG trang dang mo (share trang nao luu trang do) *(2026-06-20)\_
- `23b5e998a` feat(web2): PWA dùng chung (Thêm vào Màn hình chính, iOS/Android) — manifest+apple meta+icon auto-inject qua sidebar.js, không App Store/dev account; bump sidebar ?v _(2026-06-20)_
- `d7296bcfa` feat(web2): shared mobile responsive (web2-mobile.css) — 1 nguồn cho mọi trang qua sidebar.js inject; bump sidebar ?v _(2026-06-19)_
- `19a57582f` refactor(web2): tách nút Tải bộ cài máy POS → shared Web2PosInstaller (printer-settings + video-maker dùng chung) _(2026-06-19)_
- `f64ff57cc` feat(printer-settings): bat cài máy POS gộp Print Bridge + Giọng VieNeu (auto-start nền, xoá auto cũ) _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-003719-b2b899b` cho Claude walk chain theo CLAUDE.md protocol.
