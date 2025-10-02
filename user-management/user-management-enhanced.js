// =====================================================
// USER MANAGEMENT WITH DETAILED PERMISSIONS
// =====================================================

let db = null;
let auth = null;
let currentMethod = "cryptojs";
let users = [];

// Check admin access
function checkAdminAccess() {
    const checkLogin = localStorage.getItem("checkLogin");
    const isLoggedIn = localStorage.getItem("isLoggedIn");
    const authData = localStorage.getItem("loginindex_auth");

    console.log("Checking admin access:", {
        checkLogin,
        isLoggedIn,
        authData: !!authData,
    });

    if (!isLoggedIn || isLoggedIn !== "true") {
        showAccessDenied("Bạn chưa đăng nhập hệ thống.");
        return false;
    }

    if (!checkLogin || (checkLogin !== "0" && checkLogin !== 0)) {
        showAccessDenied("Bạn không có quyền Admin.");
        return false;
    }

    try {
        const auth = JSON.parse(authData);
        document.getElementById("currentUser").textContent =
            auth.displayName || auth.username || "Admin";
    } catch (e) {
        document.getElementById("currentUser").textContent = "Admin";
    }

    document.getElementById("mainContainer").style.display = "block";

    setTimeout(connectFirebase, 500);

    return true;
}

function showAccessDenied(reason = "") {
    document.getElementById("accessDenied").style.display = "block";
    document.getElementById("mainContainer").style.display = "none";

    if (reason) {
        const msg = document.querySelector("#accessDenied p");
        msg.innerHTML =
            reason + "<br>Chỉ có Admin mới có thể quản lý tài khoản.";
    }
}

// Firebase Configuration
function connectFirebase() {
    try {
        if (!firebase.apps.length) {
            const config = {
                apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
                authDomain: "n2shop-69e37.firebaseapp.com",
                projectId: "n2shop-69e37",
                storageBucket: "n2shop-69e37-ne0q1",
                messagingSenderId: "598906493303",
                appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
            };

            const app = firebase.initializeApp(config);
            db = firebase.firestore();
            auth = firebase.auth();
        }

        document.getElementById("firebaseStatus").textContent =
            "✅ Kết nối Firebase thành công!\nProject: n2shop-69e37\nTrạng thái: Admin Access Granted";
        document.getElementById("firebaseStatus").className = "output success";

        setTimeout(loadUsers, 1000);
    } catch (error) {
        document.getElementById("firebaseStatus").textContent =
            "❌ Lỗi kết nối Firebase: " + error.message;
        document.getElementById("firebaseStatus").className = "output error";
    }
}

// Load users
async function loadUsers() {
    if (!db) {
        showError("Firebase chưa được kết nối!");
        return;
    }

    const userList = document.getElementById("userList");
    userList.innerHTML =
        '<div class="empty-state show"><i data-lucide="loader" class="spinning"></i><h3>Đang tải dữ liệu...</h3></div>';

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    try {
        const snapshot = await db.collection("users").get();
        users = [];

        snapshot.forEach((doc) => {
            users.push({
                id: doc.id,
                ...doc.data(),
            });
        });

        if (users.length === 0) {
            userList.innerHTML =
                '<div class="empty-state show"><i data-lucide="user-x"></i><h3>Không có tài khoản nào</h3></div>';
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
            return;
        }

        users.sort((a, b) => {
            if (a.checkLogin !== b.checkLogin) {
                return a.checkLogin - b.checkLogin;
            }
            return a.displayName.localeCompare(b.displayName);
        });

        renderUserList(users);
    } catch (error) {
        userList.innerHTML = `<div class="empty-state show"><i data-lucide="alert-circle"></i><h3>Lỗi tải danh sách</h3><p>${error.message}</p></div>`;
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }
}

