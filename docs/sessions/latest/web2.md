# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-101411-00347f3`
**Session file**: [`./20260624-101411-00347f3.md`](../20260624-101411-00347f3.md)
**Commit**: `00347f3` — feat(web2/ai-hub): tách key chat/Nano Banana + gate quyền + quota + lưu ảnh/prompt/chat + thư viện mẫu
**Last updated**: 2026-06-24 10:14:11 +07
**Summary**: web2 ai-hub: tách key chat/Nano Banana paid + gate quyền + quota + lưu ảnh/prompt/chat + thư viện mẫu (nano-banana-pro-prompts + system-prompts)

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/ai-hub/js/ai-chat.js`
- `web2/ai-hub/js/ai-image.js`
- `web2/ai-hub/js/ai-presets.js`
- `web2/ai-hub/js/ai-tryon.js`

## Last 5 commits touching `web2/`

- `00347f3cd` feat(web2/ai-hub): tách key chat/Nano Banana + gate quyền + quota + lưu ảnh/prompt/chat + thư viện mẫu _(2026-06-24)_
- `6bd2facae` feat(web2): ai-hub reuse Web2VideoStock free image/video picker in Tạo ảnh + Ghép đồ _(2026-06-24)_
- `dddf5f64a` feat(web2): ai-hub 'Ghép đồ / Thử đồ' — 1 person + N garment images + scene prompt → Gemini multi-image composite _(2026-06-24)_
- `9294b1db7` fix(web2): footer avatar missing on some pages + ai-hub provider/model cleanup + English AI prompts _(2026-06-24)_
- `b36a9c0f7` fix(web2): page-guard 'back to overview' path adapts to page depth (web2/<slug> vs depth-1) _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-101411-00347f3` cho Claude walk chain theo CLAUDE.md protocol.
