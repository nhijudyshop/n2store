# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-100906-c42670c`
**Session file**: [`./20260620-100906-c42670c.md`](../20260620-100906-c42670c.md)
**Commit**: `c42670c` — fix(web2): audit fixes — gate auth + SSRF + money + idempotency (21 file)
**Last updated**: 2026-06-20 10:09:06 +07
**Summary**: fix(web2): audit fixes — gate auth + SSRF + money + idempotency (21 file)

## Files changed in this commit (`web2/`)

- `web2/shared/chat-panel/web2-chat-panel-compose.js`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `c42670c11` fix(web2): audit fixes — gate auth + SSRF + money + idempotency (21 file) _(2026-06-20)_
- `5c4f6d941` feat(web2/pos-installer): bo cai .bat -> MENU bam so (Print Bridge / VieNeu / OmniVoice / cai het) + rule doc shared truoc khi code _(2026-06-20)_
- `04af663e2` feat(web2/picker): xem SP dang DANH SACH (anh + ten + ma + gia) thay vi luoi anh _(2026-06-20)_
- `b2b899b9d` fix(web2/pwa): bo start*url co dinh -> them man hinh chinh luu DUNG trang dang mo (share trang nao luu trang do) *(2026-06-20)\_
- `23b5e998a` feat(web2): PWA dùng chung (Thêm vào Màn hình chính, iOS/Android) — manifest+apple meta+icon auto-inject qua sidebar.js, không App Store/dev account; bump sidebar ?v _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-100906-c42670c` cho Claude walk chain theo CLAUDE.md protocol.