// Render user list
function renderUserList(users) {
    const userList = document.getElementById("userList");
    const emptyState = userList.querySelector(".empty-state");

    if (!users || users.length === 0) {
        if (emptyState) emptyState.classList.add("show");
        return;
    }

    if (emptyState) emptyState.classList.remove("show");

    let html = "";
    users.forEach((user) => {
        const roleClass = getRoleClass(user.checkLogin);
        const roleIcon = getRoleIcon(user.checkLogin);

        // Count detailed permissions
        let permissionCount = 0;
        if (user.detailedPermissions) {
            Object.values(user.detailedPermissions).forEach((pagePerms) => {
                permissionCount += Object.values(pagePerms).filter(
                    (v) => v === true,
                ).length;
            });
        }

        // Total permissions available
        let totalPerms = 0;
        Object.values(DETAILED_PERMISSIONS).forEach((page) => {
            totalPerms += Object.keys(page.subPermissions).length;
        });

        const createdDate = user.createdAt
            ? new Date(user.createdAt.seconds * 1000).toLocaleDateString(
                  "vi-VN",
              )
            : "N/A";
        const updatedDate = user.updatedAt
            ? " | Cập nhật: " +
              new Date(user.updatedAt.seconds * 1000).toLocaleDateString(
                  "vi-VN",
              )
            : "";

        html += `
            <div class="user-list-item">
                <div class="user-list-info">
                    <div class="user-avatar-large">
                        <i data-lucide="user"></i>
                    </div>
                    <div class="user-list-details">
                        <div class="user-list-name">${user.displayName} <span style="color: var(--text-tertiary); font-weight: normal">(${user.id})</span></div>
                        <div class="user-list-meta">
                            <span class="user-role-badge ${roleClass}">
                                <i data-lucide="${roleIcon}"></i>
                                ${getRoleName(user.checkLogin)}
                            </span>
                            <span><i data-lucide="shield-check" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${permissionCount}/${totalPerms} quyền</span>
                            <span><i data-lucide="calendar" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${createdDate}${updatedDate}</span>
                        </div>
                    </div>
                </div>
                <div class="user-list-actions">
                    <button class="btn-icon" onclick="editUser('${user.id}')" title="Chỉnh sửa">
                        <i data-lucide="edit"></i>
                    </button>
                    <button class="btn-icon" onclick="viewUserPermissions('${user.id}')" title="Xem quyền">
                        <i data-lucide="eye"></i>
                    </button>
                    <button class="btn-icon danger" onclick="deleteUser('${user.id}')" title="Xóa">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
        `;
    });

    userList.innerHTML = html;
    lucide.createIcons();
}

// Helper functions
function getRoleClass(checkLogin) {
    const classes = {
        0: "admin",
        1: "user",
        2: "limited",
        3: "basic",
        777: "guest",
    };
    return classes[checkLogin] || "user";
}

function getRoleIcon(checkLogin) {
    const icons = {
        0: "crown",
        1: "user",
        2: "lock",
        3: "circle",
        777: "user-x",
    };
    return icons[checkLogin] || "user";
}

function getRoleName(checkLogin) {
    const names = {
        0: "Admin",
        1: "User",
        2: "Limited",
        3: "Basic",
        777: "Guest",
    };
    return names[checkLogin] || "Unknown";
}

function getRoleText(checkLogin) {
    return getRoleName(checkLogin);
}

// =====================================================
// USER MANAGEMENT CRUD OPERATIONS - PART 2
// =====================================================

// Edit user
function editUser(username) {
    const user = users.find((u) => u.id === username);
    if (!user) return;

    document.getElementById("editUsername").value = user.id;
    document.getElementById("editDisplayName").value = user.displayName;
    document.getElementById("editCheckLogin").value = user.checkLogin;
    document.getElementById("editNewPassword").value = "";

    // Load detailed permissions
    if (editPermissionsUI) {
        editPermissionsUI.setPermissions(user.detailedPermissions || {});
    }

    document.querySelector('[data-tab="manage"]').click();
    document
        .querySelector("#manage .card:nth-child(3)")
        .scrollIntoView({ behavior: "smooth" });
}

// View user permissions
function viewUserPermissions(username) {
    const user = users.find((u) => u.id === username);
    if (!user) return;

    let report = `QUYỀN HẠN CHI TIẾT\n`;
    report += `${"=".repeat(60)}\n\n`;
    report += `Tài khoản: ${user.displayName} (${user.id})\n`;
    report += `Vai trò: ${getRoleText(user.checkLogin)}\n\n`;

    const permissions = user.detailedPermissions || {};
    let totalGranted = 0;

    Object.values(DETAILED_PERMISSIONS).forEach((page) => {
        const pagePerms = permissions[page.id] || {};
        const granted = Object.entries(pagePerms).filter(
            ([_, v]) => v === true,
        );

        if (granted.length > 0) {
            report += `📄 ${page.name}\n`;
            granted.forEach(([subKey, _]) => {
                const subPerm = page.subPermissions[subKey];
                report += `   ✓ ${subPerm.name}\n`;
                totalGranted++;
            });
            report += "\n";
        }
    });

    if (totalGranted === 0) {
        report += "⚠️ Không có quyền nào được cấp\n";
    } else {
        report += `\nTổng cộng: ${totalGranted} quyền\n`;
    }

    alert(report);
}

