# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-200559-5bcd3bb`
**Session file**: [`./20260621-200559-5bcd3bb.md`](../20260621-200559-5bcd3bb.md)
**Commit**: `5bcd3bb` — fix(video-maker): iPad full-width main (page-scoped shell fix) + tablet layout
**Last updated**: 2026-06-21 20:05:59 +07
**Summary**: video-maker iPad: fix shell main full-width + tablet portrait 2-cột / landscape 2-pane

## Files changed in this commit (`web2/`)

- `web2/video-maker/index.html`
- `web2/video-maker/video-maker.css`

## Last 5 commits touching `web2/`

- `5bcd3bbc0` fix(video-maker): iPad full-width main (page-scoped shell fix) + tablet layout _(2026-06-21)_
- `cca2a9f4c` redesign(video-maker): giao diện điện thoại như app edit chuyên nghiệp _(2026-06-21)_
- `8de7d629c` feat(web2): KPI User tag — nút Chốt KPI (admin) + health bar chưa-gán/chưa-chốt + filter NV + amber + deep-link _(2026-06-21)_
- `70a481274` auto: session update _(2026-06-21)_
- `05961673c` redesign(video-maker): UI 2-tab + card + rename 'Xưởng Video AI' + fix [hidden] guard _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-200559-5bcd3bb` cho Claude walk chain theo CLAUDE.md protocol.
