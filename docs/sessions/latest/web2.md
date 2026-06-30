# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-184320-7e6f568`
**Session file**: [`./20260630-184320-7e6f568.md`](../20260630-184320-7e6f568.md)
**Commit**: `7e6f568` — feat(web2 sse): Web2SSE.subscribeReload (1 nguồn subscribe+debounce) + wire variants [dedup hoàn chỉnh]
**Last updated**: 2026-06-30 18:43:20 +07
**Summary**: feat(web2 sse): Web2SSE.subscribeReload (1 nguồn subscribe+debounce) + wire variants [dedup hoàn chỉnh]

## Files changed in this commit (`web2/`)

- `web2/system/data/web2-dedup-audit.json`
- `web2/variants/js/web2-variants-app.js`

## Last 5 commits touching `web2/`

- `7e6f56823` feat(web2 sse): Web2SSE.subscribeReload (1 nguồn subscribe+debounce) + wire variants [dedup hoàn chỉnh] _(2026-06-30)_
- `4a5208919` auto: session update _(2026-06-30)_
- `1cc04a641` auto: session update _(2026-06-30)_
- `85f9fe063` refactor(web2 util): gộp money(11)→Web2Format.vnd + escape(76)→Web2Escape.escapeHtml (delegate-with-fallback); date đã-delegate, phone hoãn _(2026-06-30)_
- `c23125cd9` auto: session update _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-184320-7e6f568` cho Claude walk chain theo CLAUDE.md protocol.
