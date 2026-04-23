# Danh sách ví bị ảnh hưởng bởi Migration 063 — 2026-04-23

> **Context**: Migration 063 (`063_fix_unique_wallet_transactions.sql`, chạy 2026-04-22) có 2 bug gây ảnh hưởng tới 93 ví.
>
> 1. **Bug Step 1 (DELETE duplicates)**: UNIQUE index trên `(reference_type, reference_id)` quá broad — xóa oan 234 dòng `wallet_transactions` (tổng 2,993,760đ) vốn là các dòng WITHDRAW hợp lệ ghép đôi VIRTUAL_DEBIT trong cùng order của `wallet_withdraw_fifo()`. **Không khôi phục được** nếu không có DB backup trước ngày đó.
>
> 2. **Bug Step 2 (Recalc balance)**: Công thức `WHEN WITHDRAW THEN -amount` sai — WITHDRAW rows trong DB đã lưu amount âm (`-2,610,000`), flip sang dương thành cộng vào → balance bị inflated lên trung bình 2× giá trị WITHDRAW.

## Tóm tắt

| Chỉ số | Giá trị |
|---|---|
| Tổng ví có `stored != SUM(signed)` | **93** |
| Đã báo cáo (Nhóm A — đã rollback) | 39 ví |
| Chưa báo cáo (Nhóm B) | 54 ví |
| Tổng chênh lệch Nhóm A | +149,023,998đ |
| Tổng chênh lệch Nhóm B | +146,118,000đ |
| **Tổng bơm do migration 063** | **295,141,998đ** |

---

## Nhóm A — 39 ví đã từng được _fix-balance-after-063 chạm vào, đã rollback

Balance hiện tại = sau Migration 063 Step 2 (buggy) = giá trị "Trước tôi sửa" trong báo cáo trước.

