/**
 * Navigation Manager với Settings Menu - Phiên bản đầy đủ
 * File: navigation.js
 * Dependencies: common-utils.js
 */

// Load common utilities script dynamically
(function() {
    const script = document.createElement('script');
    script.src = '../js/common-utils.js';
    script.async = false;
    document.head.appendChild(script);
})();

// Cấu hình menu items - Đã thêm trang quản lý tài khoản cho admin
const MENU_CONFIG = [
    {
        href: '../live/index.html',
        icon: '📸',
        text: 'HÌNH ẢNH LIVE ĐẦY ĐỦ',
        pageIdentifier: 'live'
    },
    {
        href: '../livestream/index.html',
        icon: '📺',
        text: 'BÁO CÁO LIVESTREAM',
        pageIdentifier: 'livestream'
    },
    {
        href: '../hangrotxa/index.html',
        icon: '📦',
        text: 'HÀNG RỚT - XẢ',
        pageIdentifier: 'hangrotxa'
    },
    {
        href: '../ib/index.html',
        icon: '💬',
        text: 'CHECK INBOX KHÁCH HÀNG',
        pageIdentifier: 'ib'
    },
    {
        href: '../ck/index.html',
        icon: '💳',
        text: 'THÔNG TIN CHUYỂN KHOẢN',
        pageIdentifier: 'ck'
    },
    {
        href: '../hanghoan/index.html',
        icon: '↩️',
        text: 'HÀNG HOÀN',
        pageIdentifier: 'hanghoan'
    },
    {
        href: '../hangdat/index.html',
        icon: '📋',
        text: 'HÀNG ĐẶT',
        pageIdentifier: 'hangdat',
        adminOnly: true
    },
	{
        href: '../bangkiemhang/index.html',
        icon: '✅',
        text: 'BẢNG KIỂM HÀNG',
        pageIdentifier: 'bangkiemhang',
        adminOnly: true
    },
    {
        href: '../user-management/index.html',
        icon: '👥',
        text: 'QUẢN LÝ TÀI KHOẢN',
        pageIdentifier: 'user-management',
        adminOnly: true
    },
    {
        href: '../history/index.html',
        icon: '📊',
        text: 'LỊCH SỬ CHỈNH SỬA',
        pageIdentifier: 'history',
        adminOnly: true
    }
];

/**
 * Global Font Manager tích hợp với Navigation
 */
class IntegratedFontManager {
    constructor() {
        this.currentScale = parseFloat(localStorage.getItem('globalFontScale')) || 1;
        this.minScale = 0.7;
        this.maxScale = 2.0;
        this.step = 0.1;
        
        this.initializeOnLoad();
    }

    initializeOnLoad() {
        // Áp dụng font size ngay khi page load
        this.applyFontSize();
        
        // Lắng nghe thay đổi từ localStorage
        window.addEventListener('storage', (e) => {
            if (e.key === 'globalFontScale') {
                this.currentScale = parseFloat(e.newValue) || 1;
                this.applyFontSize();
                this.updateDisplay();
                this.updatePresetButtons();
            }
        });
        
        console.log('Integrated Font Manager initialized with scale:', this.currentScale);
    }

