// filter-system.js - Fixed
// High-Performance Filter System with Fixed Checkbox Logic

class FilterManager {
    constructor() {
        this.filters = APP_STATE.currentFilters;
        this.isProcessing = false;
        this.filterWorker = null;
        this.indexedData = null;
        this.filterCache = new Map();
        this.lastFilterHash = null;

        // Performance optimization settings based on device
        this.settings = deviceDetector.getOptimalSettings();
        this.chunkSize = this.settings.filterChunkSize;

        this.init();
    }

    init() {
        this.createFilterUI();
        this.bindEvents();
        this.initializeWorker();

        console.log(
            "Filter system initialized with chunk size:",
            this.chunkSize,
        );
    }

    createFilterUI() {
        const existingFilter = domManager.get(SELECTORS.filterSystem);
        if (existingFilter) {
            existingFilter.remove();
        }

        const today = new Date();
        const tzOffset = today.getTimezoneOffset() * 60000;
        const localISODate = new Date(today - tzOffset)
            .toISOString()
            .split("T")[0];

        const filterContainer = domManager.create("div", {
            id: "improvedFilterSystem",
            className: "filter-system",
            innerHTML: this.getFilterHTML(localISODate),
        });

        const tableContainer = domManager.get(SELECTORS.tableContainer);
        if (tableContainer && tableContainer.parentNode) {
            tableContainer.parentNode.insertBefore(
                filterContainer,
                tableContainer,
            );
        }

        // Set initial filter values
        this.filters.startDate = localISODate;
        this.filters.endDate = localISODate;
    }

    getFilterHTML(localISODate) {
        return `
            <style>
                .filter-system {
                    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                    padding: 20px;
                    border-radius: 12px;
                    margin: 20px 0;
                    border: 1px solid #dee2e6;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    transition: all 0.3s ease;
                }
                
                .filter-system:hover {
                    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                }
                
                .filter-row {
                    display: flex;
                    gap: 15px;
                    align-items: end;
                    flex-wrap: wrap;
                    margin-bottom: 15px;
                }
                
                .filter-group {
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                    min-width: 150px;
                    position: relative;
                }
                
                .filter-group label {
                    font-weight: 600;
                    color: #495057;
                    font-size: 14px;
                    margin-bottom: 5px;
                }
                
                .filter-input, .filter-select {
                    padding: 10px 14px;
                    border: 2px solid #ced4da;
                    border-radius: 8px;
                    background: white;
                    font-size: 14px;
                    transition: all 0.3s ease;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                
                .filter-input:focus, .filter-select:focus {
                    outline: none;
                    border-color: #007bff;
                    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.25);
                    transform: translateY(-1px);
                }
                
                .filter-btn {
                    padding: 10px 18px;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.3s ease;
                    margin-right: 8px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                    position: relative;
                    overflow: hidden;
                }
                
                .filter-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                }
                
                .filter-btn:active {
                    transform: translateY(0);
                }
                
                .filter-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    transform: none;
                }
                
                .clear-btn {
                    background: linear-gradient(135deg, #dc3545, #c82333);
                    color: white;
                }
                
                .clear-btn:hover:not(:disabled) {
                    background: linear-gradient(135deg, #c82333, #bd2130);
                }
                
                .today-btn {
                    background: linear-gradient(135deg, #17a2b8, #138496);
                    color: white;
                }
                
                .today-btn:hover:not(:disabled) {
                    background: linear-gradient(135deg, #138496, #117a8b);
                }
                
                .all-btn {
                    background: linear-gradient(135deg, #28a745, #218838);
                    color: white;
                }
                
                .all-btn:hover:not(:disabled) {
                    background: linear-gradient(135deg, #218838, #1e7e34);
                }
                
                .filter-info {
                    background: linear-gradient(135deg, #e7f3ff, #cce7ff);
                    border: 2px solid #b3d4fc;
                    padding: 12px;
                    border-radius: 8px;
                    font-size: 13px;
                    color: #0c5460;
                    text-align: center;
                    margin-top: 15px;
                    animation: slideIn 0.3s ease;
                }
                
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                .hidden {
                    display: none;
                }
                
                .filter-loading {
                    position: relative;
                }
                
                .filter-loading::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    right: 10px;
                    width: 16px;
                    height: 16px;
                    margin-top: -8px;
                    border: 2px solid #f3f3f3;
                    border-top: 2px solid #007bff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                .filter-performance {
                    font-size: 11px;
                    color: #6c757d;
                    margin-top: 8px;
                    text-align: right;
                }
                
                @media (max-width: 768px) {
                    .filter-row {
                        flex-direction: column;
                        align-items: stretch;
                    }
                    
                    .filter-group {
                        min-width: auto;
                    }
                    
                    .filter-btn {
                        margin-bottom: 5px;
                        margin-right: 0;
                    }
                }
            </style>
            
            <div class="filter-row">
                <div class="filter-group">
                    <label>Từ ngày:</label>
                    <input type="date" id="startDateFilter" class="filter-input" value="${localISODate}">
                </div>
                
                <div class="filter-group">
                    <label>Đến ngày:</label>
                    <input type="date" id="endDateFilter" class="filter-input" value="${localISODate}">
                </div>
                
                <div class="filter-group">
                    <label for="statusFilterDropdown">Trạng thái:</label>
                    <select id="statusFilterDropdown" class="filter-select">
                        <option value="all">Tất cả</option>
                        <option value="active">Chưa đi đơn</option>
                        <option value="completed">Đã đi đơn</option>
                    </select>
                </div>
                
                <div class="filter-group">
                    <label>&nbsp;</label>
                    <div>
                        <button id="todayFilterBtn" class="filter-btn today-btn">📅 Hôm nay</button>
                        <button id="allFilterBtn" class="filter-btn all-btn">📋 Tất cả</button>
                        <button id="clearFiltersBtn" class="filter-btn clear-btn">🗑️ Xóa lọc</button>
                    </div>
                </div>
            </div>
            
            <div id="filterInfo" class="filter-info hidden"></div>
            <div id="filterPerformance" class="filter-performance"></div>
        `;
    }

