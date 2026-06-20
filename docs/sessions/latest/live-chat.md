# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-120728-2704ef6`
**Session file**: [`./20260620-120728-2704ef6.md`](../20260620-120728-2704ef6.md)
**Commit**: `2704ef6` — fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password
**Last updated**: 2026-06-20 12:07:28 +07
**Summary**: fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password

## Files changed in this commit (`live-chat/`)

- `live-chat/chat.html`
- `live-chat/index.html`

## Last 5 commits touching `live-chat/`

- `2704ef6f0` fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password _(2026-06-20)_
- `65d6ba9b4` fix(web2): medium/low audit fixes (25 file) — leaks/races/guards + bump ?v=20260620c _(2026-06-20)_
- `805979487` chore(web2): bump ?v=20260620b (sidebar escapeHtml + chat double-send guard) -> deploy frontend security fixes _(2026-06-20)_
- `b2b899b9d` fix(web2/pwa): bo start*url co dinh -> them man hinh chinh luu DUNG trang dang mo (share trang nao luu trang do) *(2026-06-20)\_
- `9d9fcee8b` fix(live-chat): comments-mobile manifest RIÊNG (start*url=chính nó) → add màn hình chính mở đúng trang comment, không nhảy overview *(2026-06-20)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-120728-2704ef6` cho Claude walk chain theo CLAUDE.md protocol.
