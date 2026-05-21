# Latest Snapshot — `showroom/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-094554-f97ef68`
**Session file**: [`./20260521-094554-f97ef68.md`](../20260521-094554-f97ef68.md)
**Commit**: `f97ef68` — auto: session update
**Last updated**: 2026-05-21 09:45:54 +07
**Summary**: auto: session update

## Files changed in this commit (`showroom/`)

- `showroom/albums/1/0.jpg`
- `showroom/albums/1/1.jpg`
- `showroom/albums/1/2.jpg`
- `showroom/albums/1/3.jpg`
- `showroom/albums/1/4.jpg`
- `showroom/albums/2/0.jpg`
- `showroom/albums/2/1.jpg`
- `showroom/albums/2/2.jpg`
- `showroom/albums/2/3.jpg`
- `showroom/albums/2/4.jpg`
- `showroom/albums/3/0.jpg`
- `showroom/albums/3/1.jpg`
- `showroom/albums/3/2.jpg`
- `showroom/albums/3/3.jpg`
- `showroom/albums/3/4.jpg`
- `showroom/albums/4/0.jpg`
- `showroom/albums/4/1.jpg`
- `showroom/albums/4/2.jpg`
- `showroom/albums/4/3.jpg`
- `showroom/albums/4/4.jpg`
- `showroom/albums/5/0.jpg`
- `showroom/albums/5/1.jpg`
- `showroom/albums/5/2.jpg`
- `showroom/albums/5/3.jpg`
- `showroom/albums/5/4.jpg`
- `showroom/albums/6/0.jpg`
- `showroom/albums/6/1.jpg`
- `showroom/albums/6/2.jpg`
- `showroom/albums/6/3.jpg`
- `showroom/albums/6/4.jpg`
- `showroom/albums/6/5.jpg`
- `showroom/index.html`

## Last 5 commits touching `showroom/`

- `3d8c6384` feat(showroom): viewer order tuy chinh 1->0->2->3->4 (mo o anh 1, anh 0 xem qua next) _(2026-05-20)_
- `3ffd16bc` fix(showroom): viewer bat dau tu anh 0.jpg, total = tong anh (incl 0.jpg) _(2026-05-20)_
- `bc5737eb` feat(showroom): 6 album that voi viewer prev/next (ESC, arrow keys, touch swipe) - tat ca vao tab QUAN _(2026-05-20)_
- `f38f927a` feat(showroom): tab QUAN/AO/DAM/SET/PHU-KIEN co filter that, them empty state _(2026-05-20)_
- `c72b1632` fix(showroom): doi title browser tab tu Luxe Album sang NhiJudy Album _(2026-05-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-094554-f97ef68` cho Claude walk chain theo CLAUDE.md protocol.