    bindEvents() {
        // Debounced event handlers for better performance
        const debouncedDateChange = throttleManager.debounce(
            () => this.handleDateRangeChange(),
            CONFIG.performance.FILTER_DEBOUNCE_DELAY,
            "dateFilter",
        );

        const debouncedStatusChange = throttleManager.debounce(
            () => this.handleFilterChange(),
            CONFIG.performance.FILTER_DEBOUNCE_DELAY,
            "statusFilter",
        );

        // Bind events
        const startDateFilter = domManager.get(SELECTORS.startDateFilter);
        const endDateFilter = domManager.get(SELECTORS.endDateFilter);
        const statusFilter = domManager.get(SELECTORS.statusFilterDropdown);
        const todayBtn = domManager.get(SELECTORS.todayFilterBtn);
        const allBtn = domManager.get(SELECTORS.allFilterBtn);
        const clearBtn = domManager.get(SELECTORS.clearFiltersBtn);

        if (startDateFilter)
            startDateFilter.addEventListener("change", debouncedDateChange);
        if (endDateFilter)
            endDateFilter.addEventListener("change", debouncedDateChange);
        if (statusFilter)
            statusFilter.addEventListener("change", debouncedStatusChange);
        if (todayBtn)
            todayBtn.addEventListener("click", () => this.setTodayFilter());
        if (allBtn) allBtn.addEventListener("click", () => this.setAllFilter());
        if (clearBtn)
            clearBtn.addEventListener("click", () => this.clearAllFilters());
    }

    initializeWorker() {
        // Create Web Worker for filtering if supported
        if (
            typeof Worker !== "undefined" &&
            this.settings.enableWebWorkers !== false
        ) {
            try {
                const workerCode = this.getWorkerCode();
                const blob = new Blob([workerCode], {
                    type: "application/javascript",
                });
                this.filterWorker = new Worker(URL.createObjectURL(blob));

                this.filterWorker.onmessage = (e) => {
                    this.handleWorkerResult(e.data);
                };

                this.filterWorker.onerror = (error) => {
                    console.warn("Filter worker error:", error);
                    this.filterWorker = null;
                };

                console.log("Filter worker initialized");
            } catch (error) {
                console.warn("Could not initialize filter worker:", error);
                this.filterWorker = null;
            }
        }
    }

