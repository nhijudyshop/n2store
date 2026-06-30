# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-171227-9f5b17a`
**Session file**: [`./20260630-171227-9f5b17a.md`](../20260630-171227-9f5b17a.md)
**Commit**: `9f5b17a` — auto: session update
**Last updated**: 2026-06-30 17:12:27 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `85f9fe063` refactor(web2 util): gộp money(11)→Web2Format.vnd + escape(76)→Web2Escape.escapeHtml (delegate-with-fallback); date đã-delegate, phone hoãn _(2026-06-30)_
- `9456352d9` chore(session): RESUME:20260630-165654-ae1215e _(2026-06-30)_
- `ae1215e4b` feat(printer): cloudflared tunnel cho Print Bridge — ĐT/PC khác in qua tunnel không cần cài bridge _(2026-06-30)_
- `50d2e5a13` chore(session): RESUME:20260630-165352-c23125c _(2026-06-30)_
- `cc6bfa7d2` feat(system): tab 'Trùng lặp / 1-nguồn' (dedup audit toàn bộ Web 2.0) — 15 nhóm, JSON-driven _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-171227-9f5b17a` cho Claude walk chain theo CLAUDE.md protocol.