// Update user
async function updateUser() {
    if (!db) {
        showError("Firebase chưa được kết nối!");
        return;
    }

    const username = document.getElementById("editUsername").value.trim();
    const displayName = document.getElementById("editDisplayName").value.trim();
    const checkLogin = parseInt(
        document.getElementById("editCheckLogin").value,
    );
    const newPassword = document.getElementById("editNewPassword").value.trim();

    if (!username || !displayName) {
        showError("Vui lòng nhập đầy đủ thông tin!");
        return;
    }

    // Get detailed permissions from UI
    const detailedPermissions = editPermissionsUI
        ? editPermissionsUI.getPermissions()
        : {};

    const loadingId = showFloatingAlert(
        "Đang cập nhật tài khoản...",
        "loading",
    );

    try {
        let updateData = {
            displayName: displayName,
            checkLogin: checkLogin,
            detailedPermissions: detailedPermissions,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: JSON.parse(localStorage.getItem("loginindex_auth"))
                .username,
        };

        if (newPassword) {
            const salt = CryptoJS.lib.WordArray.random(128 / 8).toString();
            const hash = CryptoJS.PBKDF2(newPassword, salt, {
                keySize: 256 / 32,
                iterations: 1000,
            }).toString();

            updateData.passwordHash = hash;
            updateData.salt = salt;
        }

        await db.collection("users").doc(username).update(updateData);

        if (window.notify) {
            window.notify.remove(loadingId);
        }

        // Count permissions
        let permCount = 0;
        Object.values(detailedPermissions).forEach((pagePerms) => {
            permCount += Object.values(pagePerms).filter(
                (v) => v === true,
            ).length;
        });

        showSuccess(
            `Cập nhật thành công!\nUsername: ${username}\nTên hiển thị: ${displayName}\nQuyền hạn: ${getRoleText(checkLogin)}\nQuyền chi tiết: ${permCount} quyền${newPassword ? "\n🔒 Đã thay đổi password" : ""}`,
        );

        setTimeout(loadUsers, 1000);
        setTimeout(() => {
            clearEditForm();
        }, 3000);
    } catch (error) {
        if (window.notify) {
            window.notify.remove(loadingId);
        }
        showError("Lỗi cập nhật: " + error.message);
    }
}

// Create user
async function createUser() {
    if (!db) {
        showError("Firebase chưa được kết nối!");
        return;
    }

    const username = document
        .getElementById("newUsername")
        .value.trim()
        .toLowerCase();
    const password = document.getElementById("newPassword").value.trim();
    const displayName =
        document.getElementById("newDisplayName").value.trim() ||
        username.charAt(0).toUpperCase() + username.slice(1);
    const checkLogin = parseInt(document.getElementById("newCheckLogin").value);

    if (!username || !password) {
        showError("Vui lòng nhập username và password!");
        return;
    }

    if (!/^[a-z0-9_]+$/.test(username)) {
        showError(
            "Username chỉ được chứa chữ cái thường, số và dấu gạch dưới!",
        );
        return;
    }

    if (password.length < 6) {
        showError("Password phải có ít nhất 6 ký tự!");
        return;
    }

    // Get detailed permissions from UI
    const detailedPermissions = newPermissionsUI
        ? newPermissionsUI.getPermissions()
        : {};

    const loadingId = showFloatingAlert("Đang tạo tài khoản...", "loading");

    try {
        const userDoc = await db.collection("users").doc(username).get();
        if (userDoc.exists) {
            if (window.notify) {
                window.notify.remove(loadingId);
            }
            showError("Username đã tồn tại!");
            return;
        }

        const salt = CryptoJS.lib.WordArray.random(128 / 8).toString();
        const hash = CryptoJS.PBKDF2(password, salt, {
            keySize: 256 / 32,
            iterations: 1000,
        }).toString();

        await db
            .collection("users")
            .doc(username)
            .set({
                displayName: displayName,
                checkLogin: checkLogin,
                detailedPermissions: detailedPermissions,
                passwordHash: hash,
                salt: salt,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: JSON.parse(localStorage.getItem("loginindex_auth"))
                    .username,
            });

        if (window.notify) {
            window.notify.remove(loadingId);
        }

        // Count permissions
        let permCount = 0;
        Object.values(detailedPermissions).forEach((pagePerms) => {
            permCount += Object.values(pagePerms).filter(
                (v) => v === true,
            ).length;
        });

        showSuccess(
            `Tạo tài khoản thành công!\n\nUsername: ${username}\nTên hiển thị: ${displayName}\nQuyền hạn: ${getRoleText(checkLogin)}\nQuyền chi tiết: ${permCount} quyền\n🔒 Password đã được hash an toàn`,
        );

        clearCreateForm();
        setTimeout(loadUsers, 1000);
    } catch (error) {
        if (window.notify) {
            window.notify.remove(loadingId);
        }
        showError("Lỗi tạo tài khoản: " + error.message);
    }
}