    getWorkerCode() {
        return `
            self.onmessage = function(e) {
                const { data, filters, chunkSize } = e.data;
                
                try {
                    const result = filterData(data, filters, chunkSize);
                    self.postMessage({
                        success: true,
                        result: result,
                        filteredCount: result.length
                    });
                } catch (error) {
                    self.postMessage({
                        success: false,
                        error: error.message
                    });
                }
            };
            
            function filterData(data, filters, chunkSize) {
                const { startDate, endDate, status } = filters;
                
                // Pre-calculate date bounds
                const startTime = startDate ? new Date(startDate + "T00:00:00").getTime() : null;
                const endTime = endDate ? new Date(endDate + "T23:59:59").getTime() : null;
                
                const filtered = [];
                
                // Process in chunks to avoid blocking
                for (let i = 0; i < data.length; i += chunkSize) {
                    const chunk = data.slice(i, i + chunkSize);
                    
                    for (const item of chunk) {
                        // Fast date check
                        if (startTime || endTime) {
                            const timestamp = parseFloat(item.dateCell);
                            const itemTime = new Date(timestamp).getTime();
                            
                            if (startTime && itemTime < startTime) continue;
                            if (endTime && itemTime > endTime) continue;
                        }
                        
                        // FIXED: Status check with correct logic
                        // status: "active" = chưa đi đơn = muted: false
                        // status: "completed" = đã đi đơn = muted: true
                        if (status === "active" && item.muted === true) continue;
                        if (status === "completed" && item.muted === false) continue;
                        
                        filtered.push(item);
                    }
                }
                
                return filtered;
            }
        `;
    }

    preprocessData(data) {
        if (!data || data.length === 0) return data;

        performanceMonitor.start("preprocessData");

        // Create indexed version for faster filtering
        const indexed = data.map((item, index) => {
            if (!item._indexed) {
                const timestamp = parseFloat(item.dateCell);
                const itemDate = new Date(timestamp);

                item._formattedDate = formatDate(itemDate);
                item._dateTime = itemDate.getTime();
                item._index = index;
                item._indexed = true;

                // FIXED: Ensure muted is boolean
                if (item.muted === undefined || item.muted === null) {
                    item.muted = false; // Default: chưa đi đơn
                } else {
                    item.muted = Boolean(item.muted);
                }
            }
            return item;
        });

        this.indexedData = indexed;

        performanceMonitor.end("preprocessData");
        return indexed;
    }

    generateFilterHash(filters) {
        return JSON.stringify({
            startDate: filters.startDate,
            endDate: filters.endDate,
            status: filters.status,
        });
    }

    getCachedFilter(hash) {
        const cached = this.filterCache.get(hash);
        if (cached && Date.now() - cached.timestamp < 30000) {
            // 30 second cache
            return cached.result;
        }
        return null;
    }

    setCachedFilter(hash, result) {
        // Limit cache size
        if (this.filterCache.size > 10) {
            const firstKey = this.filterCache.keys().next().value;
            this.filterCache.delete(firstKey);
        }

        this.filterCache.set(hash, {
            result: result,
            timestamp: Date.now(),
        });
    }

