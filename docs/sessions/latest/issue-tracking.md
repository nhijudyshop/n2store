# Latest Snapshot — `issue-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260611-173556-0686f08`
**Session file**: [`./20260611-173556-0686f08.md`](../20260611-173556-0686f08.md)
**Commit**: `0686f08` — feat(delivery-report): xuat excel Thu ve kem So luong/Gia tri tu ticket CSKH + danh dau ban giao ship (idempotent)
**Last updated**: 2026-06-11 17:35:56 +07
**Summary**: Lien thong CSKH -> delivery-report: xuat excel Thu ve 2 cot SL/Gia tri tu ticket RETURN_SHIPPER + danh dau ban giao ship (idempotent theo so don)

## Files changed in this commit (`issue-tracking/`)
- `issue-tracking/js/script.js`

## Last 5 commits touching `issue-tracking/`
- `0686f088c` feat(delivery-report): xuat excel Thu ve kem So luong/Gia tri tu ticket CSKH + danh dau ban giao ship (idempotent) _(2026-06-11)_
- `98b295b1b` fix(issue-tracking): stat cards + tab badges dem theo chip loc loai, fix Hoan Tat Hom Nay luon 0 _(2026-06-11)_
- `9ac35e972` feat(issue-tracking): đưa nút Copy bill ra thẳng dòng đơn (ngoài expand) _(2026-06-08)_
- `3a1eeb200` auto: session update _(2026-06-08)_
- `183e77110` refactor(web2): xóa hẳn live-campaign (page + route + sidebar + worker) _(2026-06-08)_
---
**Để tiếp tục context trong session mới:**
1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260611-173556-0686f08` cho Claude walk chain theo CLAUDE.md protocol.
