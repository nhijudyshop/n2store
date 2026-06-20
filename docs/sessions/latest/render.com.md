# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-220000-40c30af`
**Session file**: [`./20260620-220000-40c30af.md`](../20260620-220000-40c30af.md)
**Commit**: `40c30af` — perf: trigram GIN index web2_balance_history.content (ILIKE substring dùng index thay seq scan)
**Last updated**: 2026-06-20 22:00:00 +07
**Summary**: deploy CF worker O7 + bỏ poller O3 + trigram web2_balance_history; defer Web1 trigram/KPI N+1/keyset

## Files changed in this commit (`render.com/`)

- `render.com/services/web2-sepay-matching.js`

## Last 5 commits touching `render.com/`

- `40c30af34` perf: trigram GIN index web2*balance_history.content (ILIKE substring dùng index thay seq scan) *(2026-06-20)\_
- `9af3a0c68` fix(O3): bỏ poller fetch comment -> WS-live nguồn duy nhất (hết dòng trùng postId*mid vs convId_seq) *(2026-06-20)\_
- `f81bac13c` perf(web2-returns): _applyStock batch 1 UPDATE thay N+1 (gom theo code, sign đồng nhất nên kết quả y hệt) _(2026-06-20)\_
- `9675bcc6c` fix(security O2): web2-zalo /media chống IDOR — media mới dùng token bất khả đoán, legacy numeric id bắt buộc account*key scope *(2026-06-20)\_
- `c2693e8f5` fix(security): A3 fb-posts draft/ad-entry require admin; O7 worker proxy header denylist _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-220000-40c30af` cho Claude walk chain theo CLAUDE.md protocol.
