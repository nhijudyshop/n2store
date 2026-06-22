# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-125007-9acdcbb`
**Session file**: [`./20260622-125007-9acdcbb.md`](../20260622-125007-9acdcbb.md)
**Commit**: `9acdcbb` — fix(web2-video-maker): dock preview as grid column — hết PiP nổi đè card, bố cục cân đối
**Last updated**: 2026-06-22 12:50:07 +07
**Summary**: fix(web2-video-maker): dock preview as grid column — hết PiP nổi đè card, bố cục cân đối

## Files changed in this commit (`web2/`)

- `web2/video-maker/index.html`
- `web2/video-maker/video-maker.css`

## Last 5 commits touching `web2/`

- `9acdcbbed` fix(web2-video-maker): dock preview as grid column — hết PiP nổi đè card, bố cục cân đối _(2026-06-22)_
- `2a7725294` feat(web2) sidebar: collapsed icon click expands group + un-collapses; dedup Sổ Order _(2026-06-22)_
- `a8d8244f6` fix(web2) products: GHI CHÚ column misaligned — move line-clamp off the <td> _(2026-06-22)_
- `94ad79f4f` feat(video-maker): ElevenLabs VN — model flash*v2_5 + kho giọng cộng đồng (lọc/cuộn) + voice settings (P2) *(2026-06-22)\_
- `e3c7e1315` fix(web2) native-orders: add mobile shell pack to base.css (hamburger desktop-hide + drawer) _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-125007-9acdcbb` cho Claude walk chain theo CLAUDE.md protocol.
