// customer-hub/js/modules/customer-search.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js'; // Adjust path if necessary

export class CustomerSearchModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.initUI();
    }

    initUI() {
        this.container.innerHTML = `
            <div class="bg-surface-light dark:bg-surface-dark rounded-lg shadow-soft p-6 mb-6">
                <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Tìm kiếm khách hàng</h2>
                <div class="flex flex-col md:flex-row gap-4 mb-4">
                    <input type="text" id="customer-search-input" placeholder="Nhập SĐT, tên, email..."
                           class="flex-grow p-2 rounded-md border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 shadow-sm">
                    <button id="customer-search-button"
                            class="bg-primary hover:bg-primary-hover text-white font-semibold py-2 px-4 rounded-md shadow-soft transition-colors duration-200">
                        <span class="material-symbols-outlined align-middle">search</span> Tìm kiếm
                    </button>
                    <button id="customer-add-button"
                            class="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md shadow-soft transition-colors duration-200">
                        <span class="material-symbols-outlined align-middle">person_add</span> Thêm mới
                    </button>
                </div>
                <div id="customer-search-results">
                    <!-- Results table will be rendered here -->
                    <p class="text-gray-500 dark:text-gray-400">Không có kết quả tìm kiếm nào.</p>
                </div>
            </div>
        `;

        this.searchInput = this.container.querySelector('#customer-search-input');
        this.searchButton = this.container.querySelector('#customer-search-button');
        this.addCustomerButton = this.container.querySelector('#customer-add-button');
        this.searchResultsDiv = this.container.querySelector('#customer-search-results');

        this.searchButton.addEventListener('click', () => this.performSearch());
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });

        // Check permission for adding new customer
        if (!this.permissionHelper.hasPermission('customer-hub', 'editCustomer')) { // Assuming 'editCustomer' permission allows adding
            this.addCustomerButton.style.display = 'none';
        }

        // TODO: Implement add new customer modal/form
        this.addCustomerButton.addEventListener('click', () => {
            alert('Chức năng thêm khách hàng mới đang được phát triển!');
        });
    }

    async performSearch() {
        const query = this.searchInput.value.trim();
        if (query.length < 2) {
            this.searchResultsDiv.innerHTML = `<p class="text-red-500">Vui lòng nhập ít nhất 2 ký tự để tìm kiếm.</p>`;
            return;
        }

        this.searchResultsDiv.innerHTML = `<p class="text-blue-500 dark:text-blue-400">Đang tìm kiếm...</p>`;
        try {
            const response = await apiService.searchCustomers(query);
            if (response.success && response.data.length > 0) {
                this.renderResults(response.data);
            } else {
                this.searchResultsDiv.innerHTML = `<p class="text-gray-500 dark:text-gray-400">Không tìm thấy khách hàng nào khớp với "${query}".</p>`;
            }
        } catch (error) {
            this.searchResultsDiv.innerHTML = `<p class="text-red-500">Lỗi khi tìm kiếm khách hàng: ${error.message}</p>`;
            console.error('Customer search error:', error);
        }
    }

    renderResults(customers) {
        let tableHtml = `
            <div class="overflow-x-auto">
                <table class="min-w-full bg-surface-light dark:bg-surface-dark rounded-lg shadow-soft">
                    <thead>
                        <tr class="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase text-sm leading-normal">
                            <th class="py-3 px-6 text-left">SĐT</th>
                            <th class="py-3 px-6 text-left">Tên khách hàng</th>
                            <th class="py-3 px-6 text-left">Email</th>
                            <th class="py-3 px-6 text-left">Cấp bậc</th>
                            <th class="py-3 px-6 text-center">Trạng thái</th>
                            <th class="py-3 px-6 text-center">Hành động</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-600 dark:text-gray-400 text-sm font-light">
        `;

        customers.forEach(customer => {
            tableHtml += `
                <tr class="border-b border-border-light dark:border-border-dark hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200">
                    <td class="py-3 px-6 text-left whitespace-nowrap font-mono">${customer.phone}</td>
                    <td class="py-3 px-6 text-left">${customer.name || 'N/A'}</td>
                    <td class="py-3 px-6 text-left">${customer.email || 'N/A'}</td>
                    <td class="py-3 px-6 text-left">${customer.tier || 'Mới'}</td>
                    <td class="py-3 px-6 text-center">
                        <span class="relative inline-block px-3 py-1 font-semibold leading-tight">
                            <span aria-hidden="true" class="absolute inset-0 ${this.getStatusColor(customer.status)} opacity-50 rounded-full"></span>
                            <span class="relative">${customer.status || 'Bình thường'}</span>
                        </span>
                    </td>
                    <td class="py-3 px-6 text-center">
                        <div class="flex item-center justify-center">
                            <button data-phone="${customer.phone}" class="view-customer-btn w-4 mr-2 transform hover:text-primary hover:scale-110">
                                <span class="material-symbols-outlined" title="Xem chi tiết">visibility</span>
                            </button>
                            ${this.permissionHelper.hasPermission('customer-hub', 'editCustomer') ? `
                                <button data-phone="${customer.phone}" class="edit-customer-btn w-4 mr-2 transform hover:text-warning hover:scale-110">
                                    <span class="material-symbols-outlined" title="Chỉnh sửa">edit</span>
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        });

        tableHtml += `
                    </tbody>
                </table>
            </div>
        `;
        this.searchResultsDiv.innerHTML = tableHtml;

        this.searchResultsDiv.querySelectorAll('.view-customer-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const phone = e.currentTarget.dataset.phone;
                // TODO: Implement navigation to customer profile
                alert(`Chuyển đến trang chi tiết khách hàng: ${phone}`);
                // Example: window.location.hash = `#/customer/${phone}`;
            });
        });

        this.searchResultsDiv.querySelectorAll('.edit-customer-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const phone = e.currentTarget.dataset.phone;
                // TODO: Implement edit customer modal/form
                alert(`Chỉnh sửa thông tin khách hàng: ${phone}`);
            });
        });
    }

    getStatusColor(status) {
        switch (status) {
            case 'VIP': return 'bg-yellow-200 text-yellow-900';
            case 'Bình thường': return 'bg-green-200 text-green-900';
            case 'Tiềm năng': return 'bg-blue-200 text-blue-900';
            case 'Đã chặn': return 'bg-red-200 text-red-900';
            default: return 'bg-gray-200 text-gray-900';
        }
    }

    // This method can be called from main.js to render the module content
    render() {
        // The UI is initialized in the constructor, but we might add
        // logic here later to refresh data or manage state if needed.
    }
}
