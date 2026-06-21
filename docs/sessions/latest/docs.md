# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-183203-0596167`
**Session file**: [`./20260621-183203-0596167.md`](../20260621-183203-0596167.md)
**Commit**: `0596167` — redesign(video-maker): UI 2-tab + card + rename 'Xưởng Video AI' + fix [hidden] guard
**Last updated**: 2026-06-21 18:32:03 +07
**Summary**: Xưởng Video AI: redesign 2-tab + ElevenLabs xoay-tua-key + sound/STT/isolate + fix [hidden]

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `05961673c` redesign(video-maker): UI 2-tab + card + rename 'Xưởng Video AI' + fix [hidden] guard _(2026-06-21)_
- `f6308099c` chore(session): RESUME:20260621-182017-0842d8e _(2026-06-21)_
- `9ccfd0f37` feat(web2): TAG đơn — icon picker tìm kiếm + chọn (thay ô nhập tay, 1373 lucide icons) _(2026-06-21)_
- `08603d8ce` chore(session): RESUME:20260621-175034-23bc4f1 _(2026-06-21)_
- `23bc4f13e` feat(video-maker): giọng đọc theo từng cảnh (multi-narrator) _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-183203-0596167` cho Claude walk chain theo CLAUDE.md protocol.
