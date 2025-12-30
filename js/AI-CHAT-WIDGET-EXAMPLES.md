# 🎯 AI Chat Widget - Examples & Use Cases

Tài liệu này cung cấp các ví dụ thực tế về cách AI Chat Widget sử dụng Page Context để trả lời câu hỏi.

---

## 📦 Example 1: Trang Quản Lý Sản Phẩm

### Scenario
User đang ở trang `/sanphamlive/index.html` và có:
- 142 sản phẩm trong bảng
- Đang search "iPhone 15"
- Filter "Danh mục" = "Điện thoại"
- Đang chọn row "iPhone 15 Pro Max 256GB"

### User hỏi: "Sản phẩm này giá bao nhiêu?"

### Context được gửi:
```
[CONTEXT - Trang hiện tại]
- Loại trang: product
- Tiêu đề: Quản lý sản phẩm - N2Store
- Heading: Danh sách sản phẩm Live
- User: Admin (admin)
- Đang tìm kiếm: "iPhone 15"
- Filters đang áp dụng: {"Danh mục":"Điện thoại"}

[Sản phẩm]
- Tổng số: 142
- Đang chọn: iPhone 15 Pro Max 256GB | 29,990,000đ | Còn 15 | Online
- Một số sản phẩm trên trang:
  1. iPhone 15 Pro Max 256GB | 29,990,000đ | Còn 15
  2. iPhone 15 Pro 128GB | 26,990,000đ | Còn 23
  3. iPhone 15 Plus 256GB | 23,990,000đ | Còn 8
  4. iPhone 15 128GB | 18,990,000đ | Còn 42
  5. Galaxy S24 Ultra 256GB | 27,990,000đ | Còn 5

[CÂU HỎI CỦA USER]
Sản phẩm này giá bao nhiêu?
```

### AI trả lời:
> Sản phẩm **iPhone 15 Pro Max 256GB** mà bạn đang chọn có giá **29,990,000đ**. Hiện còn **15 chiếc** trong kho và đang ở trạng thái **Online**.

### Giải thích:
- AI hiểu "sản phẩm này" = sản phẩm đang được chọn
- Không cần user nói rõ tên sản phẩm
- AI trả lời dựa trên `selectedProduct` trong context

---

## 🛒 Example 2: Trang Đơn Hàng với Filters

### Scenario
User ở trang `/order-management/order-list.html`:
- 248 đơn hàng tổng cộng
- Filter "Trạng thái" = "Hoàn thành"
- Filter "Ngày" = "Hôm nay"
- Stat cards hiển thị:
  - Tổng doanh thu: 45,500,000đ
  - Số đơn: 32
  - Trung bình: 1,421,875đ

### User hỏi: "Doanh thu hôm nay thế nào?"

### Context được gửi:
```
[CONTEXT - Trang hiện tại]
- Loại trang: order
- Tiêu đề: Quản lý đơn hàng - N2Store
- User: Admin (admin)
- Filters đang áp dụng: {"Trạng thái":"Hoàn thành","Ngày":"Hôm nay"}

[Đơn hàng]
- Tổng số: 248
- Thống kê: {"Tổng doanh thu":"45,500,000đ","Số đơn":"32","Trung bình":"1,421,875đ"}

[CÂU HỎI CỦA USER]
Doanh thu hôm nay thế nào?
```

### AI trả lời:
> Doanh thu hôm nay (các đơn **Hoàn thành**):
> - **Tổng doanh thu**: 45,500,000đ
> - **Số đơn**: 32 đơn
> - **Giá trị trung bình**: 1,421,875đ/đơn
>
> Khá tốt! 👍

### Giải thích:
- AI biết user đang filter "Hôm nay" + "Hoàn thành"
- Trả lời dựa trên stats từ stat cards
- Context-aware, không trả lời sai về toàn bộ 248 đơn

---

## 🔍 Example 3: Tìm Kiếm Sản Phẩm

### Scenario
User đang search "MacBook" trên trang sản phẩm:
- Search box có value: "MacBook"
- Kết quả: 8 sản phẩm
- Không chọn sản phẩm nào

### User hỏi: "Cái nào RAM 16GB?"

### Context được gửi:
```
[CONTEXT - Trang hiện tại]
- Loại trang: product
- Đang tìm kiếm: "MacBook"

[Sản phẩm]
- Tổng số: 8
- Một số sản phẩm trên trang:
  1. MacBook Air M2 8GB 256GB | 26,990,000đ
  2. MacBook Air M2 16GB 512GB | 32,990,000đ
  3. MacBook Pro M3 16GB 512GB | 42,990,000đ
  4. MacBook Pro M3 Max 32GB 1TB | 69,990,000đ
  5. MacBook Air M1 8GB 256GB | 22,990,000đ

[CÂU HỎI CỦA USER]
Cái nào RAM 16GB?
```

### AI trả lời:
> Trong kết quả tìm kiếm "MacBook", các model có **RAM 16GB** là:
>
> 1. **MacBook Air M2 16GB 512GB** - 32,990,000đ
> 2. **MacBook Pro M3 16GB 512GB** - 42,990,000đ
>
> Nếu cần tư vấn thêm về sự khác biệt giữa Air và Pro, hỏi tôi nhé!

