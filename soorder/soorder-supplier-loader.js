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
    // SAVE SUPPLIERS TO FIREBASE (OVERWRITE MODE)
    // =====================================================
    async saveSuppliersToFirebase(suppliers) {
        const config = window.SoOrderConfig;
        const utils = window.SoOrderUtils;

        if (!config || !config.nccNamesCollectionRef) {
            throw new Error('Firebase config not initialized');
        }

        try {
            console.log('[Supplier Loader] 💾 Saving suppliers to Firebase...');

            // Use batch write for better performance
            const batch = config.db.batch();
            let saveCount = 0;

            for (const supplier of suppliers) {
                // Extract Code and Name from TPOS Partner data
                const code = supplier.Code;
                const name = supplier.Name;

                if (!code || !name) {
                    console.warn('[Supplier Loader] ⚠️ Skipping invalid supplier:', supplier);
                    continue;
                }

                // Create/update document with Code as ID
                const docRef = config.nccNamesCollectionRef.doc(code.toUpperCase());
                batch.set(docRef, { name: name.trim() }, { merge: false }); // merge: false = overwrite

                saveCount++;
            }

            // Commit batch
            await batch.commit();

            console.log(`[Supplier Loader] ✅ Saved ${saveCount} suppliers to Firebase`);

            return { success: true, count: saveCount };

        } catch (error) {
            console.error('[Supplier Loader] ❌ Error saving to Firebase:', error);
            throw error;
        }
    },

    // =====================================================
    // UPDATE APPLICATION STATE
    // =====================================================
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

            // Add all suppliers to state
            for (const supplier of suppliers) {
                const code = supplier.Code;
                const name = supplier.Name;

                if (code && name) {
                    state.nccNames.push({
                        code: code.toUpperCase(),
                        name: name.trim()
                    });
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

            // Step 3: Save to Firebase (overwrite mode)
            await this.saveSuppliersToFirebase(suppliers);

            // Step 4: Update application state
            this.updateState(suppliers);

            // Show success toast
            if (utils && utils.showToast) {
                utils.showToast(`✅ Đã tải ${suppliers.length} NCC từ TPOS`, 'success');
            }

            console.log('[Supplier Loader] ✅ Supplier load process completed successfully');

            return { success: true, count: suppliers.length };

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