    async applyFilters(data = APP_STATE.arrayData) {
        if (this.isProcessing || APP_STATE.isOperationInProgress) {
            console.log("Filter already in progress, skipping");
            return;
        }

        this.isProcessing = true;
        const startTime = performance.now();

        try {
            // Show loading state
            this.showFilterLoading(true);

            // Generate filter hash for caching
            const filterHash = this.generateFilterHash(this.filters);

            // Check cache first
            const cachedResult = this.getCachedFilter(filterHash);
            if (cachedResult && filterHash === this.lastFilterHash) {
                console.log("Using cached filter result");
                await this.handleFilterResult(cachedResult, startTime);
                return;
            }

            // Preprocess data if needed
            const processedData = this.preprocessData(data);

            // Use Web Worker if available for large datasets
            if (this.filterWorker && processedData.length > 1000) {
                console.log("Using Web Worker for filtering");
                this.filterWorker.postMessage({
                    data: processedData,
                    filters: this.filters,
                    chunkSize: this.chunkSize,
                });
            } else {
                // Use main thread with optimized filtering
                console.log("Using main thread for filtering");
                const result = await this.filterDataOptimized(processedData);
                await this.handleFilterResult(result, startTime);
            }

            this.lastFilterHash = filterHash;
        } catch (error) {
            console.error("Filter error:", error);
            this.showFilterError("Có lỗi xảy ra khi lọc dữ liệu");
        } finally {
            this.isProcessing = false;
            this.showFilterLoading(false);
        }
    }

    async filterDataOptimized(data) {
        return new Promise((resolve) => {
            const { startDate, endDate, status } = this.filters;

            // Pre-calculate date bounds once
            const startTime = startDate
                ? new Date(startDate + "T00:00:00").getTime()
                : null;
            const endTime = endDate
                ? new Date(endDate + "T23:59:59").getTime()
                : null;

            let filteredResults = [];
            let processedCount = 0;

            console.log("Filtering with criteria:", {
                startDate,
                endDate,
                status,
                startTime,
                endTime,
                totalItems: data.length,
            });

            const processChunk = (startIndex) => {
                const endIndex = Math.min(
                    startIndex + this.chunkSize,
                    data.length,
                );
                const chunk = data.slice(startIndex, endIndex);

                // Process chunk
                const chunkResults = [];
                for (const item of chunk) {
                    // Fast date check using pre-calculated timestamp
                    if (startTime || endTime) {
                        const itemTime =
                            item._dateTime ||
                            new Date(parseFloat(item.dateCell)).getTime();

                        if (startTime && itemTime < startTime) continue;
                        if (endTime && itemTime > endTime) continue;
                    }

                    // FIXED: Status check with correct logic
                    // status: "active" = chưa đi đơn = muted: false (checkbox unchecked)
                    // status: "completed" = đã đi đơn = muted: true (checkbox checked)
                    if (status === "active" && item.muted === true) {
                        continue; // Skip items that are completed (muted=true) when looking for active
                    }
                    if (status === "completed" && item.muted === false) {
                        continue; // Skip items that are active (muted=false) when looking for completed
                    }

                    chunkResults.push(item);
                }

                filteredResults = filteredResults.concat(chunkResults);
                processedCount = endIndex;

                // Update progress
                const progress = Math.round(
                    (processedCount / data.length) * 100,
                );
                this.updateFilterProgress(progress);

                // Continue processing or resolve
                if (endIndex < data.length) {
                    // Use requestIdleCallback or setTimeout for non-blocking processing
                    const nextTick =
                        window.requestIdleCallback ||
                        ((cb) => setTimeout(cb, 0));

                    nextTick(() => processChunk(endIndex));
                } else {
                    console.log("Filter completed:", {
                        originalCount: data.length,
                        filteredCount: filteredResults.length,
                        criteria: { startDate, endDate, status },
                    });
                    resolve(filteredResults);
                }
            };

            // Start processing
            processChunk(0);
        });
    }

    handleWorkerResult(data) {
        if (data.success) {
            this.handleFilterResult(data.result, performance.now());
        } else {
            console.error("Worker filter error:", data.error);
            this.showFilterError("Có lỗi xảy ra khi lọc dữ liệu");
        }
    }

