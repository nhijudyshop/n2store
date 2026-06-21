# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-182017-0842d8e`
**Session file**: [`./20260621-182017-0842d8e.md`](../20260621-182017-0842d8e.md)
**Commit**: `0842d8e` — feat(video-maker): tích hợp ElevenLabs — hiệu ứng âm thanh AI + chép lời (STT) + lọc tạp âm
**Last updated**: 2026-06-21 18:20:17 +07
**Summary**: feat(video-maker): tích hợp ElevenLabs — hiệu ứng âm thanh AI + chép lời (STT) + lọc tạp âm

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `9ccfd0f37` feat(web2): TAG đơn — icon picker tìm kiếm + chọn (thay ô nhập tay, 1373 lucide icons) _(2026-06-21)_
- `08603d8ce` chore(session): RESUME:20260621-175034-23bc4f1 _(2026-06-21)_
- `23bc4f13e` feat(video-maker): giọng đọc theo từng cảnh (multi-narrator) _(2026-06-21)_
- `4ad4df0ed` chore(session): RESUME:20260621-174906-65333d6 _(2026-06-21)_
- `00ef32976` chore(session): RESUME:20260621-174322-61fba73 _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-182017-0842d8e` cho Claude walk chain theo CLAUDE.md protocol.
