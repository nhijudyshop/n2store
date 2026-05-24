# Latest Snapshot — `n2store-extension/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260524-122828-7a5f6a7`
**Session file**: [`./20260524-122828-7a5f6a7.md`](../20260524-122828-7a5f6a7.md)
**Commit**: `7a5f6a7` — feat(snap-ext): Bước 2 — tabCapture.getMediaStreamId stream mode (tab inactive OK)
**Last updated**: 2026-05-24 12:28:28 +07
**Summary**: feat(snap-ext): Bước 2 — tabCapture.getMediaStreamId stream mode (tab inactive OK)

## Files changed in this commit (`n2store-extension/`)

- `n2store-extension/content/contentscript.js`
- `n2store-extension/manifest.json`
- `n2store-extension/popup/popup.js`

## Last 5 commits touching `n2store-extension/`

- `7a5f6a77a` feat(snap-ext): Bước 2 — tabCapture.getMediaStreamId stream mode (tab inactive OK) _(2026-05-24)_
- `f11cf5c1e` fix(snap-ext): VERSION constant sync với manifest.json (1.0.6) _(2026-05-24)_
- `fc9f6c436` fix(snap-ext): manifest v1.0.6 — thêm <all*urls> host permission *(2026-05-24)\_
- `d3f1d60c8` feat(snap-ext): N2Store Extension auto-capture tab — zero popup _(2026-05-24)_
- `411482c33` feat(domain): rewire codebase sang custom domain nhijudy.store _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260524-122828-7a5f6a7` cho Claude walk chain theo CLAUDE.md protocol.