// Delete user
async function deleteUser(username) {
    if (!db) {
        showError("Firebase chưa được kết nối!");
        return;
    }

    const user = users.find((u) => u.id === username);
    if (!user) return;

    const adminCount = users.filter((u) => u.checkLogin === 0).length;
    if (user.checkLogin === 0 && adminCount === 1) {
        showError(
            "Không thể xóa admin cuối cùng!\nHệ thống phải có ít nhất 1 admin.",
        );
        return;
    }

    // Count permissions
    let permCount = 0;
    if (user.detailedPermissions) {
        Object.values(user.detailedPermissions).forEach((pagePerms) => {
            permCount += Object.values(pagePerms).filter(
                (v) => v === true,
            ).length;
        });
    }

    const confirmMsg = `XÁC NHẬN XÓA TÀI KHOẢN\n\nUsername: ${username}\nTên: ${user.displayName}\nQuyền hạn: ${getRoleText(user.checkLogin)}\nQuyền chi tiết: ${permCount} quyền\n\nHành động này KHÔNG THỂ HOÀN TÁC!\n\nBạn có chắc chắn muốn xóa?`;

    if (!confirm(confirmMsg)) {
        return;
    }

    const loadingId = showFloatingAlert("Đang xóa tài khoản...", "loading");

    try {
        await db.collection("users").doc(username).delete();

        try {
            const authUsersSnapshot = await db
                .collection("auth_users")
                .where("username", "==", username)
                .get();
            authUsersSnapshot.forEach(async (doc) => {
                await doc.ref.delete();
            });
        } catch (authError) {
            console.log("Could not delete from auth_users:", authError);
        }

        if (window.notify) {
            window.notify.remove(loadingId);
        }

        showSuccess(`Đã xóa tài khoản "${username}" thành công!`);
        loadUsers();
    } catch (error) {
        if (window.notify) {
            window.notify.remove(loadingId);
        }
        showError("Lỗi xóa tài khoản: " + error.message);
    }
}

