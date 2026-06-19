# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-234101-0ca48ac`
**Session file**: [`./20260619-234101-0ca48ac.md`](../20260619-234101-0ca48ac.md)
**Commit**: `0ca48ac` — docs(dev-log): shared Web2PosInstaller
**Last updated**: 2026-06-19 23:41:01 +07
**Summary**: docs(dev-log): shared Web2PosInstaller

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/MEDIA-KIT.md`

## Last 5 commits touching `docs/`

- `0ca48ac0d` docs(dev-log): shared Web2PosInstaller _(2026-06-19)_
- `19a57582f` refactor(web2): tách nút Tải bộ cài máy POS → shared Web2PosInstaller (printer-settings + video-maker dùng chung) _(2026-06-19)_
- `6d95027e7` chore(session): RESUME:20260619-232723-f64ff57 _(2026-06-19)_
- `f64ff57cc` feat(printer-settings): bat cài máy POS gộp Print Bridge + Giọng VieNeu (auto-start nền, xoá auto cũ) _(2026-06-19)_
- `7ee0a17f1` docs(web2): dev-log + codemap cho xem truoc bai FB + gop nut tao noi dung _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-234101-0ca48ac` cho Claude walk chain theo CLAUDE.md protocol.
