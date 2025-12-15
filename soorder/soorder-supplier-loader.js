// =====================================================
// SUPPLIER LOADER FROM TPOS API
// File: soorder-supplier-loader.js
// Loads supplier list from TPOS OData API and saves to Firebase
// =====================================================

window.SoOrderSupplierLoader = {
    // Cloudflare Worker proxy URL
    WORKER_URL: 'https://chatomni-proxy.nhijudyshop.workers.dev',

    // TPOS credentials
    TPOS_CREDENTIALS: {
        username: 'nv20',
        password: 'Nv201234',
        grant_type: 'password'
    },

    // Queue for duplicate suppliers pending user selection
    duplicateQueue: [],
    duplicateResolveCallback: null,

    // =====================================================
    // GET TPOS TOKEN (via Worker with caching)
    // =====================================================
    async getTPOSToken() {
        try {
            console.log('[Supplier Loader] 🔑 Fetching TPOS token...');

            const response = await fetch(`${this.WORKER_URL}/api/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams(this.TPOS_CREDENTIALS)
            });

            if (!response.ok) {
                throw new Error(`Token request failed: ${response.status}`);
            }

            const data = await response.json();
            console.log('[Supplier Loader] ✅ Token retrieved successfully');

            return data.access_token;

        } catch (error) {
            console.error('[Supplier Loader] ❌ Error fetching token:', error);
            throw error;
        }
    },

    // =====================================================
    // FETCH SUPPLIERS FROM TPOS ODATA API
    // =====================================================
    async fetchSuppliersFromTPOS(token) {
        try {
            console.log('[Supplier Loader] 📡 Fetching suppliers from TPOS OData API...');

            // OData query parameters
            const params = new URLSearchParams({
                '$top': '1000',  // Tăng từ 50 lên 1000 để lấy nhiều NCC hơn
                '$orderby': 'Name',
                '$filter': '(Supplier eq true and Active eq true)',
                '$count': 'true'
            });

            // Build full URL through worker proxy
            const apiUrl = `${this.WORKER_URL}/api/odata/Partner/ODataService.GetView?${params.toString()}`;

            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'tposappversion': '5.11.16.1'
                }
            });

            if (!response.ok) {
                throw new Error(`TPOS API request failed: ${response.status}`);
            }

            const data = await response.json();

            console.log(`[Supplier Loader] ✅ Fetched ${data.value?.length || 0} suppliers (Total: ${data['@odata.count'] || 'unknown'})`);

            return data.value || [];

        } catch (error) {
            console.error('[Supplier Loader] ❌ Error fetching suppliers:', error);
            throw error;
        }
    },

    // =====================================================
    // PARSE NCC CODE FROM NAME
    // Uses existing parseNCCCode utility
    // =====================================================
    parseNCCCode(text) {
        const crud = window.SoOrderCRUD;
        if (crud && crud.parseNCCCode) {
            return crud.parseNCCCode(text);
        }

        // Fallback: simple regex to extract Ax code
        const match = text.match(/\b(A\d+)\b/i);
        return match ? match[1].toUpperCase() : null;
    },

    // =====================================================
    // SAVE SUPPLIERS TO FIREBASE - LƯU TẤT CẢ NCC KHÔNG LỌC
    // =====================================================
    async saveSuppliersToFirebase(suppliers) {
        const config = window.SoOrderConfig;
        const utils = window.SoOrderUtils;

        if (!config || !config.nccNamesCollectionRef) {
            throw new Error('Firebase config not initialized');
        }

        try {
            console.log('[Supplier Loader] 💾 Saving ALL suppliers to Firebase (no filtering)...');
            console.log(`[Supplier Loader] 📊 Total suppliers from TPOS: ${suppliers.length}`);

            // Step 1: Xóa toàn bộ dữ liệu cũ trong Firebase trước
            console.log('[Supplier Loader] 🗑️ Deleting all existing suppliers from Firebase...');
            const existingSnapshot = await config.nccNamesCollectionRef.get();

            if (!existingSnapshot.empty) {
                const deleteBatch = config.db.batch();
                existingSnapshot.forEach((doc) => {
                    deleteBatch.delete(doc.ref);
                });
                await deleteBatch.commit();
                console.log(`[Supplier Loader] ✅ Deleted ${existingSnapshot.size} existing suppliers`);
            }

            // Step 2: Lưu TẤT CẢ suppliers từ TPOS (dùng TPOS Code làm document ID)
            const batch = config.db.batch();
            let saveCount = 0;

            for (const supplier of suppliers) {
                const name = supplier.Name;
                const tposCode = supplier.Code;

                if (!name || !tposCode) {
                    console.warn('[Supplier Loader] ⚠️ Skipping supplier without name or code:', supplier);
                    continue;
                }

                // Dùng TPOS Code làm document ID (unique cho mỗi NCC)
                const docRef = config.nccNamesCollectionRef.doc(tposCode);

                // Lưu cả name và axCode (nếu có) để dễ tra cứu
                const axCode = this.parseNCCCode(name);
                batch.set(docRef, {
                    name: name.trim(),
                    axCode: axCode || null
                });
                saveCount++;
            }

            // Commit batch
            if (saveCount > 0) {
                await batch.commit();
                console.log(`[Supplier Loader] ✅ Saved ${saveCount} suppliers to Firebase`);
            }

            return { success: true, count: saveCount };

        } catch (error) {
            console.error('[Supplier Loader] ❌ Error saving to Firebase:', error);
            throw error;
        }
    },

    // =====================================================
    // PROCESS DUPLICATE GROUPS - PROMPT USER FOR EACH
    // =====================================================
    async processDuplicateGroups(duplicateGroups, existingNames) {
        const selectedSuppliers = [];

        for (const group of duplicateGroups) {
            const existingName = existingNames.get(group.code.toUpperCase());

            // Show modal for user to select
            const selected = await this.showDuplicateSelectionModal(group.code, group.suppliers, existingName);

            if (selected) {
                selectedSuppliers.push(selected);
            }
        }

        return selectedSuppliers;
    },

    // =====================================================
    // SHOW MODAL FOR DUPLICATE SUPPLIER SELECTION
    // =====================================================
    showDuplicateSelectionModal(code, suppliers, existingName) {
        return new Promise((resolve) => {
            const ui = window.SoOrderUI;
            const utils = window.SoOrderUtils;

            // Build options including existing name if different
            const options = [...suppliers];

            // Add existing name as an option if it's different from all new suppliers
            if (existingName) {
                const existingMatches = suppliers.some(s => s.name === existingName);
                if (!existingMatches) {
                    options.unshift({
                        code: code,
                        name: existingName,
                        isExisting: true
                    });
                }
            }

            // If only one option after adding existing, auto-select it
            if (options.length === 1) {
                resolve(options[0]);
                return;
            }

            // Show the duplicate selection modal
            ui.showDuplicateSupplierModal(code, options, (selected) => {
                resolve(selected);
            });
        });
    },

    // =====================================================
    // UPDATE APPLICATION STATE FROM FIREBASE
    // =====================================================
    async updateStateFromFirebase() {
        const state = window.SoOrderState;
        const config = window.SoOrderConfig;

        if (!state || !config) {
            console.warn('[Supplier Loader] ⚠️ State or config not initialized');
            return;
        }

        try {
            console.log('[Supplier Loader] 🔄 Updating application state from Firebase...');

            // Load fresh data from Firebase
            const snapshot = await config.nccNamesCollectionRef.get();
            state.nccNames = [];

            snapshot.forEach((doc) => {
                const data = doc.data();
                state.nccNames.push({
                    code: data.axCode || doc.id.toUpperCase(), // Dùng axCode nếu có, không thì dùng TPOS code
                    tposCode: doc.id,
                    name: data.name
                });
            });

            // Sort by Ax code number (nếu là Ax code), sau đó theo tên
            state.nccNames.sort((a, b) => {
                const aIsAx = /^A\d+$/i.test(a.code);
                const bIsAx = /^A\d+$/i.test(b.code);

                if (aIsAx && bIsAx) {
                    const numA = parseInt(a.code.replace(/^A/i, '')) || 0;
                    const numB = parseInt(b.code.replace(/^A/i, '')) || 0;
                    return numA - numB;
                }
                if (aIsAx) return -1; // Ax codes first
                if (bIsAx) return 1;
                return a.name.localeCompare(b.name);
            });

            console.log(`[Supplier Loader] ✅ State updated with ${state.nccNames.length} suppliers from Firebase`);

        } catch (error) {
            console.error('[Supplier Loader] ❌ Error updating state from Firebase:', error);
            throw error;
        }
    },

    // Legacy function for backward compatibility
    updateState(suppliers) {
        const state = window.SoOrderState;

        if (!state) {
            console.warn('[Supplier Loader] ⚠️ State not initialized');
            return;
        }

        try {
            console.log('[Supplier Loader] 🔄 Updating application state...');

            // Clear existing state
            state.nccNames = [];

            // Add all suppliers to state - extracting Ax code from Name
            for (const supplier of suppliers) {
                const name = supplier.Name;

                if (!name) continue;

                const code = this.parseNCCCode(name);
                if (code) {
                    // Check if code already exists (avoid duplicates in state)
                    const exists = state.nccNames.some(n => n.code.toUpperCase() === code.toUpperCase());
                    if (!exists) {
                        state.nccNames.push({
                            code: code.toUpperCase(),
                            name: name.trim()
                        });
                    }
                }
            }

            // Sort by code number
            state.nccNames.sort((a, b) => {
                const numA = parseInt(a.code.replace(/^A/i, '')) || 0;
                const numB = parseInt(b.code.replace(/^A/i, '')) || 0;
                return numA - numB;
            });

            console.log(`[Supplier Loader] ✅ State updated with ${state.nccNames.length} suppliers`);

        } catch (error) {
            console.error('[Supplier Loader] ❌ Error updating state:', error);
            throw error;
        }
    },

    // =====================================================
    // FETCH SUPPLIERS FOR DISPLAY ONLY (No Firebase save)
    // =====================================================
    async fetchSuppliersForDisplay() {
        const utils = window.SoOrderUtils;

        try {
            console.log('[Supplier Loader] 🚀 Fetching suppliers for display...');

            // Show loading toast
            if (utils && utils.showToast) {
                utils.showToast('Đang tải danh sách NCC từ TPOS...', 'info');
            }

            // Step 1: Get TPOS token
            const token = await this.getTPOSToken();

            // Step 2: Fetch suppliers from TPOS
            const suppliers = await this.fetchSuppliersFromTPOS(token);

            if (!suppliers || suppliers.length === 0) {
                console.warn('[Supplier Loader] ⚠️ No suppliers found');
                if (utils && utils.showToast) {
                    utils.showToast('Không tìm thấy NCC nào từ TPOS', 'warning');
                }
                return { success: false, suppliers: [] };
            }

            console.log(`[Supplier Loader] ✅ Fetched ${suppliers.length} suppliers for display`);

            // Return all suppliers (including duplicates)
            return { success: true, suppliers: suppliers };

        } catch (error) {
            console.error('[Supplier Loader] ❌ Error fetching suppliers for display:', error);

            // Show error toast
            if (utils && utils.showToast) {
                let errorMsg = 'Lỗi tải danh sách NCC';

                if (error.message.includes('401') || error.message.includes('Token')) {
                    errorMsg = 'Lỗi xác thực TPOS';
                } else if (error.message.includes('network') || error.message.includes('fetch')) {
                    errorMsg = 'Lỗi kết nối mạng';
                }

                utils.showToast(`${errorMsg}: ${error.message}`, 'error');
            }

            return { success: false, error: error.message, suppliers: [] };
        }
    },

    // =====================================================
    // MAIN FUNCTION: Load Suppliers from TPOS and Save to Firebase
    // =====================================================
    async loadAndSaveSuppliers() {
        const utils = window.SoOrderUtils;

        try {
            console.log('[Supplier Loader] 🚀 Starting supplier load process...');

            // Show loading toast
            if (utils && utils.showToast) {
                utils.showToast('Đang tải danh sách NCC từ TPOS...', 'info');
            }

            // Step 1: Get TPOS token
            const token = await this.getTPOSToken();

            // Step 2: Fetch suppliers from TPOS
            const suppliers = await this.fetchSuppliersFromTPOS(token);

            if (!suppliers || suppliers.length === 0) {
                console.warn('[Supplier Loader] ⚠️ No suppliers found');
                if (utils && utils.showToast) {
                    utils.showToast('Không tìm thấy NCC nào từ TPOS', 'warning');
                }
                return { success: false, count: 0 };
            }

            // Step 3: Save to Firebase (with Ax code extraction and duplicate handling)
            const result = await this.saveSuppliersToFirebase(suppliers);

            // Step 4: Update application state from Firebase (to get the final saved data)
            await this.updateStateFromFirebase();

            // Show success toast
            if (utils && utils.showToast) {
                const state = window.SoOrderState;
                utils.showToast(`✅ Đã lưu ${state.nccNames.length} NCC vào hệ thống`, 'success');
            }

            console.log('[Supplier Loader] ✅ Supplier load process completed successfully');

            return { success: true, count: result.count };

        } catch (error) {
            console.error('[Supplier Loader] ❌ Error in load process:', error);

            // Show error toast
            if (utils && utils.showToast) {
                let errorMsg = 'Lỗi tải danh sách NCC';

                if (error.message.includes('401') || error.message.includes('Token')) {
                    errorMsg = 'Lỗi xác thực TPOS';
                } else if (error.message.includes('network') || error.message.includes('fetch')) {
                    errorMsg = 'Lỗi kết nối mạng';
                } else if (error.message.includes('Firebase')) {
                    errorMsg = 'Lỗi lưu vào Firebase';
                }

                utils.showToast(`${errorMsg}: ${error.message}`, 'error');
            }

            return { success: false, error: error.message };
        }
    }
};
