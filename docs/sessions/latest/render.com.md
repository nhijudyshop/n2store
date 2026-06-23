# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-021229-a9ea99a`
**Session file**: [`./20260624-021229-a9ea99a.md`](../20260624-021229-a9ea99a.md)
**Commit**: `a9ea99a` — docs(web2): refine RLQ flag — verified narrow (per-line cap vs total-sold, not remaining), fix needs in-tx refactor
**Last updated**: 2026-06-24 02:12:29 +07
**Summary**: docs(web2): refine RLQ flag — verified narrow (per-line cap vs total-sold, not remaining), fix needs in-tx refactor

## Files changed in this commit (`render.com/`)

- `render.com/routes/fast-sale-orders.js`

## Last 5 commits touching `render.com/`

- `66a2f707d` fix(web2): split-PBH cancel restocks ALL splits + 5 frontend silent-failure surfaces _(2026-06-24)_
- `896c1a855` fix(web2): ai-hub image-gen hang (timeouts) + hide stock brand names + connect video flow + auto-stock _(2026-06-24)_
- `2be46c0c8` fix(web2): stock-media service reads WEB2*PEXELS/PIXABAY_API_KEY\* (project convention) *(2026-06-24)\_
- `13d201c35` feat(web2): MoneyPrinterTurbo stock footage (Pexels/Pixabay) in video-maker _(2026-06-23)_
- `be14ea22f` fix(web2): avatar DiceBear transparent→400 + avatar vào trang Người dùng + đổi MK chính mình giữ phiên + Zalo CORS x-web2-zalo-owner _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-021229-a9ea99a` cho Claude walk chain theo CLAUDE.md protocol.