### Giải thích:
- AI hiểu "cái nào" = trong kết quả search "MacBook"
- Lọc ra những sản phẩm có 16GB RAM
- Context giúp AI không trả lời về toàn bộ kho hàng

---

## 📊 Example 4: Trang Báo Cáo (Report)

### Scenario
User ở `/orders-report/main.html`:
- Tab đang active: "Thống kê"
- Filters: Tháng 12/2024
- Stat cards:
  - Doanh thu: 456M
  - Tăng trưởng: +23%
  - Top sản phẩm: iPhone 15 Pro

### User hỏi: "So với tháng trước tăng bao nhiêu?"

### Context được gửi:
```
[CONTEXT - Trang hiện tại]
- Loại trang: report
- Tiêu đề: Báo cáo đơn hàng - N2Store
- Filters đang áp dụng: {"Tháng":"12/2024"}

[Đơn hàng]
- Thống kê: {"Doanh thu":"456M","Tăng trưởng":"+23%","Top sản phẩm":"iPhone 15 Pro"}

[CÂU HỎI CỦA USER]
So với tháng trước tăng bao nhiêu?
```

### AI trả lời:
> Tháng 12/2024 so với tháng trước:
> - **Tăng trưởng**: +23%
> - **Doanh thu hiện tại**: 456M
> - **Top sản phẩm**: iPhone 15 Pro
>
> Tăng trưởng rất tốt! 🚀

### Giải thích:
- AI đọc được stat "Tăng trưởng: +23%"
- Hiểu context là "Tháng 12/2024"
- Trả lời chính xác không cần user giải thích thêm

---

## 👥 Example 5: Trang Khách Hàng

### Scenario
User ở `/customer-management/index.html`:
- 1,234 khách hàng tổng
- Search: "Nguyễn"
- Kết quả: 142 khách

### User hỏi: "Có bao nhiêu người?"

### Context được gửi:
```
[CONTEXT - Trang hiện tại]
- Loại trang: customer
- Tiêu đề: Quản lý khách hàng
- Đang tìm kiếm: "Nguyễn"

[Khách hàng]
- Tổng số: 142

[CÂU HỎI CỦA USER]
Có bao nhiêu người?
```

### AI trả lời:
> Trong kết quả tìm kiếm "Nguyễn", có **142 khách hàng**.

### Giải thích:
- AI hiểu "có bao nhiêu người" = số khách hàng trong kết quả tìm kiếm
- Không trả lời 1,234 (tổng toàn bộ) vì biết user đang search
- Context-aware response

---

## 🎮 Example 6: Multiple Filters Active

### Scenario
User ở trang đơn hàng với nhiều filters:
- Trạng thái: "Đang xử lý"
- Nguồn: "Facebook"
- Nhân viên: "Hương"
- Ngày: "Tuần này"
- Kết quả: 18 đơn

### User hỏi: "Tất cả đơn này là của Hương à?"

### Context được gửi:
```
[CONTEXT - Trang hiện tại]
- Loại trang: order
- Filters đang áp dụng: {"Trạng thái":"Đang xử lý","Nguồn":"Facebook","Nhân viên":"Hương","Ngày":"Tuần này"}

[Đơn hàng]
- Tổng số: 18

[CÂU HỎI CỦA USER]
Tất cả đơn này là của Hương à?
```

### AI trả lời:
> Đúng rồi! Tất cả **18 đơn** đang hiển thị là của nhân viên **Hương**, với điều kiện:
> - ✅ Trạng thái: Đang xử lý
> - ✅ Nguồn: Facebook
> - ✅ Thời gian: Tuần này
>
> Bạn đang filter theo nhân viên "Hương" đấy.

### Giải thích:
- AI đọc được tất cả filters đang active
- Hiểu rõ context của câu hỏi
- Xác nhận và giải thích lại filters cho user

---

## 🚫 Example 7: No Context Available

### Scenario
User ở trang `/api/test.html` (trang không có trong danh sách):
- Page type: `general`
- Không có products, orders, customers data

### User hỏi: "Có bao nhiêu sản phẩm?"

### Context được gửi:
```
[CONTEXT - Trang hiện tại]
- Loại trang: general
- Tiêu đề: API Test Page

[CÂU HỎI CỦA USER]
Có bao nhiêu sản phẩm?
```

### AI trả lời:
> Tôi không thể xem được dữ liệu sản phẩm từ trang này (API Test Page). Bạn có thể vào **Quản lý sản phẩm** để xem danh sách sản phẩm nhé!

### Giải thích:
- AI biết trang hiện tại không phải trang product
- Không có productData trong context
- Gợi ý user đến đúng trang

---

## 🎨 Example 8: Với File Attachment

### Scenario
User ở trang sản phẩm và upload hình ảnh sản phẩm mới:
- User paste ảnh "iPhone mới"
- Hỏi: "Sản phẩm này có trong danh sách chưa?"

