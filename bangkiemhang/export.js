// =====================================================
// EXPORT FUNCTIONALITY
// =====================================================

function exportToExcel() {
    const cachedData = getCachedData();
    if (!cachedData || cachedData.length === 0) {
        showFloatingAlert("Không có dữ liệu để xuất", false, 3000);
        return;
    }

    showFloatingAlert("Đang tạo file Excel...", true);

    try {
        const filteredData = applyFiltersToInventory(cachedData);
        const excelData = filteredData.map((item, index) => ({
            STT: index + 1,
            "Ngày đặt hàng": item.ngayDatHang || "",
            "Nhà cung cấp": item.nhaCungCap || "",
            "Ngày nhận hàng": item.ngayNhan || "",
            "Mã sản phẩm": item.maSanPham || "",
            "Tên sản phẩm": item.tenSanPham || "",
            "Số lượng đặt": item.soLuong || 0,
            "Thực nhận": item.thucNhan || 0,
            "Tổng nhận": item.tongNhan || 0,
            "Cập nhật lúc": item.lastUpdated || "",
            "Người cập nhật": item.updatedBy || "",
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);

        // Auto-fit column widths
        const colWidths = [];
        const headers = Object.keys(excelData[0] || {});
        headers.forEach((header, i) => {
            const maxLength = Math.max(
                header.length,
                ...excelData.map((row) => String(row[header] || "").length),
            );
            colWidths[i] = { width: Math.min(maxLength + 2, 50) };
        });
        ws["!cols"] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Kiểm Hàng");

        const fileName = `KiemHang_${new Date().toLocaleDateString("vi-VN").replace(/\//g, "-")}_${new Date().getHours()}h${new Date().getMinutes()}.xlsx`;
        XLSX.writeFile(wb, fileName);

        hideFloatingAlert();
        showFloatingAlert("Xuất Excel thành công!", false, 2000);

        // Log export action
        logAction(
            "export",
            `Xuất Excel file "${fileName}" với ${filteredData.length} sản phẩm`,
        );
    } catch (error) {
        console.error("Lỗi khi xuất Excel:", error);
        hideFloatingAlert();
        showFloatingAlert("Lỗi khi xuất Excel: " + error.message, false, 3000);
    }
}

console.log("Export functionality loaded");
