// =====================================================
// TRASH INTEGRATION - Add trash bin support to CK and Hanghoan pages
// =====================================================
// This module extends existing delete functionality to use trash bin

(function() {
    'use strict';

    // Wait for page to load and initialize
    function initTrashIntegration() {
        const currentPage = detectCurrentPage();
        if (!currentPage) {
            console.log('Trash integration: Not on a supported page');
            return;
        }

        console.log(`Initializing trash integration for: ${currentPage}`);

        // Initialize trash manager
        if (typeof firebase === 'undefined' || !firebase.firestore) {
            console.error('Firebase not available');
            return;
        }

        const db = firebase.firestore();
        window.trashManager = new TrashManager(currentPage, db);

        // Add bulk action UI
        addBulkActionUI(currentPage);

        // Intercept delete operations
        interceptDeleteOperations(currentPage);

        console.log('Trash integration initialized successfully');
    }

    // Detect which page we're on
    function detectCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('/ck/')) return 'ck';
        if (path.includes('/hanghoan/')) return 'hanghoan';
        return null;
    }

    // Add bulk action UI to the page
    function addBulkActionUI(page) {
        const tableBody = document.getElementById('tableBody');
        if (!tableBody) return;

        // Find the card-header where we'll add bulk actions
        const cardHeader = document.querySelector('.card-header');
        if (!cardHeader) return;

        // Add bulk action controls
        const bulkActionHTML = `
            <div class="bulk-action-container" style="display: none; padding: 1rem; background: #f8f9fa; border-radius: 8px; margin: 1rem 0; border: 1px solid #e9ecef;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <input type="checkbox" id="selectAllRows" style="width: 18px; height: 18px; cursor: pointer;">
                        <label for="selectAllRows" style="font-weight: 600; cursor: pointer; margin: 0;">Chọn tất cả</label>
                        <span id="selectedRowCount" style="color: #6c757d; font-size: 0.9rem;">0 mục được chọn</span>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-danger" id="btnBulkMoveToTrash" style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 0.5rem 1rem; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 0.5rem;">
                            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                            <span>Xóa các mục đã chọn</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Insert bulk actions before the table
        const card = document.querySelector('.card-body');
        if (card) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = bulkActionHTML;
            card.insertBefore(tempDiv.firstElementChild, card.firstElementChild);

            // Initialize Lucide icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }

            // Set up event listeners
            setupBulkActionListeners(page);
        }
    }

    // Set up event listeners for bulk actions
    function setupBulkActionListeners(page) {
        const selectAllCheckbox = document.getElementById('selectAllRows');
        const bulkMoveButton = document.getElementById('btnBulkMoveToTrash');
        const bulkContainer = document.querySelector('.bulk-action-container');

        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', function() {
                const checkboxes = document.querySelectorAll('.row-select-checkbox');
                checkboxes.forEach(cb => {
                    cb.checked = this.checked;
                });
                updateSelectedCount();
            });
        }

        if (bulkMoveButton) {
            bulkMoveButton.addEventListener('click', function() {
                handleBulkMoveToTrash(page);
            });
        }

        // Observe table changes to add checkboxes to rows
        observeTableChanges(page);
    }

    // Observe table changes to add checkboxes dynamically
    function observeTableChanges(page) {
        const tableBody = document.getElementById('tableBody');
        if (!tableBody) return;

        // Add checkboxes to existing rows
        addCheckboxesToRows(page);

        // Watch for new rows being added
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.tagName === 'TR') {
                            addCheckboxToRow(node, page);
                        }
                    });
                }
            });
        });

        observer.observe(tableBody, { childList: true });
    }

    // Add checkboxes to all existing rows
    function addCheckboxesToRows(page) {
        const rows = document.querySelectorAll('#tableBody tr');
        rows.forEach(row => addCheckboxToRow(row, page));
    }

    // Add checkbox to a single row
    function addCheckboxToRow(row, page) {
        if (row.querySelector('.row-select-checkbox')) return; // Already has checkbox

        // Create checkbox cell
        const checkboxCell = document.createElement('td');
        checkboxCell.style.width = '40px';
        checkboxCell.style.textAlign = 'center';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'row-select-checkbox';
        checkbox.style.width = '18px';
        checkbox.style.height = '18px';
        checkbox.style.cursor = 'pointer';

        // Store row data for later retrieval
        const rowData = extractRowData(row, page);
        checkbox.setAttribute('data-row-data', JSON.stringify(rowData));

        checkbox.addEventListener('change', function() {
            updateSelectedCount();
        });

        checkboxCell.appendChild(checkbox);
        row.insertBefore(checkboxCell, row.firstChild);
    }

    // Extract row data based on page type
    function extractRowData(row, page) {
        if (page === 'ck') {
            return extractCKRowData(row);
        } else if (page === 'hanghoan') {
            return extractHangHoanRowData(row);
        }
        return {};
    }

    // Extract CK row data
    function extractCKRowData(row) {
        const cells = row.cells;
        if (!cells || cells.length < 6) return {};

        return {
            uniqueId: row.getAttribute('data-unique-id') || null,
            dateCell: cells[0]?.id || cells[0]?.textContent || '',
            noteCell: cells[1]?.textContent || '',
            amountCell: cells[2]?.textContent || '',
            bankCell: cells[3]?.textContent || '',
            completed: cells[4]?.querySelector('input[type="checkbox"]')?.checked || false,
            customerInfoCell: cells[5]?.textContent || '',
            user: row.querySelector('.delete-button')?.getAttribute('data-user') || 'Unknown'
        };
    }

    // Extract Hanghoan row data
    function extractHangHoanRowData(row) {
        const cells = row.cells;
        if (!cells || cells.length < 9) return {};

        // Note: cells[0] is the row-select-checkbox we added, so data starts at cells[1]
        return {
            duyetHoanValue: cells[1]?.id || '',
            shipValue: cells[2]?.textContent || '',
            scenarioValue: cells[3]?.textContent || '',
            customerInfoValue: cells[4]?.textContent || '',
            totalAmountValue: cells[5]?.textContent || '',
            causeValue: cells[6]?.textContent || '',
            muted: cells[7]?.querySelector('input[type="checkbox"]')?.checked || false,
            user: row.querySelector('.delete-button')?.id || 'Unknown'
        };
    }

    // Update selected count
    function updateSelectedCount() {
        const checkboxes = document.querySelectorAll('.row-select-checkbox:checked');
        const count = checkboxes.length;
        const countElement = document.getElementById('selectedRowCount');
        const bulkContainer = document.querySelector('.bulk-action-container');

        if (countElement) {
            countElement.textContent = `${count} mục được chọn`;
        }

        // Show/hide bulk action container
        if (bulkContainer) {
            bulkContainer.style.display = count > 0 ? 'block' : 'none';
        }
    }

    // Handle bulk move to trash
    async function handleBulkMoveToTrash(page) {
        const checkboxes = document.querySelectorAll('.row-select-checkbox:checked');

        if (checkboxes.length === 0) {
            alert('Vui lòng chọn ít nhất một mục để xóa');
            return;
        }

        if (!confirm(`Bạn có chắc muốn xóa ${checkboxes.length} mục đã chọn?\n\nCác mục sẽ được chuyển vào thùng rác và tự động xóa vĩnh viễn sau 30 ngày.`)) {
            return;
        }

        try {
            // Show loading notification
            const notificationManager = window.moneyTransferApp?.notificationManager ||
                                       window.notificationManager;

            if (notificationManager) {
                notificationManager.loading(`Đang xóa ${checkboxes.length} mục...`);
            }

            // Collect all items to delete
            const itemsToDelete = [];
            const rowsToRemove = [];

            checkboxes.forEach(checkbox => {
                const rowData = JSON.parse(checkbox.getAttribute('data-row-data'));
                itemsToDelete.push(rowData);
                rowsToRemove.push(checkbox.closest('tr'));
            });

            // Move items to trash
            await window.trashManager.moveToTrash(itemsToDelete, page);

            // Delete from original collection
            if (page === 'ck') {
                await deleteCKItems(itemsToDelete);
            } else if (page === 'hanghoan') {
                await deleteHangHoanItems(itemsToDelete);
            }

            // Remove rows from UI
            rowsToRemove.forEach(row => row.remove());

            // Clear selection
            const selectAllCheckbox = document.getElementById('selectAllRows');
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = false;
            }
            updateSelectedCount();

            // Show success notification
            if (notificationManager) {
                notificationManager.success(`Đã xóa ${checkboxes.length} mục thành công`, 3000);
            }

            // Invalidate cache
            if (typeof cacheManager !== 'undefined') {
                cacheManager.invalidate();
            }

            // Reload data
            setTimeout(() => {
                window.location.reload();
            }, 1500);

        } catch (error) {
            console.error('Error bulk moving to trash:', error);
            const notificationManager = window.moneyTransferApp?.notificationManager ||
                                       window.notificationManager;
            if (notificationManager) {
                notificationManager.error('Lỗi khi xóa: ' + error.message);
            } else {
                alert('Lỗi khi xóa: ' + error.message);
            }
        }
    }

    // Delete CK items from Firebase
    async function deleteCKItems(items) {
        const db = firebase.firestore();
        const collectionRef = db.collection('moneyTransfer');

        const doc = await collectionRef.doc('ck').get();
        if (!doc.exists) throw new Error('Document does not exist');

        const data = doc.data();
        const dataArray = data['data'] || [];

        // Filter out deleted items
        const uniqueIds = items.map(item => item.uniqueId).filter(Boolean);
        const updatedArray = dataArray.filter(item => !uniqueIds.includes(item.uniqueId));

        await collectionRef.doc('ck').update({ data: updatedArray });
    }

    // Delete Hanghoan items from Firebase
    async function deleteHangHoanItems(items) {
        const db = firebase.firestore();
        const collectionRef = db.collection('hanghoan');

        const doc = await collectionRef.doc('hanghoan').get();
        if (!doc.exists) throw new Error('Document does not exist');

        const data = doc.data();
        const dataArray = data['data'] || [];

        // Filter out deleted items
        const ids = items.map(item => item.duyetHoanValue).filter(Boolean);
        const updatedArray = dataArray.filter(item => !ids.includes(item.duyetHoanValue));

        await collectionRef.doc('hanghoan').update({ data: updatedArray });
    }

    // Intercept single delete operations
    function interceptDeleteOperations(page) {
        // Override the single delete function to use trash
        const originalConfirm = window.confirm;

        window.confirm = function(message) {
            // Check if this is a delete confirmation
            if (message.includes('xóa')) {
                // Modify the message to mention trash
                const newMessage = message.replace('xóa', 'xóa (chuyển vào thùng rác)') +
                    '\n\nMục sẽ được giữ trong thùng rác 30 ngày trước khi tự động xóa vĩnh viễn.';
                return originalConfirm.call(this, newMessage);
            }
            return originalConfirm.call(this, message);
        };

        // Hook into delete button clicks
        document.addEventListener('click', async function(e) {
            const deleteButton = e.target.closest('.delete-button');
            if (!deleteButton) return;

            // Check if this is interceptable
            const row = deleteButton.closest('tr');
            if (!row) return;

            // Extract data and move to trash (this will be called after confirmation)
            const rowData = extractRowData(row, page);

            // Wait a bit to let the original delete process
            setTimeout(async () => {
                try {
                    // Move to trash after successful delete
                    await window.trashManager.moveToTrash(rowData, page);
                } catch (error) {
                    console.error('Error moving to trash:', error);
                }
            }, 100);
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTrashIntegration);
    } else {
        // Try to initialize now, but also wait for Firebase and TrashManager
        const tryInit = () => {
            if (typeof firebase !== 'undefined' && typeof TrashManager !== 'undefined') {
                initTrashIntegration();
            } else {
                setTimeout(tryInit, 100);
            }
        };
        tryInit();
    }

})();
