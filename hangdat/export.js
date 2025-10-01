// =====================================================
// EXPORT FUNCTIONALITY
// =====================================================

function exportToExcel() {
    const cachedData = getCachedData();
    if (!cachedData || cachedData.length === 0) {
        notifyManager.warning("Không có dữ liệu để xuất");
        return;
    }

    const notifId = notifyManager.processing("Đang tạo file Excel...");

    try {
        const filteredData = applyFiltersToInventory(cachedData);

        const excelData = filteredData.map((order) => ({
            "Loại sản phẩm": "Có thể lưu trữ",
            "Mã sản phẩm": order.maSanPham?.toString() || undefined,
            "Mã chốt đơn": undefined,
            "Tên sản phẩm": order.tenSanPham?.toString() || undefined,
            "Giá bán": (order.giaBan || 0) * 1000,
            "Giá mua": (order.giaMua || order.giaNhap || 0) * 1000,
            "Đơn vị": "CÁI",
            "Nhóm sản phẩm": "QUẦN ÁO",
            "Mã vạch": order.maSanPham?.toString() || undefined,
            "Khối lượng": undefined,
            "Chiết khấu bán": undefined,
            "Chiết khấu mua": undefined,
            "Tồn kho": undefined,
            "Giá vốn": undefined,
            "Ghi chú": order.ghiChu || undefined,
            "Cho phép bán ở công ty khác": "FALSE",
            "Thuộc tính": undefined,
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Đặt Hàng");

        const fileName = `DatHang_${new Date().toLocaleDateString("vi-VN").replace(/\//g, "-")}.xlsx`;
        XLSX.writeFile(wb, fileName);

        notifyManager.remove(notifId);
        notifyManager.success(
            `Đã xuất ${filteredData.length} sản phẩm ra Excel!`,
        );
    } catch (error) {
        console.error("Error exporting Excel:", error);
        notifyManager.remove(notifId);
        notifyManager.error("Lỗi khi xuất Excel!");
    }
}
