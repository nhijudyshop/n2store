// =====================================================
// MIGRATION SCRIPT: Update Admin Users with Full detailedPermissions
//
// PURPOSE: Migrate from admin bypass system to unified detailedPermissions
// - All users (including Admin) now use detailedPermissions
// - Admin template = all permissions set to true
// - NO bypass based on roleTemplate
//
// USAGE: Include this script in index-admin.html or run from console
// Call: migrateAdminUsers() to execute migration
// =====================================================

/**
 * Generate full detailedPermissions object with all permissions = true
 * Based on PAGES_REGISTRY
 */
function generateFullAdminPermissions() {
    // All pages and their permissions
    const fullPermissions = {
        // SALES
        live: {
            view: true,
            upload: true,
            edit: true,
            delete: true
        },
        livestream: {
            view: true,
            export: true,
            edit: true,
            analytics: true
        },
        sanphamlive: {
            view: true,
            add: true,
            edit: true,
            delete: true,
            pricing: true,
            stock: true
        },
        ib: {
            view: true,
            reply: true,
            assign: true,
            archive: true,
            export: true,
            delete: true
        },

        // WAREHOUSE
        nhanhang: {
            view: true,
            create: true,
            confirm: true,
            edit: true,
            cancel: true,
            weigh: true,
            delete: true
        },
        inventoryTracking: {
            tab_tracking: true,
            tab_congNo: true,
            create_shipment: true,
            edit_shipment: true,
            delete_shipment: true,
            view_chiPhiHangVe: true,
            edit_chiPhiHangVe: true,
            view_ghiChuAdmin: true,
            edit_ghiChuAdmin: true,
            edit_soMonThieu: true,
            create_prepayment: true,
            edit_prepayment: true,
            delete_prepayment: true,
            create_otherExpense: true,
            edit_otherExpense: true,
            delete_otherExpense: true,
            edit_invoice_from_finance: true,
            edit_shipping_from_finance: true,
            export_data: true
        },
        hangrotxa: {
            view: true,
            mark: true,
            approve: true,
            price: true,
            delete: true
        },
        hanghoan: {
            view: true,
            approve: true,
            reject: true,
            refund: true,
            update: true,
            export: true
        },
        "product-search": {
            view: true,
            viewStock: true,
            viewPrice: true,
            export: true
        },
        "soluong-live": {
            view: true,
            edit: true,
            adjust: true,
            export: true
        },

        // ORDERS
        ck: {
            view: true,
            verify: true,
            edit: true,
            export: true,
            delete: true
        },
        "order-management": {
            view: true,
            create: true,
            edit: true,
            updateStatus: true,
            cancel: true,
            export: true,
            print: true
        },
        "order-log": {
            view: true,
            add: true,
            edit: true,
            delete: true,
            export: true
        },
        "order-live-tracking": {
            view: true,
            track: true,
            update: true,
            export: true
        },

        // REPORTS
        baocaosaleonline: {
            view: true,
            viewRevenue: true,
            viewDetails: true,
            export: true,
            compare: true
        },
        "tpos-pancake": {
            view: true,
            sync: true,
            import: true,
            export: true,
            configure: true
        },

        // ADMIN
        "user-management": {
            view: true,
            create: true,
            edit: true,
            delete: true,
            permissions: true,
            resetPassword: true,
            manageTemplates: true
        },
        "balance-history": {
            view: true,
            viewDetails: true,
            export: true,
            adjust: true
        },
        "customer-management": {
            view: true,
            add: true,
            edit: true,
            delete: true,
            export: true,
            viewHistory: true
        },
        "invoice-compare": {
            view: true,
            compare: true,
            import: true,
            export: true,
            resolve: true
        },
        lichsuchinhsua: {
            view: true,
            viewDetails: true,
            export: true,
            restore: true,
            delete: true
        }
    };

    return fullPermissions;
}

/**
 * Count total permissions
 */
function countPermissions(perms) {
    let count = 0;
    Object.values(perms).forEach(pagePerms => {
        count += Object.values(pagePerms).filter(v => v === true).length;
    });
    return count;
}

/**
 * Migrate all admin users to have full detailedPermissions
 */