### Context được gửi:
```
[CONTEXT - Trang hiện tại]
- Loại trang: product

[Sản phẩm]
- Tổng số: 142
- Một số sản phẩm trên trang:
  1. iPhone 15 Pro Max 256GB
  2. iPhone 15 Pro 128GB
  3. iPhone 15 Plus 256GB
  ...

[CÂU HỎI CỦA USER]
Sản phẩm này có trong danh sách chưa?

[ẢNH ĐÍNH KÈM]
(hình iPhone mới)
```

### AI trả lời:
> Dựa vào hình ảnh, đây là **iPhone 16 Pro**. Tôi thấy trong danh sách hiện tại chỉ có iPhone 15 series. Sản phẩm này **chưa có** trong kho.
>
> Bạn muốn thêm sản phẩm mới này không?

### Giải thích:
- AI xem ảnh + đọc context danh sách sản phẩm
- So sánh và đưa ra kết luận
- Multimodal + Context = Powerful!

---

## 🔄 Example 9: Conversation với Context

### Scenario - Multi-turn conversation:

**Turn 1:**
```
User: "Có bao nhiêu đơn hôm nay?"
Context: Filter = "Hôm nay", totalCount = 45
AI: "Hôm nay có 45 đơn hàng."
```

**Turn 2:**
```
User: "Bao nhiêu đơn hoàn thành?"
User bật filter "Hoàn thành"
Context: Filter = "Hôm nay" + "Hoàn thành", totalCount = 32
AI: "Trong 45 đơn hôm nay, có 32 đơn đã hoàn thành."
```

**Turn 3:**
```
User: "Tổng tiền là bao nhiêu?"
Context: Stats = {"Tổng":"15,500,000đ"}
AI: "Tổng doanh thu của 32 đơn hoàn thành hôm nay là 15,500,000đ."
```

### Giải thích:
- Mỗi turn, context được update theo filter hiện tại
- AI luôn trả lời dựa trên context mới nhất
- Conversation flow tự nhiên hơn

---

## ⚡ Example 10: Realtime Updates

### Scenario
User đang xem trang sản phẩm:

**Lúc đầu:**
- Tổng: 142 sản phẩm
- User hỏi: "Có bao nhiêu sản phẩm?"
- AI: "142 sản phẩm"

**User thêm filter "Danh mục = Điện thoại":**
- Tổng: 38 sản phẩm (sau khi filter)
- User hỏi lại: "Có bao nhiêu sản phẩm?"
- AI: "Với filter 'Danh mục: Điện thoại', có 38 sản phẩm."

### Giải thích:
- Context được extract realtime mỗi lần send message
- Không cache, luôn lấy dữ liệu mới nhất
- Đảm bảo câu trả lời chính xác với trạng thái hiện tại

---

## 🎯 Key Takeaways

### ✅ Những gì AI có thể làm với Context:

1. **Hiểu "này", "đó", "cái này"** - Refer đến item đang chọn
2. **Đọc filters đang active** - Trả lời đúng với điều kiện lọc
3. **Biết user đang search gì** - Scope câu trả lời vào kết quả search
4. **Đọc stats từ dashboard** - Trả lời về metrics
5. **So sánh items** - Dựa vào danh sách hiện có
6. **Gợi ý actions** - Dựa vào page type

### ❌ Những gì AI KHÔNG thể làm:

1. **Thay đổi data** - Chỉ đọc, không ghi
2. **Execute actions** - Không thể click button, submit form
3. **Access full database** - Chỉ thấy data trên trang hiện tại
4. **Remember old context** - Mỗi message lấy context mới
5. **Real-time updates** - Context chỉ update khi user gửi message

---

## 🛠️ Tips for Best Results

### Cho Users:

1. **Hỏi ngắn gọn** - AI đã có context, không cần giải thích dài
   - ❌ "Trong danh sách sản phẩm iPhone 15 có bao nhiêu cái?"
   - ✅ "Có bao nhiêu sản phẩm?" (AI biết bạn đang search iPhone 15)

2. **Sử dụng "này", "đó"** - Refer đến items đang chọn
   - ✅ "Sản phẩm này giá bao nhiêu?"
   - ✅ "Đơn này của ai?"

3. **Bật filters trước khi hỏi** - AI sẽ trả lời theo filters
   - Bật filter "Hoàn thành" → Hỏi "Tổng tiền?"
   - AI tính tổng của các đơn hoàn thành

### Cho Developers:

1. **Customize selectors** - Nếu DOM structure khác
   ```javascript
   // Trong extractProductData()
   const rows = document.querySelectorAll('table tbody tr, .product-item, .your-custom-class');
   ```

2. **Add more page types** - Extend `detectPageType()`
   ```javascript
   if (path.includes('your-page')) {
       return 'your-custom-type';
   }
   ```

3. **Extract more data** - Create custom extractors
   ```javascript
   function extractYourData() {
       // Your custom logic
   }
   ```

---

## 📚 More Examples

Xem thêm examples tại:
- `/js/ai-chat-widget.js` - Source code
- `/js/AI-CHAT-WIDGET.md` - Full documentation
- DevTools Console - Debug context realtime

---

*Cập nhật: 2025-12-30*