    async handleFilterResult(result, startTime) {
        const filterTime = performance.now() - startTime;

        console.log("Filter result received:", {
            resultCount: result.length,
            filterTime: `${filterTime.toFixed(2)}ms`,
            filters: this.filters,
        });

        // Cache the result
        const filterHash = this.generateFilterHash(this.filters);
        this.setCachedFilter(filterHash, result);

        // Update application state
        APP_STATE.filteredData = result;

        // Sort results (maintain date order, muted items at bottom)
        const sortedResults = this.sortFilterResults(result);

        // Update table display
        await this.updateTableWithResults(sortedResults);

        // Update UI
        this.updateFilterInfo(result.length, APP_STATE.arrayData.length);
        this.updateTotalAmount();
        this.showFilterPerformance(filterTime, result.length);

        // Show success message
        const message = `Hiển thị ${result.length.toLocaleString()} giao dịch (${filterTime.toFixed(0)}ms)`;
        this.showFilterSuccess(message);

        // Dispatch event
        document.dispatchEvent(
            new CustomEvent(EVENTS.FILTER_CHANGED, {
                detail: {
                    filteredCount: result.length,
                    totalCount: APP_STATE.arrayData.length,
                    filterTime: filterTime,
                    filters: { ...this.filters },
                },
            }),
        );
    }

    sortFilterResults(results) {
        return ArrayUtils.fastSort(results, (a, b) => {
            // Primary sort: date (newest first)
            const timestampA = parseInt(a.dateCell) || 0;
            const timestampB = parseInt(b.dateCell) || 0;

            if (timestampB !== timestampA) {
                return timestampB - timestampA;
            }

            // Secondary sort: muted items to bottom (active first)
            // muted = false (chưa đi đơn) should come first
            // muted = true (đã đi đơn) should come last
            const mutedA = a.muted ? 1 : 0;
            const mutedB = b.muted ? 1 : 0;
            return mutedA - mutedB;
        });
    }

    async updateTableWithResults(results) {
        const tableBody = domManager.get(SELECTORS.tableBody);
        if (!tableBody) return;

        // Check if we should use virtual scrolling
        const virtualScrollManager = window.virtualScrollManager;

        if (
            virtualScrollManager &&
            virtualScrollManager.shouldUseVirtualScrolling(results.length)
        ) {
            console.log(`Using virtual scrolling for ${results.length} items`);
            virtualScrollManager.enable(results);
        } else {
            console.log(`Using normal rendering for ${results.length} items`);
            if (virtualScrollManager) {
                virtualScrollManager.disable();
            }
            await this.renderNormalTable(results);
        }
    }

    async renderNormalTable(results) {
        const tableBody = domManager.get(SELECTORS.tableBody);
        if (!tableBody) return;

        // Clear table
        tableBody.innerHTML = "";

        if (results.length === 0) return;

        // Render in batches for better performance
        const batchSize = this.settings.batchSize;
        let currentIndex = 0;

        const renderBatch = () => {
            const endIndex = Math.min(currentIndex + batchSize, results.length);
            const fragment = domManager.createFragment();

            for (let i = currentIndex; i < endIndex; i++) {
                const item = results[i];
                const timestamp = parseFloat(item.dateCell);
                const dateCellConvert = new Date(timestamp);
                const formattedTime = formatDate(dateCellConvert);

                if (formattedTime) {
                    const newRow = this.createTableRow(item, formattedTime);
                    if (newRow) {
                        fragment.appendChild(newRow);
                    }
                }
            }

            tableBody.appendChild(fragment);
            currentIndex = endIndex;

            // Continue if more items to render
            if (currentIndex < results.length) {
                // Use requestAnimationFrame for smooth rendering
                requestAnimationFrame(renderBatch);
            }
        };

        renderBatch();
    }

