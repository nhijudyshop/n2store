// =====================================================
// EXPORT FUNCTIONALITY
// =====================================================

function exportToExcel() {
    const cachedData = getCachedData();
    if (!cachedData || cachedData.length === 0) {
        showError("Không có dữ liệu để xuất");
        return;
    }

    showLoading("Đang tạo file Excel...");

    try {
        const filteredData = applyFiltersToInventory(cachedData);

        const excelData = filteredData.map((order) => ({
            "Loại sản phẩm": "Có thể lưu trữ",
            "Mã sản phẩm": order.maSanPham?.toString() || "",
            "Mã chốt đơn": "",
            "Tên sản phẩm": order.tenSanPham?.toString() || "",
            "Giá bán": (order.giaBan || 0) * 1000,
            "Giá mua": (order.giaMua || order.giaNhap || 0) * 1000,
            "Đơn vị": "CÁI",
            "Nhóm sản phẩm": "QUẦN ÁO",
            "Mã vạch": order.maSanPham?.toString() || "",
            "Khối lượng": "",
            "Chiết khấu bán": "",
            "Chiết khấu mua": "",
            "Tồn kho": "",
            "Giá vốn": "",
            "Ghi chú": order.ghiChu || "",
            "Cho phép bán ở công ty khác": "FALSE",
            "Thuộc tính": "",
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Đặt Hàng");

        const fileName = `DatHang_${new Date().toLocaleDateString("vi-VN").replace(/\//g, "-")}.xlsx`;
        XLSX.writeFile(wb, fileName);

        hideFloatingAlert();
        showSuccess("Xuất Excel thành công!");
    } catch (error) {
        console.error("Error exporting Excel:", error);
        showError("Lỗi khi xuất Excel!");
        hideFloatingAlert();
    }
}

console.log("Export functionality loaded");