| # | SĐT | Tên KH | Balance hiện tại | SUM(signed) đúng | Chênh lệch | Số TX |
|---|---|---|---|---|---|---|
| 1 | 0933608739 | Thuy Van Nguyen Ngoc | 30,494,000 | 1,950,000 | +28,544,000 | 18 |
| 2 | 0908436130 | Trinh Nguyen | 23,730,000 | 1,850,000 | +21,880,000 | 6 |
| 3 | 0903778113 | Ngoc Tran - (Anh Lương Nhân Dù | 14,820,000 | 1,010,000 | +13,810,000 | 8 |
| 4 | 0907228044 | Mary Thai | 14,326,000 | 790,000 | +13,536,000 | 17 |
| 5 | 0902660235 | Le Thao | 7,670,000 | 0 | +7,670,000 | 6 |
| 6 | 0908007384 | Ken Nguyễn | 8,490,000 | 1,730,000 | +6,760,000 | 5 |
| 7 | 0123456788 | Huỳnh Thành Đạt | 2,000 | -6,582,000 | +6,584,000 | 65 |
| 8 | 0899223899 | Abich Abich | 7,330,000 | 1,330,000 | +6,000,000 | 8 |
| 9 | 0377395954 | Mymy Ngô | 4,308,000 | 0 | +4,308,000 | 4 |
| 10 | 0932500432 | Bi Bi | 3,988,000 | 488,000 | +3,500,000 | 8 |
| 11 | 0902638936 | Bình Nguyễn | 3,300,000 | 0 | +3,300,000 | 2 |
| 12 | 0794791468 | Ngân | 4,860,000 | 1,620,000 | +3,240,000 | 6 |
| 13 | 0359399334 | Nhà Nghỉ Phương Đông | 3,375,000 | 485,000 | +2,890,000 | 6 |
| 14 | 0963487449 | Mỹ Hiền Lưu | 2,630,000 | 50,000 | +2,580,000 | 6 |
| 15 | 0904343554 | Chi Nguyen | 3,810,000 | 1,270,000 | +2,540,000 | 3 |
| 16 | 0867297875 | Trần Thuỷ Tin | 2,070,000 | 0 | +2,070,000 | 10 |
| 17 | 0985321949 | Ut Chi | 2,385,000 | 585,000 | +1,800,000 | 4 |
| 18 | 0978070306 | Thái Ly | 1,717,000 | 57,000 | +1,660,000 | 2 |
| 19 | 0906252809 | Xuân Hiền Xu Hi | 1,990,000 | 390,000 | +1,600,000 | 2 |
| 20 | 0977108918 | Vũ Tố Uyên | 1,590,000 | 0 | +1,590,000 | 3 |
| 21 | 0917710410 | Bảoo Ngânn | 1,465,000 | 35,000 | +1,430,000 | 4 |
| 22 | 0902737030 | Chi Vũ | 1,870,000 | 470,000 | +1,400,000 | 3 |
| 23 | 0919576866 | Lê Phương | 1,380,000 | 0 | +1,380,000 | 2 |
| 24 | 0914536162 | Lan Ngoc | 1,100,000 | 0 | +1,100,000 | 2 |
| 25 | 0907271793 | Thùy Trâm | 2,165,000 | 1,065,000 | +1,100,000 | 5 |
| 26 | 0367674168 | Tr Hạnh Phuc | 925,000 | 35,000 | +890,000 | 4 |
| 27 | 0784602762 | Hường Linh | 1,110,000 | 280,000 | +830,000 | 3 |
| 28 | 0938215758 | Nguyen Thao | 800,000 | 0 | +800,000 | 4 |
| 29 | 0912121212 | Huyền Nhi | 780,000 | 20,000 | +760,000 | 48 |
| 30 | 0859718918 | Trang Nguyen | 725,000 | 105,000 | +620,000 | 4 |
| 31 | 0896875227 | Tuyền Đặng | 760,000 | 160,000 | +600,000 | 2 |
| 32 | 0944777824 | Gấu Trúc | 560,000 | 80,000 | +480,000 | 2 |
| 33 | 0945744131 | Thảo Quách | 460,000 | 0 | +460,000 | 2 |
| 34 | 0772377227 | Linh Teku | 400,000 | 0 | +400,000 | 4 |
| 35 | 0942967894 | Hồ Kim Cương | 1,400,000 | 1,000,000 | +400,000 | 3 |
| 36 | 0785363968 | Nguyễn Diễm | 200,000 | 0 | +200,000 | 2 |
| 37 | 0949702316 | Chang Chang | 880,000 | 680,000 | +200,000 | 4 |
| 38 | 0986688275 | Lan Nguyen | 100,000 | 0 | +100,000 | 2 |
| 39 | 0774852616 | Tiêu Ngọc Hân | 705,999 | 694,001 | +11,998 | 3 |

**Tổng chênh lệch Nhóm A**: +149,023,998đ (stored đang cao hơn SUM)

---

## Nhóm B — 54 ví CHƯA BÁO TRƯỚC ĐÓ

Các ví này bị Migration 063 Step 2 bơm balance, nhưng _fix-balance-after-063 **bỏ qua** vì correct_sum < 0 (vi phạm CHECK constraint `chk_wallet_balance_positive`).
Balance hiện tại = giá trị đã bị bơm bởi Migration 063 Step 2.

| # | SĐT | Tên KH | Balance hiện tại | SUM(signed) đúng | Chênh lệch | Số TX |
|---|---|---|---|---|---|---|
| 1 | 0949015004 | Anh Chau | 14,754,000 | -12,354,000 | +27,108,000 | 2 |
| 2 | 0909338236 | Nguyễn Apple | 14,626,000 | -4,330,000 | +18,956,000 | 6 |
| 3 | 0908910444 | Dung Nguyễn | 10,540,000 | -30,000 | +10,570,000 | 5 |
| 4 | 0398455518 | Thu Huyền | 8,050,000 | -2,050,000 | +10,100,000 | 12 |
| 5 | 0939510725 | Han Vo | 9,264,000 | -830,000 | +10,094,000 | 4 |
| 6 | 0968080832 | Binh Truc | 9,016,000 | -120,000 | +9,136,000 | 6 |
| 7 | 0123456987 | Nguyễn Tâm | 5,629,686 | -2,244,314 | +7,874,000 | 18 |
| 8 | 0973271127 | Ly Nguyen | 5,373,000 | -1,433,000 | +6,806,000 | 5 |
| 9 | 0944425258 | Moon Thảo | 4,704,000 | -460,000 | +5,164,000 | 6 |
| 10 | 0906773311 | An An | 3,705,000 | -195,000 | +3,900,000 | 6 |
| 11 | 0908300177 | Dustin Nguyen | 2,810,000 | -330,000 | +3,140,000 | 9 |
| 12 | 0932970148 | Kim Ngân | 2,740,000 | -300,000 | +3,040,000 | 23 |
| 13 | 0917296792 | Thuyhuong Tran | 1,470,000 | -1,470,000 | +2,940,000 | 1 |
| 14 | 0706394959 | Đinh Lan | 1,160,000 | -1,160,000 | +2,320,000 | 2 |
| 15 | 0909330028 | Nguyen Phan | 860,000 | -860,000 | +1,720,000 | 1 |
| 16 | 0984041207 | Tiêu Ngọc Hân | 690,000 | -690,000 | +1,380,000 | 1 |
| 17 | 0377085001 | Nguyen Thi Tuyet | 675,000 | -675,000 | +1,350,000 | 1 |
| 18 | 0903537123 | Nuong Tran | 800,000 | -400,000 | +1,200,000 | 4 |
| 19 | 0335793511 | Ngọc Linh | 900,000 | -300,000 | +1,200,000 | 3 |
| 20 | 0986715717 |  | 570,000 | -570,000 | +1,140,000 | 1 |
| 21 | 0933529557 | Yuri Phương | 1,025,000 | -35,000 | +1,060,000 | 4 |
| 22 | 0944113550 | Xuyên Võ | 980,000 | -40,000 | +1,020,000 | 2 |
| 23 | 0982908099 | Nguyen Sao | 860,000 | -20,000 | +880,000 | 4 |
| 24 | 0919265263 | Thanh Nguyen Lam | 390,000 | -390,000 | +780,000 | 1 |
| 25 | 0908659699 | Út Ngọc | 390,000 | -390,000 | +780,000 | 1 |
| 26 | 0383530063 | Thuy Linh | 390,000 | -390,000 | +780,000 | 1 |
| 27 | 0886210987 |  | 390,000 | -390,000 | +780,000 | 1 |
| 28 | 0946307939 | Phương Thuý | 375,000 | -375,000 | +750,000 | 1 |
| 29 | 0932953443 | Diệp Linh | 370,000 | -370,000 | +740,000 | 1 |
| 30 | 0975074447 | Thuy Phan | 340,000 | -340,000 | +680,000 | 1 |
| 31 | 0977518727 |  | 340,000 | -340,000 | +680,000 | 1 |
| 32 | 0903983928 | Hue Nguyen | 320,000 | -320,000 | +640,000 | 1 |
| 33 | 0917446277 | Hạnh Nguyên | 290,000 | -290,000 | +580,000 | 1 |
| 34 | 0824376376 | Kha Thanh Thuỷ | 290,000 | -290,000 | +580,000 | 1 |
| 35 | 0911541019 | Quách Như Nguyệt | 280,000 | -280,000 | +560,000 | 2 |
| 36 | 0988889674 | Bà Dú | 240,000 | -240,000 | +480,000 | 1 |
| 37 | 0913741168 | Mai Huynh | 230,000 | -230,000 | +460,000 | 1 |
| 38 | 0985112989 |  | 225,000 | -225,000 | +450,000 | 1 |
| 39 | 0919801807 | Loanly Le | 220,000 | -220,000 | +440,000 | 1 |
| 40 | 0775054039 | My Uyên | 200,000 | -200,000 | +400,000 | 1 |
| 41 | 0325298059 | Lê Trang | 200,000 | -200,000 | +400,000 | 1 |
| 42 | 0903873307 | Tin Bin | 318,000 | -40,000 | +358,000 | 2 |
| 43 | 0903325736 | Thanh Nguyen | 160,000 | -160,000 | +320,000 | 1 |
| 44 | 0948589859 | Ngoc Ngoan Phan | 156,000 | -156,000 | +312,000 | 1 |
| 45 | 0838658886 | Ling Ling Mei | 150,000 | -150,000 | +300,000 | 1 |
| 46 | 0906889834 |  | 150,000 | -150,000 | +300,000 | 1 |
| 47 | 0914616154 | Phạm Linh | 150,000 | -150,000 | +300,000 | 1 |
| 48 | 0918720007 | Nguyen Thi Pha | 125,000 | -125,000 | +250,000 | 1 |
| 49 | 0707711100 | Maika Nguyễn | 100,000 | -100,000 | +200,000 | 1 |
| 50 | 0906456725 | Chăm Sóc Sau Sinh | 100,000 | -100,000 | +200,000 | 1 |
| 51 | 0975534558 | Thúy Duy | 100,000 | -100,000 | +200,000 | 1 |
| 52 | 0911299877 | Tú Phan Tú Phan | 100,000 | -100,000 | +200,000 | 1 |
| 53 | 0902551920 | Kim Hien | 40,000 | -40,000 | +80,000 | 1 |
| 54 | 0907560857 | Võ Phượng | 20,000 | -20,000 | +40,000 | 1 |

**Tổng chênh lệch Nhóm B**: +146,118,000đ (stored đang cao hơn SUM)

---

## Tại sao Nhóm B có SUM(signed) âm?

Nhóm B có `SUM(signed transactions) < 0` — nghĩa là tổng WITHDRAW đã vượt DEPOSIT. Điều này xảy ra vì **Migration 063 Step 1 đã xóa oan các dòng DEPOSIT/WITHDRAW hợp lệ** (234 dòng), làm cho phép tính SUM còn thiếu các dòng DEPOSIT balancing.

Ví dụ: ví có DEPOSIT +1M, WITHDRAW -500K → balance thực 500K. Migration 063 xóa oan dòng DEPOSIT → còn WITHDRAW -500K → SUM = -500K (âm). Nhưng balance thực tế trước migration là 500K (trước khi bị bơm).

→ **Không thể chỉ dùng SUM để fix** cho Nhóm B. Cần khôi phục dữ liệu wallet_transactions bị xóa trước.

---

## Recovery plan đề xuất

1. **Khôi phục 234 dòng wallet_transactions đã xóa**:
   - Option 1: Restore từ DB snapshot/backup trước 2026-04-22 (nếu Render có)
   - Option 2: Reconstruct từ `customer_activities` có `activity_type='WALLET_WITHDRAW'` + order history
   - Option 3: Manual review từng ca một

2. **Sau khi khôi phục wallet_transactions, recalc balance**:
   ```sql
   UPDATE customer_wallets cw
   SET balance = COALESCE((
       SELECT SUM(
           CASE
               WHEN wt.type='DEPOSIT' THEN ABS(wt.amount)
               WHEN wt.type='WITHDRAW' THEN -ABS(wt.amount)
               WHEN wt.type='ADJUSTMENT' THEN wt.amount
               ELSE 0
           END
       )
       FROM wallet_transactions wt
       WHERE wt.phone = cw.phone
         AND wt.type IN ('DEPOSIT','WITHDRAW','ADJUSTMENT')
   ), 0)
   WHERE cw.phone IN (/* list of 93 affected phones */);
   ```

3. **Verify với customer** trước khi áp dụng nếu amount lớn (>1M).

---

*Generated by `_export-affected-wallets.js` at 2026-04-23T03:53:09.025Z*
