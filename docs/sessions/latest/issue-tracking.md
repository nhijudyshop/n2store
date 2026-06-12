# Latest Snapshot — `issue-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260612-192136-723d23f`
**Session file**: [`./20260612-192136-723d23f.md`](../20260612-192136-723d23f.md)
**Commit**: `723d23f` — auto: session update
**Last updated**: 2026-06-12 19:21:36 +07
**Summary**: auto: session update

## Files changed in this commit (`issue-tracking/`)

- `issue-tracking/index.html`
- `issue-tracking/js/script.js`

## Last 5 commits touching `issue-tracking/`

- `fadacf58d` feat(issue-tracking): cho phép trả bổ sung trên đơn đã hoàn tất (Khách gửi/Thu về) _(2026-06-12)_
- `943e7838d` chore(cache-bust): bump v= cho delivery-report.js + script.js + api-service.js (feature handover thu ve) _(2026-06-11)_
- `0686f088c` feat(delivery-report): xuat excel Thu ve kem So luong/Gia tri tu ticket CSKH + danh dau ban giao ship (idempotent) _(2026-06-11)_
- `98b295b1b` fix(issue-tracking): stat cards + tab badges dem theo chip loc loai, fix Hoan Tat Hom Nay luon 0 _(2026-06-11)_
- `9ac35e972` feat(issue-tracking): đưa nút Copy bill ra thẳng dòng đơn (ngoài expand) _(2026-06-08)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260612-192136-723d23f` cho Claude walk chain theo CLAUDE.md protocol.