    // FIXED: createTableRow with proper checkbox logic
    createTableRow(item, formattedTime) {
        const newRow = domManager.create("tr");

        console.log("Creating table row for item:", {
            uniqueId: item.uniqueId,
            muted: item.muted,
            mutedType: typeof item.muted,
            noteCell: item.noteCell,
        });

        // Apply styling for muted items
        if (item.muted === true) {
            // muted = true = đã đi đơn = dimmed appearance
            newRow.style.cssText = "opacity: 0.4; background-color: #f8f9fa;";
            newRow.classList.add(CSS_CLASSES.muted);
            console.log("Applied muted styling (đã đi đơn)");
        } else {
            // muted = false = chưa đi đơn = normal appearance
            newRow.style.cssText = "opacity: 1.0;";
            newRow.classList.add(CSS_CLASSES.active);
            console.log("Applied active styling (chưa đi đơn)");
        }

        const cells = [
            { content: sanitizeInput(formattedTime), id: item.dateCell },
            { content: sanitizeInput(item.noteCell || "") },
            {
                content: item.amountCell
                    ? numberWithCommas(
                          sanitizeInput(item.amountCell.toString()).replace(
                              /[,\.]/g,
                              "",
                          ),
                      )
                    : "0",
            },
            { content: sanitizeInput(item.bankCell || "") },
            {
                content: null,
                type: "checkbox",
                checked: Boolean(item.muted), // FIXED: muted = true -> checked = true (đã đi đơn)
            },
            { content: sanitizeInput(item.customerInfoCell || "") },
            { content: null, type: "edit" },
            { content: null, type: "delete", userId: item.user || "Unknown" },
        ];

        const cellFragment = domManager.createFragment();

        cells.forEach((cellData) => {
            const cell = domManager.create("td");

            if (cellData.type === "checkbox") {
                console.log("Creating checkbox with state:", {
                    itemUniqueId: item.uniqueId,
                    itemMuted: item.muted,
                    checkboxChecked: cellData.checked,
                    meaning: cellData.checked ? "đã đi đơn" : "chưa đi đơn",
                });

                const checkbox = domManager.create("input", {
                    attributes: {
                        type: "checkbox",
                        checked: cellData.checked,
                    },
                    styles: {
                        width: "20px",
                        height: "20px",
                        cursor: "pointer",
                    },
                });
                cell.appendChild(checkbox);
            } else if (cellData.type === "edit") {
                const editButton = domManager.create("button", {
                    className: "edit-button",
                });
                cell.appendChild(editButton);
            } else if (cellData.type === "delete") {
                const deleteButton = domManager.create("button", {
                    className: "delete-button",
                    attributes: {
                        "data-user": cellData.userId,
                    },
                });
                cell.appendChild(deleteButton);
            } else {
                cell.textContent = cellData.content;
                if (cellData.id) cell.id = cellData.id;
            }

            cellFragment.appendChild(cell);
        });

        newRow.appendChild(cellFragment);
        newRow.setAttribute("data-unique-id", item.uniqueId);

        return newRow;
    }

    updateTotalAmount() {
        let totalAmount = 0;
        const dataToCalculate =
            APP_STATE.filteredData.length > 0
                ? APP_STATE.filteredData
                : APP_STATE.arrayData;

        console.log("Calculating total amount:", {
            dataSource: APP_STATE.filteredData.length > 0 ? "filtered" : "all",
            itemCount: dataToCalculate.length,
        });

        dataToCalculate.forEach((item) => {
            // Only count items that are not muted (chưa đi đơn)
            if (!item.muted) {
                const amountStr = item.amountCell || "0";
                const cleanAmount = amountStr.toString().replace(/[,\.]/g, "");
                const amount = parseFloat(cleanAmount);
                if (!isNaN(amount)) {
                    totalAmount += amount;
                    //console.log("Added to total:", {
                    //    uniqueId: item.uniqueId,
                    //    amount: amount,
                    //    muted: item.muted,
                    //    runningTotal: totalAmount,
                    //});
                }
            } else {
                //console.log("Skipped muted item:", {
                //   uniqueId: item.uniqueId,
                //    amount: item.amountCell,
                //    muted: item.muted,
                //});
            }
        });

        const totalAmountElement = domManager.get(SELECTORS.totalAmount);
        if (totalAmountElement) {
            totalAmountElement.innerText =
                "💰 Tổng Tiền: " + numberWithCommas(totalAmount) + ",000";
        }

        console.log("Total amount calculated:", {
            totalAmount: totalAmount,
            formattedTotal: numberWithCommas(totalAmount) + ",000",
        });
    }

