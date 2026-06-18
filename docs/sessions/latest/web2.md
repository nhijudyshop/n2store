# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-212618-ed1d895`
**Session file**: [`./20260618-212618-ed1d895.md`](../20260618-212618-ed1d895.md)
**Commit**: `ed1d895` — docs(web2-chat): ghi tiến độ hợp nhất Web2CustomerChat Phase 0/1/1b/2; Phase 3/4 native còn lại
**Last updated**: 2026-06-18 21:26:18 +07
**Summary**: docs(web2-chat): ghi tiến độ hợp nhất Web2CustomerChat Phase 0/1/1b/2; Phase 3/4 native còn lại

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-balance-history-app.js`
- `web2/balance-history/js/web2-pending-match.js`
- `web2/customers/index.html`
- `web2/jt-tracking/index.html`
- `web2/jt-tracking/js/jt-tracking-app.js`
- `web2/shared/web2-chat-readonly.js`
- `web2/shared/web2-customer-chat.js`
- `web2/shared/web2-customer-detail-modal.js`

## Last 5 commits touching `web2/`

- `cb98b8a91` refactor(web2-chat): Phase 2 — jt-tracking Zalo drawer → Web2CustomerChat (conversationId + pancakeEnabled:false + onReady) _(2026-06-18)_
- `559786ffb` refactor(web2-chat): Phase 1b — retire Web2ChatReadonly → Web2CustomerChat({layout:'modal',readonly}) _(2026-06-18)_
- `f8bc38181` feat(web2): đếm bó/pack bằng camera opencv.js + chạm sửa tay (Web2PackCounter, Đợt 4) _(2026-06-18)_
- `50c174fe5` feat(web2/label-ocr): thêm chế độ đọc chữ TAY (TrOCR/transformers.js) — toggle Chữ in _(Chữ tay (Đợt 3)|2026-06-18)_
- `9544088f8` feat(web2): đọc nhãn bằng camera OCR on-device (Web2LabelOcr, Đợt 2) + cắm reconcile _(2026-06-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-212618-ed1d895` cho Claude walk chain theo CLAUDE.md protocol.