// Load permissions overview
async function loadPermissionsOverview() {
    if (!db) {
        showError("Firebase chưa được kết nối!");
        return;
    }

    const overview = document.getElementById("permissionsOverview");
    overview.innerHTML =
        '<div class="empty-state show"><i data-lucide="loader" class="spinning"></i><h3>Đang tải dữ liệu...</h3></div>';

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    try {
        const snapshot = await db.collection("users").get();
        const permissionStats = {};
        const roleStats = {};

        // Initialize stats
        Object.values(DETAILED_PERMISSIONS).forEach((page) => {
            permissionStats[page.id] = {};
            Object.keys(page.subPermissions).forEach((subKey) => {
                permissionStats[page.id][subKey] = {
                    name: page.subPermissions[subKey].name,
                    icon: page.subPermissions[subKey].icon,
                    pageName: page.name,
                    count: 0,
                    users: [],
                };
            });
        });

        let totalUsers = 0;

        snapshot.forEach((doc) => {
            const user = doc.data();
            totalUsers++;

            const role = getRoleText(user.checkLogin);
            roleStats[role] = (roleStats[role] || 0) + 1;

            const permissions = user.detailedPermissions || {};
            Object.entries(permissions).forEach(([pageId, pagePerms]) => {
                Object.entries(pagePerms).forEach(([subKey, granted]) => {
                    if (
                        granted &&
                        permissionStats[pageId] &&
                        permissionStats[pageId][subKey]
                    ) {
                        permissionStats[pageId][subKey].count++;
                        permissionStats[pageId][subKey].users.push(
                            user.displayName || doc.id,
                        );
                    }
                });
            });
        });

        let html = `
            <div style="background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <h3><i data-lucide="bar-chart-2" style="width:20px;height:20px;display:inline-block;vertical-align:middle;margin-right:8px;"></i>Thống Kê Tổng Quan</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px;">
        `;

        Object.entries(roleStats).forEach(([role, count]) => {
            html += `
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 24px; font-weight: bold; color: #007bff;">${count}</div>
                    <div style="font-size: 14px; color: #6c757d;">${role}</div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
            <div style="background: white; padding: 20px; border-radius: 10px;">
                <h3><i data-lucide="shield-check" style="width:20px;height:20px;display:inline-block;vertical-align:middle;margin-right:8px;"></i>Thống Kê Quyền Chi Tiết</h3>
                <div style="margin-top: 15px;">
        `;

        // Group by page
        Object.entries(permissionStats).forEach(([pageId, subPerms]) => {
            const page = DETAILED_PERMISSIONS[pageId];

            html += `<div style="margin-bottom: 25px;">`;
            html += `<h4 style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">`;
            html += `<i data-lucide="${page.icon}" style="width:18px;height:18px;"></i>`;
            html += `${page.name}</h4>`;

            Object.entries(subPerms).forEach(([subKey, stats]) => {
                const percentage =
                    totalUsers > 0
                        ? Math.round((stats.count / totalUsers) * 100)
                        : 0;

                html += `
                    <div style="margin-bottom: 12px; padding: 12px; border: 1px solid #dee2e6; border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span style="font-size: 0.875rem;"><i data-lucide="${stats.icon}" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;"></i>${stats.name}</span>
                            <span style="background: #007bff; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px;">
                                ${stats.count}/${totalUsers} (${percentage}%)
                            </span>
                        </div>
                        <div style="background: #e9ecef; height: 6px; border-radius: 3px; overflow: hidden;">
                            <div style="background: #007bff; height: 100%; width: ${percentage}%; transition: width 0.3s ease;"></div>
                        </div>
                        ${
                            stats.users.length > 0
                                ? `
                            <div style="margin-top: 6px; font-size: 11px; color: #6c757d;">
                                <strong>Users:</strong> ${stats.users.join(", ")}
                            </div>
                        `
                                : ""
                        }
                    </div>
                `;
            });

            html += `</div>`;
        });

        html += "</div></div>";
        overview.innerHTML = html;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    } catch (error) {
        overview.innerHTML = `<div class="empty-state show"><i data-lucide="alert-circle"></i><h3>Lỗi tải thống kê</h3><p>${error.message}</p></div>`;
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }
}

// Export permissions
async function exportPermissions() {
    if (users.length === 0) {
        showError("Vui lòng tải danh sách users trước!");
        return;
    }

    try {
        let csv = "Username,Display Name,Role,";

        // Add all permission columns
        Object.values(DETAILED_PERMISSIONS).forEach((page) => {
            Object.values(page.subPermissions).forEach((subPerm) => {
                csv += `${page.name} - ${subPerm.name},`;
            });
        });
        csv += "Total Permissions,Created Date\n";

        users.forEach((user) => {
            const permissions = user.detailedPermissions || {};
            const createdDate = user.createdAt
                ? new Date(user.createdAt.seconds * 1000).toLocaleDateString(
                      "vi-VN",
                  )
                : "N/A";

            csv += `${user.id},"${user.displayName}","${getRoleText(user.checkLogin)}",`;

            let totalPerms = 0;
            Object.values(DETAILED_PERMISSIONS).forEach((page) => {
                Object.keys(page.subPermissions).forEach((subKey) => {
                    const hasPermission =
                        permissions[page.id]?.[subKey] || false;
                    csv += hasPermission ? "YES," : "NO,";
                    if (hasPermission) totalPerms++;
                });
            });

            csv += `${totalPerms},"${createdDate}"\n`;
        });

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);

        link.setAttribute("href", url);
        link.setAttribute(
            "download",
            `N2Shop_Detailed_Permissions_${new Date().toISOString().split("T")[0]}.csv`,
        );
        link.style.visibility = "hidden";

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showSuccess("Đã xuất báo cáo quyền chi tiết thành công!");
    } catch (error) {
        showError("Lỗi xuất báo cáo: " + error.message);
    }
}

// Export users
async function exportUsers() {
    if (users.length === 0) {
        showError("Không có dữ liệu để xuất!");
        return;
    }

    try {
        let csv =
            "Username,Display Name,Role,Role Code,Total Permissions,Created Date,Updated Date\n";

        users.forEach((user) => {
            const createdDate = user.createdAt
                ? new Date(user.createdAt.seconds * 1000).toLocaleDateString(
                      "vi-VN",
                  )
                : "N/A";
            const updatedDate = user.updatedAt
                ? new Date(user.updatedAt.seconds * 1000).toLocaleDateString(
                      "vi-VN",
                  )
                : "N/A";

            let permCount = 0;
            if (user.detailedPermissions) {
                Object.values(user.detailedPermissions).forEach((pagePerms) => {
                    permCount += Object.values(pagePerms).filter(
                        (v) => v === true,
                    ).length;
                });
            }

            csv += `${user.id},"${user.displayName}","${getRoleText(user.checkLogin)}",${user.checkLogin},${permCount},"${createdDate}","${updatedDate}"\n`;
        });

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);

        link.setAttribute("href", url);
        link.setAttribute(
            "download",
            `N2Shop_Users_${new Date().toISOString().split("T")[0]}.csv`,
        );
        link.style.visibility = "hidden";

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showSuccess("✅ Đã xuất file CSV thành công!");
    } catch (error) {
        showError("❌ Lỗi xuất file: " + error.message);
    }
}