    setupEventListeners() {
        const decreaseBtn = document.getElementById('sidebarDecreaseFont');
        const increaseBtn = document.getElementById('sidebarIncreaseFont');
        const presetBtns = document.querySelectorAll('.sidebar-preset-btn');

        console.log('Setting up font event listeners:', {
            decreaseBtn: !!decreaseBtn,
            increaseBtn: !!increaseBtn,
            presetBtns: presetBtns.length
        });

        if (decreaseBtn) {
            decreaseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('Decrease font clicked');
                this.changeFontSize(-this.step);
            });
        }
        
        if (increaseBtn) {
            increaseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('Increase font clicked');
                this.changeFontSize(this.step);
            });
        }

        presetBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const scale = parseFloat(btn.dataset.scale);
                console.log('Preset clicked:', scale);
                this.setFontSize(scale);
                this.updatePresetButtons(scale);
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === '=' || e.key === '+') {
                    e.preventDefault();
                    this.changeFontSize(this.step);
                } else if (e.key === '-') {
                    e.preventDefault();
                    this.changeFontSize(-this.step);
                } else if (e.key === '0') {
                    e.preventDefault();
                    this.setFontSize(1);
                    this.updatePresetButtons(1);
                }
            }
        });
    }

    changeFontSize(delta) {
        const newScale = Math.round((this.currentScale + delta) * 10) / 10;
        this.setFontSize(Math.max(this.minScale, Math.min(this.maxScale, newScale)));
        this.updatePresetButtons();
    }

    setFontSize(scale) {
        this.currentScale = scale;
        this.applyFontSize();
        this.updateDisplay();
        this.saveFontSize();
        this.broadcastFontChange();
        console.log('Font size set to:', scale);
    }

    applyFontSize() {
        document.documentElement.style.setProperty('--font-scale', this.currentScale);
        document.documentElement.style.setProperty('--global-font-scale', this.currentScale);
        
        let globalStyle = document.getElementById('globalFontStyle');
        if (!globalStyle) {
            globalStyle = document.createElement('style');
            globalStyle.id = 'globalFontStyle';
            document.head.appendChild(globalStyle);
        }

        globalStyle.textContent = `
            :root {
                --global-font-scale: ${this.currentScale};
                --font-scale: ${this.currentScale};
            }
            
            body {
                font-size: calc(14px * var(--font-scale)) !important;
            }
            
            .main-content {
                font-size: calc(14px * var(--font-scale)) !important;
            }
            
            .ck table, table {
                font-size: calc(14px * var(--font-scale)) !important;
            }
            
            .ck th, .ck td, th, td {
                font-size: calc(12px * var(--font-scale)) !important;
                padding: calc(10px * var(--font-scale)) calc(6px * var(--font-scale)) !important;
            }
            
            input, select, textarea, button {
                font-size: calc(14px * var(--font-scale)) !important;
            }
            
            .tieude, h1, .header h1, .header h2 {
                font-size: calc(2.5rem * var(--font-scale)) !important;
            }
            
            .form-group label, label {
                font-size: calc(14px * var(--font-scale)) !important;
            }
            
            .nav-item a {
                font-size: calc(14px * var(--font-scale)) !important;
                padding: calc(18px * var(--font-scale)) calc(25px * var(--font-scale)) !important;
            }
            
            .modal-content {
                font-size: calc(14px * var(--font-scale)) !important;
            }
            
            .filter-system {
                font-size: calc(14px * var(--font-scale)) !important;
            }
            
            @media (max-width: 768px) {
                .tieude, .header h1, .header h2 {
                    font-size: calc(1.8rem * var(--font-scale)) !important;
                }
                
                .ck th, .ck td, th, td {
                    font-size: calc(10px * var(--font-scale)) !important;
                    padding: calc(6px * var(--font-scale)) calc(3px * var(--font-scale)) !important;
                }
            }
        `;
    }

    updateDisplay() {
        const display = document.getElementById('sidebarFontSizeDisplay');
        const decreaseBtn = document.getElementById('sidebarDecreaseFont');
        const increaseBtn = document.getElementById('sidebarIncreaseFont');
        
        const percentage = `${Math.round(this.currentScale * 100)}%`;
        
        if (display) {
            display.textContent = percentage;
        }
        
        if (decreaseBtn) {
            decreaseBtn.disabled = this.currentScale <= this.minScale;
        }
        
        if (increaseBtn) {
            increaseBtn.disabled = this.currentScale >= this.maxScale;
        }
    }

    updatePresetButtons(activeScale = null) {
        const currentScale = activeScale || this.currentScale;
        const presetBtns = document.querySelectorAll('.sidebar-preset-btn');
        
        presetBtns.forEach(btn => {
            const btnScale = parseFloat(btn.dataset.scale);
            if (Math.abs(btnScale - currentScale) < 0.05) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    saveFontSize() {
        try {
            localStorage.setItem('globalFontScale', this.currentScale.toString());
        } catch (error) {
            console.error('Error saving global font size:', error);
        }
    }

    broadcastFontChange() {
        const event = new CustomEvent('globalFontChanged', {
            detail: { scale: this.currentScale }
        });
        window.dispatchEvent(event);
    }
}

/**
 * Inject CSS styles đầy đủ cho sidebar với settings menu
 */
function injectSidebarStyles() {
    if (document.getElementById('integratedSidebarStyles')) return;

    const styles = document.createElement('style');
    styles.id = 'integratedSidebarStyles';
    styles.textContent = `
        :root {
            --font-scale: 1;
            --global-font-scale: 1;
        }

        /* Menu Toggle Button */
        .menu-toggle {
            position: fixed;
            top: calc(20px * var(--font-scale));
            left: calc(20px * var(--font-scale));
            width: calc(50px * var(--font-scale));
            height: calc(50px * var(--font-scale));
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: none;
            border-radius: 12px;
            cursor: pointer;
            z-index: 1001;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
            transition: all 0.3s ease;
        }

        .menu-toggle:hover {
            transform: scale(1.05);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
        }

        .hamburger {
            position: relative;
            width: calc(24px * var(--font-scale));
            height: calc(2px * var(--font-scale));
            background: white;
            margin: 0 auto;
            transition: all 0.3s ease;
        }

        .hamburger::before,
        .hamburger::after {
            content: "";
            position: absolute;
            width: calc(24px * var(--font-scale));
            height: calc(2px * var(--font-scale));
            background: white;
            transition: all 0.3s ease;
        }

        .hamburger::before {
            top: calc(-8px * var(--font-scale));
        }

        .hamburger::after {
            bottom: calc(-8px * var(--font-scale));
        }

        .menu-toggle.active .hamburger {
            background: transparent;
        }

        .menu-toggle.active .hamburger::before {
            top: 0;
            transform: rotate(45deg);
        }

        .menu-toggle.active .hamburger::after {
            bottom: 0;
            transform: rotate(-45deg);
        }

        /* Overlay */
        .overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
            z-index: 999;
        }

        .overlay.active {
            opacity: 1;
            visibility: visible;
        }

        /* Sidebar */
        .sidebar {
            position: fixed;
            left: calc(-350px * var(--font-scale));
            top: 0;
            width: calc(350px * var(--font-scale));
            height: 100vh;
            background: linear-gradient(180deg, #2c3e50 0%, #34495e 100%);
            box-shadow: 2px 0 15px rgba(0, 0, 0, 0.2);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 1000;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
        }

        .sidebar.open {
            left: 0;
        }

        .sidebar-header {
            padding: calc(30px * var(--font-scale)) calc(20px * var(--font-scale));
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
            position: relative;
            flex-shrink: 0;
        }

        .sidebar-header h3 {
            margin: 0;
            font-size: calc(1.2rem * var(--font-scale));
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        /* Navigation Menu */
        .nav-list {
            list-style: none;
            padding: 0;
            margin: 0;
            flex: 1;
        }

        .nav-item {
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .nav-item:last-child {
            border-bottom: none;
        }

        .nav-item a,
        .nav-item-settings {
            display: flex;
            align-items: center;
            padding: calc(18px * var(--font-scale)) calc(25px * var(--font-scale));
            text-decoration: none;
            color: #ecf0f1;
            font-weight: 500;
            font-size: calc(14px * var(--font-scale));
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
            cursor: pointer;
        }

        .nav-item a .icon,
        .nav-item-settings .icon {
            margin-right: calc(15px * var(--font-scale));
            font-size: calc(18px * var(--font-scale));
            width: calc(24px * var(--font-scale));
            text-align: center;
            transition: transform 0.3s ease;
        }

        .nav-item a:hover .icon,
        .nav-item-settings:hover .icon {
            transform: scale(1.2);
        }

        .nav-item a::before,
        .nav-item-settings::before {
            content: "";
            position: absolute;
            left: 0;
            top: 0;
            width: calc(4px * var(--font-scale));
            height: 100%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            transform: scaleY(0);
            transition: transform 0.3s ease;
        }

        .nav-item a:hover::before,
        .nav-item-settings:hover::before {
            transform: scaleY(1);
        }

        .nav-item a:hover,
        .nav-item-settings:hover {
            background: rgba(255, 255, 255, 0.08);
            padding-left: calc(35px * var(--font-scale));
        }

        #current-page-link {
            background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%) !important;
            font-weight: 600;
        }

        #current-page-link::before {
            transform: scaleY(1) !important;
            background: #fff !important;
        }

        /* Settings dropdown */
        .settings-item {
            position: relative;
        }

        .settings-dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: #2c3e50;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease;
            z-index: 10;
        }

        .settings-dropdown.active {
            max-height: 500px;
        }

        .settings-dropdown-item {
            padding: calc(15px * var(--font-scale)) calc(35px * var(--font-scale));
            color: #bdc3c7;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            font-size: calc(13px * var(--font-scale));
        }

        .settings-dropdown-item:last-child {
            border-bottom: none;
        }

        .settings-dropdown-item h4 {
            margin: 0 0 calc(10px * var(--font-scale)) 0;
            color: #ecf0f1;
            font-size: calc(14px * var(--font-scale));
            font-weight: 600;
        }

        /* Font Settings trong Settings Menu */
        .font-size-controls {
            display: flex;
            align-items: center;
            gap: calc(12px * var(--font-scale));
            justify-content: space-between;
            background: rgba(255, 255, 255, 0.1);
            padding: calc(12px * var(--font-scale));
            border-radius: calc(8px * var(--font-scale));
            margin: calc(10px * var(--font-scale)) 0;
        }

        .font-size-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            width: calc(32px * var(--font-scale));
            height: calc(32px * var(--font-scale));
            border-radius: calc(6px * var(--font-scale));
            cursor: pointer;
            font-weight: bold;
            font-size: calc(14px * var(--font-scale));
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .font-size-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }

        .font-size-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        .font-size-display {
            background: rgba(255, 255, 255, 0.2);
            color: #ecf0f1;
            padding: calc(8px * var(--font-scale)) calc(12px * var(--font-scale));
            border-radius: calc(6px * var(--font-scale));
            font-weight: 700;
            font-size: calc(12px * var(--font-scale));
            min-width: calc(50px * var(--font-scale));
            text-align: center;
            border: 1px solid rgba(255, 255, 255, 0.3);
        }

        .preset-buttons {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: calc(8px * var(--font-scale));
            margin-top: calc(10px * var(--font-scale));
        }

        .sidebar-preset-btn {
            background: rgba(255, 255, 255, 0.1);
            border: 2px solid rgba(255, 255, 255, 0.2);
            color: #ecf0f1;
            padding: calc(8px * var(--font-scale)) calc(10px * var(--font-scale));
            border-radius: calc(6px * var(--font-scale));
            cursor: pointer;
            font-size: calc(11px * var(--font-scale));
            text-align: center;
            transition: all 0.2s ease;
            font-weight: 600;
        }

        .sidebar-preset-btn:hover {
            background: rgba(255, 255, 255, 0.2);
            border-color: rgba(102, 126, 234, 0.6);
            transform: translateY(-1px);
        }

        .sidebar-preset-btn.active {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-color: #667eea;
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        }

        /* Settings arrow indicator */
        .settings-arrow {
            margin-left: auto;
            transition: transform 0.3s ease;
            font-size: calc(12px * var(--font-scale));
        }

        .settings-item.active .settings-arrow {
            transform: rotate(180deg);
        }

        /* Other settings sections */
        .setting-section {
            margin: calc(10px * var(--font-scale)) 0;
        }

        .setting-label {
            display: block;
            margin-bottom: calc(5px * var(--font-scale));
            color: #95a5a6;
            font-size: calc(12px * var(--font-scale));
        }

        .setting-toggle {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: calc(8px * var(--font-scale)) calc(12px * var(--font-scale));
            background: rgba(255, 255, 255, 0.1);
            border-radius: calc(6px * var(--font-scale));
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .setting-toggle:hover {
            background: rgba(255, 255, 255, 0.15);
        }

        .toggle-switch {
            width: calc(40px * var(--font-scale));
            height: calc(20px * var(--font-scale));
            background: rgba(255, 255, 255, 0.2);
            border-radius: calc(10px * var(--font-scale));
            position: relative;
            transition: all 0.3s ease;
        }

        .toggle-switch.active {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .toggle-switch::before {
            content: "";
            position: absolute;
            width: calc(16px * var(--font-scale));
            height: calc(16px * var(--font-scale));
            background: white;
            border-radius: 50%;
            top: calc(2px * var(--font-scale));
            left: calc(2px * var(--font-scale));
            transition: all 0.3s ease;
        }

        .toggle-switch.active::before {
            left: calc(22px * var(--font-scale));
        }

        /* Responsive */
        @media (max-width: 768px) {
            .sidebar {
                width: calc(320px * var(--font-scale));
                left: calc(-320px * var(--font-scale));
            }

            .menu-toggle {
                top: calc(15px * var(--font-scale));
                left: calc(15px * var(--font-scale));
                width: calc(45px * var(--font-scale));
                height: calc(45px * var(--font-scale));
            }

            .font-size-controls {
                gap: calc(8px * var(--font-scale));
                padding: calc(8px * var(--font-scale));
            }

            .font-size-btn {
                width: calc(28px * var(--font-scale));
                height: calc(28px * var(--font-scale));
            }

            .settings-dropdown-item {
                padding: calc(12px * var(--font-scale)) calc(25px * var(--font-scale));
            }
        }
    `;
    document.head.appendChild(styles);
    console.log('Sidebar styles injected');
}

/**
 * Toggle settings dropdown
 */
function toggleSettings() {
    const settingsItem = document.querySelector('.settings-item');
    const dropdown = document.querySelector('.settings-dropdown');
    
    if (settingsItem && dropdown) {
        const isActive = settingsItem.classList.contains('active');
        
        if (isActive) {
            settingsItem.classList.remove('active');
            dropdown.classList.remove('active');
        } else {
            settingsItem.classList.add('active');
            dropdown.classList.add('active');
        }
        
        console.log('Settings dropdown toggled:', !isActive);
    }
}

/**
 * Toggle setting switch
 */
function toggleSetting(settingName) {
    const toggleSwitch = document.querySelector(`[data-setting="${settingName}"]`);
    if (toggleSwitch) {
        const isActive = toggleSwitch.classList.contains('active');
        
        if (isActive) {
            toggleSwitch.classList.remove('active');
            localStorage.setItem(settingName, 'false');
        } else {
            toggleSwitch.classList.add('active');
            localStorage.setItem(settingName, 'true');
        }
        
        console.log(`Setting ${settingName} toggled to:`, !isActive);
        
        // Trigger custom event for setting change
        const event = new CustomEvent('settingChanged', {
            detail: { settingName, value: !isActive }
        });
        window.dispatchEvent(event);
    }
}

/**
 * Tạo sidebar với settings menu cải tiến
 */
function createIntegratedSidebar() {
    // Xóa sidebar cũ nếu có để tránh duplicate
    const existingSidebar = document.getElementById('sidebar');
    if (existingSidebar) {
        existingSidebar.remove();
    }
    
    const existingOverlay = document.getElementById('overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }
    
    const existingToggle = document.querySelector('.menu-toggle');
    if (existingToggle) {
        existingToggle.remove();
    }

    // Inject CSS đầu tiên
    injectSidebarStyles();

    // Tạo HTML structure hoàn chỉnh
    const sidebarHTML = `
        <!-- Menu Toggle Button -->
        <button class="menu-toggle" onclick="toggleSidebar()">
            <div class="hamburger"></div>
        </button>

        <!-- Overlay -->
        <div class="overlay" id="overlay"></div>

        <!-- Sidebar -->
        <div class="sidebar" id="sidebar">
            <div class="sidebar-header">
				<h3>
					<img src="../logo.jpg" alt="Logo" style="height:40px; vertical-align:middle; margin-right:10px;">
					N2 SHOP
				</h3>
			</div>
            
            <nav class="nav-list">
                <!-- Menu items sẽ được tạo tự động -->
            </nav>
        </div>
    `;

    // Thêm vào body
    document.body.insertAdjacentHTML('beforeend', sidebarHTML);
    console.log('Sidebar HTML created with settings menu');
}

/**
 * Toggle Sidebar function - Phiên bản có debug
 */
function toggleSidebar() {
    console.log('toggleSidebar called');
    
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const menuToggle = document.querySelector('.menu-toggle');
    
    console.log('Elements found:', {
        sidebar: !!sidebar,
        overlay: !!overlay,
        menuToggle: !!menuToggle
    });
    
    if (!sidebar || !overlay || !menuToggle) {
        console.warn('Sidebar elements not found, trying to recreate...');
        createIntegratedSidebar();
        setTimeout(toggleSidebar, 100); // Retry sau khi tạo
        return;
    }
    
    const isOpen = sidebar.classList.contains('open');
    console.log('Current state - isOpen:', isOpen);
    
    if (isOpen) {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        menuToggle.classList.remove('active');
        // Đóng settings dropdown khi đóng sidebar
        const settingsItem = document.querySelector('.settings-item');
        const dropdown = document.querySelector('.settings-dropdown');
        if (settingsItem && dropdown) {
            settingsItem.classList.remove('active');
            dropdown.classList.remove('active');
        }
        console.log('Sidebar closed');
    } else {
        sidebar.classList.add('open');
        overlay.classList.add('active');
        menuToggle.classList.add('active');
        console.log('Sidebar opened');
    }
}

/**
 * Đóng sidebar
 */
function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const menuToggle = document.querySelector('.menu-toggle');
    
    if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        menuToggle.classList.remove('active');
		menuToggle.classList.remove('hidden');
        // Đóng settings dropdown
        const settingsItem = document.querySelector('.settings-item');
        const dropdown = document.querySelector('.settings-dropdown');
        if (settingsItem && dropdown) {
            settingsItem.classList.remove('active');
            dropdown.classList.remove('active');
        }
    }
}

/**
 * Tạo menu navigation với settings menu
 */
function createNavigationMenu() {
    const checkLogin = localStorage.getItem('checkLogin');
    const navList = document.querySelector('.nav-list');
    
    if (!navList) {
        console.warn('Navigation list not found');
        return;
    }
    
    const visibleMenuItems = MENU_CONFIG.filter(item => {
        if (item.adminOnly) {
            return checkLogin == 0 || checkLogin === '0';
        }
        return true;
    });
    
    const currentPage = getCurrentPageIdentifier();
    navList.innerHTML = '';
    
    // Tạo menu items thông thường
    visibleMenuItems.forEach(item => {
        const li = document.createElement('li');
        li.className = 'nav-item';
        
        const isCurrentPage = currentPage === item.pageIdentifier;
        const linkId = isCurrentPage ? 'id="current-page-link"' : '';
        
        li.innerHTML = `
            <a href="${item.href}" ${linkId}>
                <i class="icon">${item.icon}</i>
                <span>${item.text}</span>
            </a>
        `;
        
        navList.appendChild(li);
    });
    
    // Thêm Settings menu item
    const settingsLi = document.createElement('li');
    settingsLi.className = 'nav-item settings-item';
    settingsLi.innerHTML = `
        <div class="nav-item-settings" onclick="toggleSettings()">
            <i class="icon">⚙️</i>
            <span>CÀI ĐẶT</span>
            <span class="settings-arrow">▼</span>
        </div>
        <div class="settings-dropdown">
            <div class="settings-dropdown-item">
                <h4>🎨 Cài đặt cỡ chữ</h4>
                
                <div class="font-size-controls">
                    <button class="font-size-btn" id="sidebarDecreaseFont" title="Giảm cỡ chữ" type="button">−</button>
                    <div class="font-size-display" id="sidebarFontSizeDisplay">100%</div>
                    <button class="font-size-btn" id="sidebarIncreaseFont" title="Tăng cỡ chữ" type="button">+</button>
                </div>
            </div>
            
            <div class="settings-dropdown-item">
                <h4>🌙 Chế độ hiển thị</h4>
                <div class="setting-section">
                    <div class="setting-toggle" onclick="toggleSetting('darkMode')">
                        <span>Chế độ tối</span>
                        <div class="toggle-switch" data-setting="darkMode"></div>
                    </div>
                </div>
            </div>
            
            <div class="settings-dropdown-item">
                <h4>🔧 Tùy chọn khác</h4>
                <div class="setting-section">
                    <div class="setting-toggle" onclick="toggleSetting('autoSave')">
                        <span>Tự động lưu</span>
                        <div class="toggle-switch active" data-setting="autoSave"></div>
                    </div>
                </div>
                <div class="setting-section">
                    <div class="setting-toggle" onclick="toggleSetting('notifications')">
                        <span>Thông báo</span>
                        <div class="toggle-switch active" data-setting="notifications"></div>
                    </div>
                </div>
                <div class="setting-section">
                    <div style="color: #95a5a6; font-size: calc(11px * var(--font-scale)); padding: calc(5px * var(--font-scale)) 0; text-align: center;">
                        N2 Shop Management v2.0
                    </div>
                </div>
            </div>
        </div>
    `;
    
    navList.appendChild(settingsLi);
    
    // Load saved settings
    loadSavedSettings();
    
    console.log(`Navigation menu created with ${visibleMenuItems.length} items + Settings`);
}

/**
 * Load saved settings from localStorage
 */
function loadSavedSettings() {
    const settings = ['darkMode', 'autoSave', 'notifications'];
    
    settings.forEach(settingName => {
        const savedValue = localStorage.getItem(settingName);
        const toggleSwitch = document.querySelector(`[data-setting="${settingName}"]`);
        
        if (toggleSwitch) {
            if (savedValue === 'true') {
                toggleSwitch.classList.add('active');
            } else if (savedValue === 'false') {
                toggleSwitch.classList.remove('active');
            }
            // If no saved value, keep default state from HTML
        }
    });
}

/**
 * Xác định trang hiện tại
 */
function getCurrentPageIdentifier() {
    const path = window.location.pathname;
    
    for (const item of MENU_CONFIG) {
        const pageFolder = item.pageIdentifier;
        if (path.includes(`/${pageFolder}/`) || path.includes(`${pageFolder}/index.html`)) {
            return pageFolder;
        }
    }
    
    return null;
}

/**
 * Khởi tạo navigation system hoàn chỉnh
 */
function initializeNavigation() {
    console.log('Initializing integrated navigation with settings menu...');
    
    // Tạo sidebar với settings menu
    createIntegratedSidebar();
    
    // Tạo menu navigation
    createNavigationMenu();
    
    // Khởi tạo font manager
    const fontManager = new IntegratedFontManager();
    
    // Thiết lập event listeners
    setupNavigationEventListeners();
    
    // Setup font event listeners - Quan trọng!
    setTimeout(() => {
        fontManager.setupEventListeners();
        fontManager.updateDisplay();
        fontManager.updatePresetButtons();
        console.log('Font manager fully initialized');
    }, 200); // Delay để đảm bảo DOM đã sẵn sàng
    
    // Apply any custom settings
    applyCustomSettings();
}

/**
 * Apply custom settings after initialization
 */
function applyCustomSettings() {
    // Apply dark mode if enabled
    const darkMode = localStorage.getItem('darkMode');
    if (darkMode === 'true') {
        document.body.classList.add('dark-mode');
        console.log('Dark mode applied');
    }
    
    // Apply other settings as needed
    const autoSave = localStorage.getItem('autoSave');
    if (autoSave === 'true') {
        // Enable auto-save functionality
        console.log('Auto-save enabled');
    }
    
    const notifications = localStorage.getItem('notifications');
    if (notifications === 'false') {
        // Disable notifications
        console.log('Notifications disabled');
    }
}

/**
 * Thiết lập event listeners
 */
function setupNavigationEventListeners() {
    // ESC key để đóng sidebar
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeSidebar();
        }
    });
    
    // Click vào overlay để đóng sidebar
    const overlay = document.getElementById('overlay');
    if (overlay) {
        overlay.addEventListener('click', closeSidebar);
    }
    
    // Listen for setting changes
    window.addEventListener('settingChanged', function(e) {
        const { settingName, value } = e.detail;
        console.log(`Setting changed: ${settingName} = ${value}`);
        
        // Apply setting changes immediately
        switch(settingName) {
            case 'darkMode':
                if (value) {
                    document.body.classList.add('dark-mode');
                } else {
                    document.body.classList.remove('dark-mode');
                }
                break;
            case 'autoSave':
                // Handle auto-save setting
                break;
            case 'notifications':
                // Handle notifications setting
                break;
        }
    });
    
    console.log('Navigation event listeners set up');
}

