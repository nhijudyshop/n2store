# Hướng dẫn sử dụng Sổ Quỹ (dựa trên KiotViet)

Tính năng Sổ quỹ giúp quản lý dòng tiền tập trung, minh bạch, kiểm soát chính xác thu chi, công nợ và hạch toán kinh doanh hiệu quả.

## I. Các thao tác cơ bản

### 1. Lập phiếu thu/chi thủ công
Sử dụng khi cần ghi nhận khoản thu/chi không phát sinh từ giao dịch bán hàng/nhập hàng (ví dụ: thu tiền thuê mặt bằng, chi mua văn phòng phẩm).

**Các bước thực hiện:**
1. Mở màn hình quản lý, chọn **Sổ Quỹ**.
2. Chọn tab Tiền mặt/Ngân hàng/Ví điện tử, nhấn **+ Phiếu thu** hoặc **+ Phiếu chi**.
3. Điền thông tin:
    *   **Loại thu/chi**: Chọn từ danh sách.
    *   **Đối tượng**: Chọn đối tượng phù hợp.
    *   **Tên người nộp/nhận**: Nhập hoặc chọn tên.
    *   **Số tiền**: Nhập số tiền giao dịch.
    *   **Ghi chú**: (Tùy chọn).
4. Tích chọn **Hạch toán vào kết quả kinh doanh** nếu muốn tính vào báo cáo tài chính.
5. Nhấn **Lưu** hoặc **Lưu & In**.

### 2. Chuyển quỹ nội bộ
Sử dụng khi luân chuyển tiền giữa các quỹ (ví dụ: rút tiền mặt nộp ngân hàng) hoặc giữa các chi nhánh.
*   **Gửi tiền vào ngân hàng**: Lập *Phiếu chi* > *Chuyển/Rút* tại quỹ tiền mặt, chọn tài khoản nhận là tài khoản ngân hàng. Hệ thống tự động tự tạo *Phiếu thu* bên Sổ quỹ ngân hàng.
*   **Chuyển tiền chi nhánh**: Lập *Phiếu chi* > *Chuyển quỹ nội bộ* tại chi nhánh chuyển. Hệ thống tự tạo *Phiếu thu* tại chi nhánh nhận.

## II. Các tính năng nâng cao

### 1. Cập nhật, Hủy bỏ phiếu
*   **Cập nhật**: Tìm phiếu cần sửa, chọn **Mở phiếu**. Sửa thông tin (Thời gian, Người nộp/chi, Số tiền, Ghi chú...) rồi lưu lại.
*   **Hủy bỏ**: Tìm và mở phiếu cần hủy, nhấn **Hủy** -> **Đồng ý**.

### 2. Tìm kiếm, Sắp xếp và Xuất file
*   **Tìm kiếm**: Sử dụng bộ lọc bên trái hoặc thanh tìm kiếm để lọc theo: Mã phiếu, Loại chứng từ (Phiếu thu/chi), Trạng thái (Đã thanh toán/Đã hủy), Người tạo, Nhân viên...
*   **Sắp xếp**: Click vào tiêu đề cột để sắp xếp tăng/giảm dần.
*   **Xuất file**: Nhấn nút **Xuất file** để tải danh sách dạng Excel.

## III. Giao diện (UI)

*Tài liệu này là cơ sở để thiết kế giao diện Sổ Quỹ trong hệ thống n2store, đảm bảo đầy đủ các tính năng lọc, hiển thị danh sách và các modal tạo/sửa phiếu.*
