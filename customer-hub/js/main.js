/**
 * Main.js - Initialize the page based on current URL
 */

// Wait for DOM ready
document.addEventListener('DOMContentLoaded', async () => {
    // Determine which page we're on
    const path = window.location.pathname;

    if (path.includes('customer-detail.html')) {
        // Customer detail page
        if (typeof CustomerDetail !== 'undefined') {
            await CustomerDetail.init();
        }
    } else {
        // Customer list page (index.html)
        if (typeof CustomerList !== 'undefined') {
            await CustomerList.init();
        }
    }
});
