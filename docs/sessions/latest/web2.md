# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-183203-0596167`
**Session file**: [`./20260621-183203-0596167.md`](../20260621-183203-0596167.md)
**Commit**: `0596167` — redesign(video-maker): UI 2-tab + card + rename 'Xưởng Video AI' + fix [hidden] guard
**Last updated**: 2026-06-21 18:32:03 +07
**Summary**: Xưởng Video AI: redesign 2-tab + ElevenLabs xoay-tua-key + sound/STT/isolate + fix [hidden]

## Files changed in this commit (`web2/`)

- `web2/shared/web2-sidebar.js`
- `web2/video-maker/index.html`
- `web2/video-maker/video-maker.css`

## Last 5 commits touching `web2/`

- `05961673c` redesign(video-maker): UI 2-tab + card + rename 'Xưởng Video AI' + fix [hidden] guard _(2026-06-21)_
- `0842d8e5d` feat(video-maker): tích hợp ElevenLabs — hiệu ứng âm thanh AI + chép lời (STT) + lọc tạp âm _(2026-06-21)_
- `9ccfd0f37` feat(web2): TAG đơn — icon picker tìm kiếm + chọn (thay ô nhập tay, 1373 lucide icons) _(2026-06-21)_
- `65333d6f3` auto: session update _(2026-06-21)_
- `6cc4e479c` feat(video-maker): import video để lồng tiếng (voiceover) + slider tiếng gốc _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-183203-0596167` cho Claude walk chain theo CLAUDE.md protocol.
