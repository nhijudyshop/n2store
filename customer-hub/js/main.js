// main.js - Entry point for Customer 360 Hub
import { PermissionHelper } from './utils/permissions.js';
import { CustomerSearchModule } from './modules/customer-search.js';
import { CustomerProfileModule } from './modules/customer-profile.js';
import { LinkBankTransactionModule } from './modules/link-bank-transaction.js';
import { TransactionActivityModule } from './modules/transaction-activity.js'; // NEW: Import TransactionActivityModule
import { WalletPanelModule } from './modules/wallet-panel.js';
import { TicketListModule } from './modules/ticket-list.js';
// Ensure API_CONFIG is loaded before apiService for proper initialization
import '../config.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("Customer 360 Hub loaded!");

    // Initialize PermissionHelper (replace with actual user permissions fetching)
    // For now, providing full permissions for demonstration
    const currentUserPermissions = {
        'customer-hub': {
            view: true,
            viewWallet: true,
            manageWallet: true,
            viewTickets: true,
            createTicket: true,
            viewActivities: true,
            addNote: true,
            editCustomer: true,
            linkTransactions: true,
        }
    };
    const permissionHelper = new PermissionHelper(currentUserPermissions);
    console.log("PermissionHelper initialized:", permissionHelper);

    // Theme Toggle
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const htmlTag = document.documentElement;

    // Check for saved theme preference
    if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        htmlTag.classList.add('dark');
        themeIcon.textContent = 'light_mode';
        // Removed text content update for theme toggle as per new UI (only icon changes)
    } else {
        themeIcon.textContent = 'dark_mode';
        // Removed text content update for theme toggle as per new UI (only icon changes)
    }

    themeToggleBtn.addEventListener('click', () => {
        htmlTag.classList.toggle('dark');
        if (htmlTag.classList.contains('dark')) {
            localStorage.setItem('theme', 'dark');
            themeIcon.textContent = 'light_mode';
        } else {
            localStorage.setItem('theme', 'light');
            themeIcon.textContent = 'dark_mode';
        }
    });

    // Removed Sidebar Toggle for Mobile logic

    // --- Routing Logic ---
    const appContent = document.getElementById('app-content');
    const tabLinks = document.querySelectorAll('.tab-link'); // Changed from navLinks to tabLinks

    // Store module instances to avoid re-instantiation if needed
    const moduleInstances = {};

    function loadModule(moduleName, containerId, ...args) {
        if (!moduleInstances[moduleName]) {
            // Dynamically import to avoid loading all modules at once
            switch (moduleName) {
                case 'CustomerSearchModule':
                    moduleInstances[moduleName] = new CustomerSearchModule(containerId, permissionHelper);
                    break;
                case 'CustomerProfileModule':
                    moduleInstances[moduleName] = new CustomerProfileModule(containerId, permissionHelper);
                    break;
                case 'LinkBankTransactionModule':
                    moduleInstances[moduleName] = new LinkBankTransactionModule(containerId, permissionHelper);
                    break;
                case 'TransactionActivityModule': // NEW: Add TransactionActivityModule
                    moduleInstances[moduleName] = new TransactionActivityModule(containerId, permissionHelper);
                    break;
                case 'WalletPanelModule':
                    moduleInstances[moduleName] = new WalletPanelModule(containerId, permissionHelper);
                    break;
                case 'TicketListModule':
                    moduleInstances[moduleName] = new TicketListModule(containerId, permissionHelper);
                    break;
                // Add other modules here
            }
        }
        return moduleInstances[moduleName];
    }

    const routes = {
        'customer-search': () => {
            if (permissionHelper.hasPageAccess('customer-hub')) {
                appContent.innerHTML = `<div id="customer-search-container"></div>`;
                loadModule('CustomerSearchModule', 'customer-search-container');
            } else {
                appContent.innerHTML = `<p class="text-red-500">Bạn không có quyền truy cập chức năng này.</p>`;
            }
            setActiveTabLink('customer-search-tab'); // Updated function call
        },
        'customer-profile': (phone) => {
            if (permissionHelper.hasPageAccess('customer-hub')) {
                appContent.innerHTML = `<div id="customer-profile-container"></div>`;
                const profileModule = loadModule('CustomerProfileModule', 'customer-profile-container');
                profileModule.render(phone);
            } else {
                appContent.innerHTML = `<p class="text-red-500">Bạn không có quyền truy cập trang chi tiết khách hàng.</p>`;
            }
            // No active tab link for specific customer profile view
            tabLinks.forEach(link => link.classList.remove('active-link', 'text-primary', 'border-primary')); // Deactivate all
            tabLinks.forEach(link => {
                link.classList.add('text-gray-500', 'hover:text-primary', 'border-border-light');
            });
        },
        'transaction-activity': () => { // NEW: Transaction Activity Route
            if (permissionHelper.hasPermission('customer-hub', 'viewActivities')) { // Assuming 'viewActivities' permission for this module
                appContent.innerHTML = `<div id="transaction-activity-container"></div>`;
                loadModule('TransactionActivityModule', 'transaction-activity-container');
            } else {
                appContent.innerHTML = `<p class="text-red-500">Bạn không có quyền truy cập chức năng hoạt động giao dịch tổng hợp.</p>`;
            }
            setActiveTabLink('transaction-activity-tab'); // Updated function call
        },
        'unlinked-transactions': () => { // Renamed from 'bank-transactions' to 'unlinked-transactions' as per new UI
            if (permissionHelper.hasPermission('customer-hub', 'linkTransactions')) {
                appContent.innerHTML = `<div id="unlinked-transactions-container"></div>`;
                loadModule('LinkBankTransactionModule', 'unlinked-transactions-container'); // Retaining existing module
            } else {
                appContent.innerHTML = `<p class="text-red-500">Bạn không có quyền truy cập chức năng giao dịch chưa liên kết.</p>`;
            }
            setActiveTabLink('unlinked-transactions-tab'); // Updated function call
        },
    };

    function setActiveTabLink(tabId) { // Renamed function
        tabLinks.forEach(link => {
            link.classList.remove('active-link', 'text-primary', 'border-primary');
            link.classList.add('bg-white', 'dark:bg-surface-dark', 'text-gray-500', 'hover:text-primary', 'font-semibold', 'hover:bg-gray-100', 'dark:hover:bg-gray-700', 'border-l', 'border-t', 'border-r', 'border-border-light', 'dark:border-border-dark');
        });
        const activeLink = document.getElementById(tabId);
        if (activeLink) {
            activeLink.classList.add('active-link', 'text-primary', 'border-primary');
            activeLink.classList.remove('bg-white', 'dark:bg-surface-dark', 'text-gray-500', 'hover:text-primary', 'font-semibold', 'hover:bg-gray-100', 'dark:hover:bg-gray-700', 'border-l', 'border-t', 'border-r', 'border-border-light', 'dark:border-border-dark');
            // Re-add specific classes for active tab for proper styling
            activeLink.classList.add('bg-white', 'dark:bg-surface-dark', 'inline-block', 'py-2', 'px-4', 'text-primary', 'font-semibold', 'border-l', 'border-t', 'border-r', 'border-primary', 'rounded-t-lg');
        }
    }

    function handleHashChange() {
        const hash = window.location.hash.slice(1); // Remove '#'
        if (hash.startsWith('customer/')) {
            const phone = hash.split('/')[1];
            routes['customer-profile'](phone);
        } else if (hash === '' || hash === 'customer-search') { // Default to customer-search
            routes['customer-search']();
        } else if (hash === 'transaction-activity') { // NEW: Transaction Activity
            routes['transaction-activity']();
        } else if (hash === 'unlinked-transactions') { // NEW: Unlinked Transactions
            routes['unlinked-transactions']();
        } else {
            appContent.innerHTML = `<h2 class="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Trang không tìm thấy.</h2><p>Đường dẫn không hợp lệ: ${hash}</p>`;
        }
    }

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);

    // Initial load
    handleHashChange();

    // Update tab links to use hash
    tabLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = link.id; // Get the ID of the clicked tab
            let hash = '';
            switch (tabId) {
                case 'customer-search-tab':
                    hash = 'customer-search';
                    break;
                case 'transaction-activity-tab':
                    hash = 'transaction-activity';
                    break;
                case 'unlinked-transactions-tab':
                    hash = 'unlinked-transactions';
                    break;
                default:
                    hash = 'customer-search'; // Fallback
            }
            if (hash) {
                window.location.hash = hash;
            }
            // Removed sidebar close logic
        });
    });

    // Set initial content to Customer Search if no hash is present or handle the current hash
    if (!window.location.hash || window.location.hash === '#dashboard') { // Default to customer-search
        window.location.hash = 'customer-search';
    }
});