    // Filter event handlers
    handleDateRangeChange() {
        if (this.isProcessing || APP_STATE.isOperationInProgress) return;

        const startDateFilter = domManager.get(SELECTORS.startDateFilter);
        const endDateFilter = domManager.get(SELECTORS.endDateFilter);

        if (!startDateFilter || !endDateFilter) return;

        let startDate = startDateFilter.value;
        let endDate = endDateFilter.value;

        // Auto-correct date range
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            [startDate, endDate] = [endDate, startDate];
            startDateFilter.value = startDate;
            endDateFilter.value = endDate;
        }

        this.filters.startDate = startDate;
        this.filters.endDate = endDate;

        console.log("Date range changed:", {
            startDate: startDate,
            endDate: endDate,
        });

        this.applyFilters();
    }

    handleFilterChange() {
        if (this.isProcessing || APP_STATE.isOperationInProgress) return;

        const statusFilter = domManager.get(SELECTORS.statusFilterDropdown);
        if (statusFilter) {
            this.filters.status = statusFilter.value;

            console.log("Status filter changed:", {
                newStatus: statusFilter.value,
                meaning:
                    statusFilter.value === "all"
                        ? "tất cả"
                        : statusFilter.value === "active"
                          ? "chưa đi đơn"
                          : "đã đi đơn",
            });

            this.applyFilters();
        }
    }

    setTodayFilter() {
        if (this.isProcessing || APP_STATE.isOperationInProgress) return;

        const today = new Date();
        const tzOffset = today.getTimezoneOffset() * 60000;
        const localISODate = new Date(today - tzOffset)
            .toISOString()
            .split("T")[0];

        const startDateFilter = domManager.get(SELECTORS.startDateFilter);
        const endDateFilter = domManager.get(SELECTORS.endDateFilter);

        if (startDateFilter) startDateFilter.value = localISODate;
        if (endDateFilter) endDateFilter.value = localISODate;

        this.filters.startDate = localISODate;
        this.filters.endDate = localISODate;

        console.log("Set today filter:", localISODate);

        this.applyFilters();
    }

    setAllFilter() {
        if (this.isProcessing || APP_STATE.isOperationInProgress) return;

        const startDateFilter = domManager.get(SELECTORS.startDateFilter);
        const endDateFilter = domManager.get(SELECTORS.endDateFilter);

        if (startDateFilter) startDateFilter.value = "";
        if (endDateFilter) endDateFilter.value = "";

        this.filters.startDate = null;
        this.filters.endDate = null;

        console.log("Set all filter (no date restrictions)");

        this.applyFilters();
    }

    clearAllFilters() {
        if (this.isProcessing || APP_STATE.isOperationInProgress) return;

        const startDateFilter = domManager.get(SELECTORS.startDateFilter);
        const endDateFilter = domManager.get(SELECTORS.endDateFilter);
        const statusFilter = domManager.get(SELECTORS.statusFilterDropdown);

        if (startDateFilter) startDateFilter.value = "";
        if (endDateFilter) endDateFilter.value = "";
        if (statusFilter) statusFilter.value = "all";

        this.filters = {
            startDate: null,
            endDate: null,
            status: "all",
        };

        console.log("Cleared all filters");

        this.applyFilters();
    }

    // UI feedback methods
    showFilterLoading(show) {
        const filterSystem = domManager.get(SELECTORS.filterSystem);
        const buttons = domManager.getAll(".filter-btn");

        if (show) {
            if (filterSystem) filterSystem.classList.add("filter-loading");
            buttons.forEach((btn) => (btn.disabled = true));
        } else {
            if (filterSystem) filterSystem.classList.remove("filter-loading");
            buttons.forEach((btn) => (btn.disabled = false));
        }
    }

    updateFilterProgress(progress) {
        const performanceEl = domManager.get("#filterPerformance");
        if (performanceEl) {
            performanceEl.textContent = `Lọc dữ liệu: ${progress}%`;
        }
    }

    showFilterPerformance(filterTime, itemCount) {
        const performanceEl = domManager.get("#filterPerformance");
        if (performanceEl) {
            const itemsPerMs = (itemCount / filterTime).toFixed(1);
            performanceEl.textContent = `Lọc ${itemCount.toLocaleString()} mục trong ${filterTime.toFixed(0)}ms (${itemsPerMs} mục/ms)`;
        }
    }

    updateFilterInfo(visibleCount, totalCount) {
        const filterInfo = domManager.get(SELECTORS.filterInfo);
        if (!filterInfo) return;

        if (visibleCount !== totalCount) {
            let filterText = `Hiển thị ${visibleCount.toLocaleString()} / ${totalCount.toLocaleString()} giao dịch`;

            // Add date range info
            if (this.filters.startDate || this.filters.endDate) {
                const startStr = this.filters.startDate
                    ? this.formatDateForDisplay(this.filters.startDate)
                    : "";
                const endStr = this.filters.endDate
                    ? this.formatDateForDisplay(this.filters.endDate)
                    : "";

                if (startStr && endStr) {
                    if (startStr === endStr) {
                        filterText += ` (ngày ${startStr})`;
                    } else {
                        filterText += ` (từ ${startStr} đến ${endStr})`;
                    }
                } else if (startStr) {
                    filterText += ` (từ ${startStr})`;
                } else if (endStr) {
                    filterText += ` (đến ${endStr})`;
                }
            }

            // Add status info
            if (this.filters.status !== "all") {
                const statusText =
                    this.filters.status === "active"
                        ? "chưa đi đơn"
                        : "đã đi đơn";
                filterText += ` - ${statusText}`;
            }

            filterInfo.innerHTML = filterText;
            filterInfo.classList.remove("hidden");
        } else {
            filterInfo.classList.add("hidden");
        }
    }

    formatDateForDisplay(dateStr) {
        if (!dateStr) return "";

        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return "";

        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();

        return `${day}/${month}/${year}`;
    }

    showFilterSuccess(message) {
        // Use existing floating alert system
        if (window.showSuccess) {
            window.showSuccess(message);
        }
    }

    showFilterError(message) {
        // Use existing floating alert system
        if (window.showError) {
            window.showError(message);
        }
    }

    // Public API
    getFilters() {
        return { ...this.filters };
    }

    setFilters(newFilters) {
        this.filters = { ...this.filters, ...newFilters };
        this.updateFilterUI();
        this.applyFilters();
    }

    updateFilterUI() {
        const startDateFilter = domManager.get(SELECTORS.startDateFilter);
        const endDateFilter = domManager.get(SELECTORS.endDateFilter);
        const statusFilter = domManager.get(SELECTORS.statusFilterDropdown);

        if (startDateFilter)
            startDateFilter.value = this.filters.startDate || "";
        if (endDateFilter) endDateFilter.value = this.filters.endDate || "";
        if (statusFilter) statusFilter.value = this.filters.status || "all";
    }

    reset() {
        this.filters = {
            startDate: null,
            endDate: null,
            status: "all",
        };
        this.filterCache.clear();
        this.lastFilterHash = null;
        this.updateFilterUI();
    }

    destroy() {
        // Clean up worker
        if (this.filterWorker) {
            this.filterWorker.terminate();
            this.filterWorker = null;
        }

        // Clear cache and timeouts
        this.filterCache.clear();
        throttleManager.clear("dateFilter");
        throttleManager.clear("statusFilter");

        // Remove UI
        const filterSystem = domManager.get(SELECTORS.filterSystem);
        if (filterSystem) {
            filterSystem.remove();
        }

        console.log("Filter system destroyed");
    }

    getStats() {
        return {
            isProcessing: this.isProcessing,
            cacheSize: this.filterCache.size,
            lastFilterHash: this.lastFilterHash,
            indexedDataSize: this.indexedData ? this.indexedData.length : 0,
            workerEnabled: !!this.filterWorker,
            chunkSize: this.chunkSize,
            settings: this.settings,
        };
    }
}

// Export
if (typeof module !== "undefined" && module.exports) {
    module.exports = { FilterManager };
} else {
    window.FilterManager = FilterManager;
}
