/**
 * NCC Manager for Purchase Orders
 * Provides: load NCCs from Firebase, autocomplete suggestions, create new NCC + TPOS Partner
 * Reads from shared Firebase collection "ncc-names" (same as soorder module)
 */

window.NCCManager = (function() {
    'use strict';

    const COLLECTION = 'ncc-names';
    const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    let nccNames = [];
    let loaded = false;
    let exactMatchNCC = null;

    // =====================================================
    // LOAD NCC NAMES FROM FIREBASE
    // =====================================================

    async function loadNCCNames() {
        try {
            const db = firebase.firestore();
            const snapshot = await db.collection(COLLECTION).get();
            nccNames = [];

            snapshot.forEach((doc) => {
                const data = doc.data();
                nccNames.push({
                    code: data.axCode || doc.id.toUpperCase(),
                    tposCode: data.tposCode || doc.id,
                    docId: doc.id,
                    name: data.name
                });
            });

            // Sort: Ax codes first (by number), then alphabetical
            nccNames.sort((a, b) => {
                const aIsAx = /^A\d+$/i.test(a.code);
                const bIsAx = /^A\d+$/i.test(b.code);
                if (aIsAx && bIsAx) {
                    return (parseInt(a.code.replace(/^A/i, '')) || 0)
                         - (parseInt(b.code.replace(/^A/i, '')) || 0);
                }
                if (aIsAx) return -1;
                if (bIsAx) return 1;
                return a.name.localeCompare(b.name);
            });

            loaded = true;
            console.log(`[NCCManager] Loaded ${nccNames.length} suppliers from Firebase`);
            return nccNames;
        } catch (error) {
            console.error('[NCCManager] Failed to load NCC names:', error);
            return [];
        }
    }

    // =====================================================
    // PARSE AX CODE
    // =====================================================

    function parseAxCode(name) {
        if (!name) return null;
        const match = name.trim().match(/^(A\d+)/i);
        return match ? match[1].toUpperCase() : null;
    }

    // =====================================================
    // AUTOCOMPLETE SUGGESTIONS
    // =====================================================

    function showSuggestions(inputEl, dropdownEl) {
        if (!inputEl || !dropdownEl) return;

        const value = inputEl.value.trim().toLowerCase();
        exactMatchNCC = null;
        dropdownEl.innerHTML = '';

        if (!value || nccNames.length === 0) {
            dropdownEl.style.display = 'none';
            return;
        }

        // Filter matching NCC names
        const matches = nccNames.filter(ncc =>
            ncc.name.toLowerCase().includes(value)
        );

        // Find exact Ax code match
        const exactMatch = nccNames.find(ncc =>
            ncc.code.toLowerCase() === value
        );
        if (exactMatch) exactMatchNCC = exactMatch;

        // If no matches, show "Create new" option
        if (matches.length === 0) {
            const createItem = document.createElement('div');
            createItem.style.cssText = 'padding: 10px 12px; cursor: pointer; color: #3b82f6; font-size: 13px; display: flex; align-items: center; gap: 6px;';
            createItem.innerHTML = `<span style="font-size: 16px;">+</span> Tạo NCC mới: <strong>${escapeHtml(inputEl.value.trim())}</strong>`;
            createItem.addEventListener('click', async () => {
                dropdownEl.style.display = 'none';
                await handleCreateSupplier(inputEl.value.trim(), inputEl);
            });
            createItem.addEventListener('mouseenter', () => createItem.style.background = '#f0f9ff');
            createItem.addEventListener('mouseleave', () => createItem.style.background = '');
            dropdownEl.appendChild(createItem);
            dropdownEl.style.display = 'block';
            return;
        }

        // Render suggestion items
        matches.slice(0, 15).forEach(ncc => {
            const item = document.createElement('div');
            const isExact = exactMatch && ncc.code === exactMatch.code;
            item.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 13px;
                ${isExact ? 'background: linear-gradient(135deg, #eff6ff, #f0f9ff); border-left: 3px solid #3b82f6;' : ''}
            `;
            item.innerHTML = `
                <span style="
                    font-weight: 700;
                    color: #4f46e5;
                    min-width: 36px;
                    font-size: 12px;
                    background: #eef2ff;
                    padding: 2px 6px;
                    border-radius: 4px;
                    text-align: center;
                ">${escapeHtml(ncc.code)}</span>
                <span style="color: #374151;">${escapeHtml(ncc.name.substring(ncc.code.length))}</span>
                ${isExact ? '<span style="margin-left: auto; font-size: 10px; color: #9ca3af; background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">Tab ↹</span>' : ''}
            `;
            item.addEventListener('click', () => {
                inputEl.value = ncc.name;
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                dropdownEl.style.display = 'none';
                exactMatchNCC = null;
            });
            item.addEventListener('mouseenter', () => {
                if (!isExact) item.style.background = '#f9fafb';
            });
            item.addEventListener('mouseleave', () => {
                if (!isExact) item.style.background = '';
            });
            dropdownEl.appendChild(item);
        });

        // Add "Create new" at bottom if input doesn't exactly match any NCC
        const inputTrimmed = inputEl.value.trim();
        const hasExactNameMatch = nccNames.some(ncc => ncc.name.toLowerCase() === inputTrimmed.toLowerCase());
        if (!hasExactNameMatch && inputTrimmed.length > 0) {
            const sep = document.createElement('div');
            sep.style.cssText = 'border-top: 1px solid #e5e7eb; margin: 4px 0;';
            dropdownEl.appendChild(sep);

            const createItem = document.createElement('div');
            createItem.style.cssText = 'padding: 8px 12px; cursor: pointer; color: #3b82f6; font-size: 13px; display: flex; align-items: center; gap: 6px;';
            createItem.innerHTML = `<span style="font-size: 16px;">+</span> Tạo NCC mới: <strong>${escapeHtml(inputTrimmed)}</strong>`;
            createItem.addEventListener('click', async () => {
                dropdownEl.style.display = 'none';
                await handleCreateSupplier(inputTrimmed, inputEl);
            });
            createItem.addEventListener('mouseenter', () => createItem.style.background = '#f0f9ff');
            createItem.addEventListener('mouseleave', () => createItem.style.background = '');
            dropdownEl.appendChild(createItem);
        }

        dropdownEl.style.display = 'block';
    }

    function hideSuggestions(dropdownEl) {
        if (dropdownEl) dropdownEl.style.display = 'none';
        exactMatchNCC = null;
    }

    function handleTabSelect(inputEl, dropdownEl) {
        if (!exactMatchNCC) return false;
        inputEl.value = exactMatchNCC.name;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        hideSuggestions(dropdownEl);
        return true;
    }

    // =====================================================
    // CREATE NEW SUPPLIER
    // =====================================================

    async function handleCreateSupplier(name, inputEl) {
        if (!name || !name.trim()) return;
        const trimmedName = name.trim();

        const showToast = window.notificationManager?.show?.bind(window.notificationManager)
            || ((msg, type) => console.log(`[NCCManager] ${type}: ${msg}`));

        try {
            // Save to Firebase
            const db = firebase.firestore();
            const axCode = parseAxCode(trimmedName);
            const docId = axCode ? axCode.toUpperCase() : trimmedName.replace(/[\/\\\\.#$\[\]\s]/g, '_').substring(0, 30);

            await db.collection(COLLECTION).doc(docId).set({
                name: trimmedName,
                axCode: axCode || null,
                tposCode: docId
            });

            // Update local cache
            const existing = nccNames.findIndex(n => n.docId === docId);
            const newEntry = { code: axCode || docId, tposCode: docId, docId, name: trimmedName };
            if (existing >= 0) {
                nccNames[existing] = newEntry;
            } else {
                nccNames.push(newEntry);
                nccNames.sort((a, b) => {
                    const aIsAx = /^A\d+$/i.test(a.code);
                    const bIsAx = /^A\d+$/i.test(b.code);
                    if (aIsAx && bIsAx) {
                        return (parseInt(a.code.replace(/^A/i, '')) || 0)
                             - (parseInt(b.code.replace(/^A/i, '')) || 0);
                    }
                    if (aIsAx) return -1;
                    if (bIsAx) return 1;
                    return a.name.localeCompare(b.name);
                });
            }

            console.log(`[NCCManager] Saved NCC "${trimmedName}" to Firebase`);

            // Try to create Partner on TPOS (fire-and-forget)
            createTPOSPartner(trimmedName).catch(err => {
                console.warn('[NCCManager] TPOS Partner creation failed (non-blocking):', err);
            });

            // Auto-fill input
            if (inputEl) {
                inputEl.value = trimmedName;
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            }

            showToast(`Đã tạo NCC mới: ${trimmedName}`, 'success');
            return { success: true };
        } catch (error) {
            console.error('[NCCManager] Create supplier failed:', error);
            showToast('Lỗi khi tạo NCC: ' + error.message, 'error');
            return { success: false, error: error.message };
        }
    }

    async function createTPOSPartner(name) {
        if (!window.TPOSClient?.authenticatedFetch) {
            console.warn('[NCCManager] TPOSClient not available, skipping TPOS Partner creation');
            return;
        }

        const url = `${PROXY_URL}/api/odata/Partner`;
        const payload = {
            Name: name,
            Supplier: true,
            Active: true,
            Customer: false
        };

        const response = await window.TPOSClient.authenticatedFetch(url, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log(`[NCCManager] TPOS Partner created: "${name}"`);
        } else if (response.status === 400) {
            // Likely "already exists" — treat as success
            console.log(`[NCCManager] TPOS Partner may already exist: "${name}" (400)`);
        } else {
            const text = await response.text().catch(() => '');
            console.warn(`[NCCManager] TPOS Partner creation returned ${response.status}:`, text);
        }
    }

    // =====================================================
    // HELPERS
    // =====================================================

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // =====================================================
    // INIT
    // =====================================================

    console.log('[NCCManager] Module loaded');

    return {
        loadNCCNames,
        showSuggestions,
        hideSuggestions,
        handleTabSelect,
        createSupplier: handleCreateSupplier,
        parseAxCode,
        getNccNames: () => nccNames,
        isLoaded: () => loaded
    };
})();