/**
 * Debug function - kiểm tra settings menu
 */
function debugSettingsMenu() {
    console.log('=== Settings Menu Debug ===');
    console.log('Sidebar found:', !!document.getElementById('sidebar'));
    console.log('Settings item found:', !!document.querySelector('.settings-item'));
    console.log('Settings dropdown found:', !!document.querySelector('.settings-dropdown'));
    console.log('Font decrease btn:', !!document.getElementById('sidebarDecreaseFont'));
    console.log('Font increase btn:', !!document.getElementById('sidebarIncreaseFont'));
    console.log('Font display:', !!document.getElementById('sidebarFontSizeDisplay'));
    console.log('Preset buttons:', document.querySelectorAll('.sidebar-preset-btn').length);
    console.log('Toggle switches:', document.querySelectorAll('.toggle-switch').length);
    console.log('Styles injected:', !!document.getElementById('integratedSidebarStyles'));
    console.log('Current font scale:', localStorage.getItem('globalFontScale'));
    
    // Check saved settings
    console.log('--- Saved Settings ---');
    console.log('Dark mode:', localStorage.getItem('darkMode'));
    console.log('Auto save:', localStorage.getItem('autoSave'));
    console.log('Notifications:', localStorage.getItem('notifications'));
    console.log('============================');
}