async function migrateAdminUsers() {
    console.log("========================================");
    console.log("MIGRATION: Admin Full Permissions");
    console.log("========================================");

    if (!window.db) {
        console.error("Firebase not connected!");
        alert("Firebase not connected! Please connect first.");
        return { success: false, error: "Firebase not connected" };
    }

    const fullPermissions = generateFullAdminPermissions();
    const totalPerms = countPermissions(fullPermissions);
    console.log(`Full permissions object has ${totalPerms} permissions`);

    try {
        // Get all users
        const usersSnapshot = await window.db.collection("users").get();
        const users = [];
        usersSnapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
        });

        console.log(`Found ${users.length} users`);

        // Find admin users (roleTemplate='admin' OR checkLogin=0)
        const adminUsers = users.filter(user =>
            user.roleTemplate === 'admin' ||
            user.checkLogin === 0 ||
            user.checkLogin === "0"
        );

        console.log(`Found ${adminUsers.length} admin users to migrate`);

        if (adminUsers.length === 0) {
            console.log("No admin users found to migrate");
            return { success: true, migrated: 0, users: [] };
        }

        const results = [];
        const batch = window.db.batch();

        for (const user of adminUsers) {
            console.log(`Processing: ${user.id} (${user.displayName})`);

            const userRef = window.db.collection("users").doc(user.id);

            // Update user with full permissions and admin template
            batch.update(userRef, {
                roleTemplate: 'admin',
                detailedPermissions: fullPermissions,
                migrationNote: `Migrated to full detailedPermissions on ${new Date().toISOString()}`,
                lastModified: new Date().toISOString()
            });

            results.push({
                id: user.id,
                displayName: user.displayName,
                previousRoleTemplate: user.roleTemplate,
                previousCheckLogin: user.checkLogin,
                newPermissionCount: totalPerms
            });
        }

        // Commit batch
        await batch.commit();

        console.log("========================================");
        console.log("MIGRATION COMPLETE!");
        console.log(`Migrated ${results.length} admin users`);
        console.log("========================================");

        // Log results
        results.forEach(r => {
            console.log(`  - ${r.id}: ${r.displayName} (${r.newPermissionCount} permissions)`);
        });

        return { success: true, migrated: results.length, users: results };

    } catch (error) {
        console.error("Migration error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Preview which users will be migrated (dry run)
 */
async function previewMigration() {
    console.log("========================================");
    console.log("PREVIEW: Admin Migration (Dry Run)");
    console.log("========================================");

    if (!window.db) {
        console.error("Firebase not connected!");
        return;
    }

    try {
        const usersSnapshot = await window.db.collection("users").get();
        const users = [];
        usersSnapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
        });

        // Find admin users
        const adminUsers = users.filter(user =>
            user.roleTemplate === 'admin' ||
            user.checkLogin === 0 ||
            user.checkLogin === "0"
        );

        console.log(`Total users: ${users.length}`);
        console.log(`Admin users to migrate: ${adminUsers.length}`);
        console.log("");

        adminUsers.forEach(user => {
            const currentPerms = user.detailedPermissions ? countPermissions(user.detailedPermissions) : 0;
            console.log(`  ${user.id}:`);
            console.log(`    - Display Name: ${user.displayName}`);
            console.log(`    - roleTemplate: ${user.roleTemplate || 'N/A'}`);
            console.log(`    - checkLogin: ${user.checkLogin}`);
            console.log(`    - Current permissions: ${currentPerms}`);
            console.log(`    - Will have: ${countPermissions(generateFullAdminPermissions())} permissions`);
        });

        return adminUsers;
    } catch (error) {
        console.error("Preview error:", error);
    }
}

/**
 * Migrate a single user by username
 */
async function migrateSingleUser(username) {
    console.log(`Migrating single user: ${username}`);

    if (!window.db) {
        console.error("Firebase not connected!");
        return { success: false, error: "Firebase not connected" };
    }

    const fullPermissions = generateFullAdminPermissions();

    try {
        const userRef = window.db.collection("users").doc(username);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            console.error(`User ${username} not found!`);
            return { success: false, error: "User not found" };
        }

        await userRef.update({
            roleTemplate: 'admin',
            detailedPermissions: fullPermissions,
            migrationNote: `Migrated to full detailedPermissions on ${new Date().toISOString()}`,
            lastModified: new Date().toISOString()
        });

        console.log(`Successfully migrated ${username} with ${countPermissions(fullPermissions)} permissions`);
        return { success: true, username, permissionCount: countPermissions(fullPermissions) };

    } catch (error) {
        console.error("Migration error:", error);
        return { success: false, error: error.message };
    }
}

// Export functions
window.migrateAdminUsers = migrateAdminUsers;
window.previewMigration = previewMigration;
window.migrateSingleUser = migrateSingleUser;
window.generateFullAdminPermissions = generateFullAdminPermissions;

console.log("========================================");
console.log("Admin Migration Script Loaded");
console.log("========================================");
console.log("Available functions:");
console.log("  - previewMigration() : Preview users to migrate");
console.log("  - migrateAdminUsers() : Migrate all admin users");
console.log("  - migrateSingleUser('username') : Migrate single user");
console.log("  - generateFullAdminPermissions() : Get full permissions object");
console.log("========================================");
