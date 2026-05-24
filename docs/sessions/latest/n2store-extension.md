# Latest Snapshot — `n2store-extension/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260524-115112-f11cf5c`
**Session file**: [`./20260524-115112-f11cf5c.md`](../20260524-115112-f11cf5c.md)
**Commit**: `f11cf5c` — fix(snap-ext): VERSION constant sync với manifest.json (1.0.6)
**Last updated**: 2026-05-24 11:51:12 +07
**Summary**: fix(snap-ext): VERSION constant sync với manifest.json (1.0.6)

## Files changed in this commit (`n2store-extension/`)

- `n2store-extension/shared/constants.js`

## Last 5 commits touching `n2store-extension/`

- `f11cf5c1e` fix(snap-ext): VERSION constant sync với manifest.json (1.0.6) _(2026-05-24)_
- `fc9f6c436` fix(snap-ext): manifest v1.0.6 — thêm <all*urls> host permission *(2026-05-24)\_
- `d3f1d60c8` feat(snap-ext): N2Store Extension auto-capture tab — zero popup _(2026-05-24)_
- `411482c33` feat(domain): rewire codebase sang custom domain nhijudy.store _(2026-05-21)_
- `a5d448159` auto: session update _(2026-04-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260524-115112-f11cf5c` cho Claude walk chain theo CLAUDE.md protocol.