/**
 * Utility functions for external use
 */
function getSetting(settingName) {
    return localStorage.getItem(settingName);
}

function setSetting(settingName, value) {
    localStorage.setItem(settingName, value.toString());
    
    // Update UI if setting exists
    const toggleSwitch = document.querySelector(`[data-setting="${settingName}"]`);
    if (toggleSwitch) {
        if (value) {
            toggleSwitch.classList.add('active');
        } else {
            toggleSwitch.classList.remove('active');
        }
    }
    
    // Trigger change event
    const event = new CustomEvent('settingChanged', {
        detail: { settingName, value }
    });
    window.dispatchEvent(event);
}

/**
 * Add dark mode styles
 */
function injectDarkModeStyles() {
    if (document.getElementById('darkModeStyles')) return;
    
    const darkStyles = document.createElement('style');
    darkStyles.id = 'darkModeStyles';
    darkStyles.textContent = `
        body.dark-mode {
            background-color: #1a1a1a !important;
            color: #e0e0e0 !important;
        }
        
        body.dark-mode .main-content {
            background-color: #2d2d2d !important;
            color: #e0e0e0 !important;
        }
        
        body.dark-mode table {
            background-color: #2d2d2d !important;
            color: #e0e0e0 !important;
        }
        
        body.dark-mode th {
            background-color: #3d3d3d !important;
            color: #ffffff !important;
        }
        
        body.dark-mode td {
            background-color: #2d2d2d !important;
            border-color: #4d4d4d !important;
        }
        
        body.dark-mode input,
        body.dark-mode select,
        body.dark-mode textarea {
            background-color: #3d3d3d !important;
            color: #e0e0e0 !important;
            border-color: #5d5d5d !important;
        }
        
        body.dark-mode .modal-content {
            background-color: #2d2d2d !important;
            color: #e0e0e0 !important;
        }
        
        body.dark-mode .filter-system {
            background-color: #2d2d2d !important;
            border-color: #4d4d4d !important;
        }
    `;
    document.head.appendChild(darkStyles);
}

// Auto-initialize khi DOM ready
document.addEventListener('DOMContentLoaded', function() {
    function initWhenReady() {
        try {
            // Inject dark mode styles first
            injectDarkModeStyles();
            
            // Initialize navigation
            initializeNavigation();
            
            // Debug để kiểm tra
            setTimeout(() => {
                debugSettingsMenu();
            }, 500);
            
            console.log('Navigation với Settings Menu đã khởi tạo thành công!');
        } catch (error) {
            console.error('Error initializing navigation:', error);
            setTimeout(initWhenReady, 500); // Retry nếu lỗi
        }
    }
    
    initWhenReady();
});

// Export functions để sử dụng từ bên ngoài
window.NavigationManager = {
    init: initializeNavigation,
    toggleSidebar: toggleSidebar,
    closeSidebar: closeSidebar,
    toggleSettings: toggleSettings,
    toggleSetting: toggleSetting,
    getSetting: getSetting,
    setSetting: setSetting,
    debug: debugSettingsMenu
};

// Global functions
window.toggleSidebar = toggleSidebar;
window.toggleSettings = toggleSettings;
window.toggleSetting = toggleSetting;