// Clear forms
function clearEditForm() {
    document.getElementById("editUsername").value = "";
    document.getElementById("editDisplayName").value = "";
    document.getElementById("editCheckLogin").value = "1";
    document.getElementById("editNewPassword").value = "";

    if (editPermissionsUI) {
        editPermissionsUI.setPermissions({});
    }

    const output = document.getElementById("editOutput");
    output.style.display = "none";
    output.textContent = "";
    output.className = "output";
}

function clearCreateForm() {
    document.getElementById("newUsername").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("newDisplayName").value = "";
    document.getElementById("newCheckLogin").value = "1";

    if (newPermissionsUI) {
        newPermissionsUI.setPermissions({});
    }

    const output = document.getElementById("createOutput");
    output.style.display = "none";
    output.textContent = "";
    output.className = "output";
}

// Helper functions for notifications
function showFloatingAlert(message, type = "info") {
    if (window.notify) {
        if (type === "loading") {
            return window.notify.loading(message);
        }
        window.notify.show(message, type, 3000);
    }
}

function showSuccess(message) {
    if (window.notify) {
        window.notify.success(message);
    }
}

function showError(message) {
    if (window.notify) {
        window.notify.error(message);
    }
}

// Auto-fill display name
document.getElementById("newUsername")?.addEventListener("input", function () {
    const username = this.value.trim();
    if (username && !document.getElementById("newDisplayName").value) {
        document.getElementById("newDisplayName").value =
            username.charAt(0).toUpperCase() + username.slice(1);
    }
});

// Initialize page
document.addEventListener("DOMContentLoaded", function () {
    console.log("Enhanced User Management page loading...");

    if (!checkAdminAccess()) {
        return;
    }

    console.log(
        "Enhanced User Management initialized with detailed permissions",
    );

    setTimeout(() => {
        if (typeof CryptoJS !== "undefined" && typeof bcrypt !== "undefined") {
            console.log("✅ Crypto libraries loaded successfully");
        } else {
            console.warn("⚠️ Some crypto libraries failed to load");
        }
    }, 1000);
});

console.log(
    "Enhanced User Management System with Detailed Permissions initialized",
);
