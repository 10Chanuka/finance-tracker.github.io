import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    getAuth
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { auth, firebaseConfig } from "./firebase-config.js";
import {
    saveUserProfile,
    getUserProfile,
    subscribeToAllUsers,
    approveUser,
    deleteUserAccount,
    subscribeToMembers,
    addMember,
    updateMemberBalance,
    deleteMember,
    subscribeToBills,
    addBill,
    toggleBillPaidStatus,
    updateBill,
    deleteBill,
    subscribeToTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    subscribeToSettings,
    saveSettings
} from "./db.js";

// ==================== CONFIGURATION ====================
// Admin email configured for rasunchanuka20@gmail.com
const ADMIN_EMAIL = "rasunchanuka20@gmail.com";
// =======================================================

// --- Global Application State ---
let state = {
    currentUser: null,
    isAdminUser: false,
    isApproved: false,
    members: [],
    bills: [],
    transactions: [],
    allUsers: [], // Admin only: user list
    settings: {
        rentalAmount: 0,
        rentalDay: 1
    },
    currentSelectedMemberId: null, // Tracks which member's history is open
    currentSelectedBillCategory: null, // Tracks E-Bill or Water Bill history
    pendingMemberAdjustment: null
};

// Subscriptions storage to clean up on logout
let activeSubscriptions = [];

// Chart.js instance pointers
let myChart = null;
let utilitiesChart = null;

// --- DOM Elements ---
const elAuthContainer = document.getElementById("auth-container");
const elAppContainer = document.getElementById("app-container");
const elPendingContainer = document.getElementById("pending-container");

// Auth Tabs / Portals
const elTabPortalAdmin = document.getElementById("tab-portal-admin");
const elTabPortalMember = document.getElementById("tab-portal-member");
const elAdminPortalView = document.getElementById("admin-portal-view");
const elMemberPortalView = document.getElementById("member-portal-view");

// Forms
const elAdminLoginForm = document.getElementById("admin-login-form");
const elMemberLoginForm = document.getElementById("member-login-form");
const elMemberRegisterForm = document.getElementById("member-register-form");
const elAllocationForm = document.getElementById("allocation-form");
const elEditTransactionForm = document.getElementById("edit-transaction-form");
const elEditBillForm = document.getElementById("edit-bill-form");
const elRentalForm = document.getElementById("rental-form");
const elRentPaymentForm = document.getElementById("rent-payment-form");

// Switch Links
const elMemberRegisterLink = document.getElementById("member-register-link");
const elMemberLoginLink = document.getElementById("member-login-link");

// Pending View Info
const elPendingUserEmail = document.getElementById("pending-user-email");
const elBtnWhatsappNotify = document.getElementById("btn-whatsapp-notify");
const elBtnEmailNotify = document.getElementById("btn-email-notify");

// Dashboard / Layout elements
const elUserEmail = document.getElementById("user-email");
const elUserRole = document.getElementById("user-role");
const elLogoutBtn = document.getElementById("logout-btn");
const elPendingLogoutBtn = document.getElementById("pending-logout-btn");
const elThemeToggle = document.getElementById("theme-toggle");

const elAdminOnlyNav = document.querySelectorAll(".admin-only-nav");
const elAdminOnlyBtn = document.querySelectorAll(".admin-only-btn");

// Modals
const elMemberForm = document.getElementById("member-form");
const elMemberAdjustmentForm = document.getElementById("member-adjustment-form");
const elBillForm = document.getElementById("bill-form");
const elTransactionForm = document.getElementById("transaction-form");

// --- Core Auth Flow ---

// Bootstrap: Show login portals
function initAuthScreen() {
    elTabPortalMember.classList.remove("hidden");
    elTabPortalAdmin.classList.remove("hidden");
    switchPortalTab("member");
}

// Switches between Admin and Member login views
window.switchPortalTab = function (portalType) {
    if (portalType === "admin") {
        elTabPortalAdmin.classList.add("active");
        elTabPortalMember.classList.remove("active");
        elAdminPortalView.classList.remove("hidden");
        elMemberPortalView.classList.add("hidden");
    } else {
        elTabPortalMember.classList.add("active");
        elTabPortalAdmin.classList.remove("active");
        elMemberPortalView.classList.remove("hidden");
        elAdminPortalView.classList.add("hidden");
        // default back to login sub-form
        elMemberLoginForm.classList.remove("hidden");
        elMemberRegisterForm.classList.add("hidden");
    }
};

// Auth State Changed Listener
onAuthStateChanged(auth, async (user) => {
    if (user) {
        state.currentUser = user;
        let profile = null;

        // 1. Verify if user logging in is Admin by Email comparison
        if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            state.isAdminUser = true;
            state.isApproved = true;

            // Sync Admin state to Firestore to ensure user record exists
            await saveUserProfile(user.uid, user.email, true, true);
        } else {
            // It is a member user login/registration. Fetch profile.
            profile = await getUserProfile(user.uid);

            if (!profile) {
                // Member registering himself for the first time
                await saveUserProfile(user.uid, user.email, false, false);
                profile = { email: user.email, isAdmin: false, approved: false };
            }

            state.isAdminUser = false;
            state.isApproved = profile.approved;
        }

        // 2. Validate Portals
        const activeTabIsAdmin = elTabPortalAdmin.classList.contains("active");

        if (activeTabIsAdmin && !state.isAdminUser) {
            // Member logged in via Admin portal -> block and sign out
            alert("Security Alert: This account is not registered as an Administrator. Please log in via the Member Portal.");
            await signOut(auth);
            return;
        }

        // Set email display in header
        elUserEmail.innerText = user.email;

        // 3. Check Approval status
        if (!state.isApproved) {
            // Block user, show Pending screen
            elAuthContainer.classList.add("hidden");
            elAppContainer.classList.add("hidden");
            elPendingContainer.classList.remove("hidden");
            elPendingUserEmail.innerText = user.email;

            // WhatsApp Remind Link config
            const whatsappMsg = encodeURIComponent(`Hello Admin, I have registered as a member (${user.email}) on the Finance Tracker website. Please approve my access.`);
            elBtnWhatsappNotify.href = `https://api.whatsapp.com/send?phone=94764430820&text=${whatsappMsg}`;
            elBtnEmailNotify.href = `mailto:${ADMIN_EMAIL}?subject=Access Request&body=Hello Admin, I registered with email ${user.email}. Please approve my account.`;

            // Clean up any subscriptions
            activeSubscriptions.forEach(unsubscribe => unsubscribe());
            activeSubscriptions = [];
            if (utilitiesChart) {
                utilitiesChart.destroy();
                utilitiesChart = null;
            }
            return;
        }

        // User is authenticated and approved!
        elAuthContainer.classList.add("hidden");
        elPendingContainer.classList.add("hidden");
        elAppContainer.classList.remove("hidden");

        // Set Role Badge
        elUserRole.innerText = state.isAdminUser ? "Admin" : "Member";
        elUserRole.className = `user-role-badge ${state.isAdminUser ? 'admin' : 'viewer'}`;

        applyRoleAccessControls();
        startRealtimeSubscriptions();
    } else {
        // Logged Out
        state.currentUser = null;
        state.isAdminUser = false;
        state.isApproved = false;

        // Stop listeners
        activeSubscriptions.forEach(unsubscribe => unsubscribe());
        activeSubscriptions = [];
        if (utilitiesChart) {
            utilitiesChart.destroy();
            utilitiesChart = null;
        }

        elAppContainer.classList.add("hidden");
        elPendingContainer.classList.add("hidden");
        elAuthContainer.classList.remove("hidden");

        initAuthScreen();
    }
});

// Switch links between login/signup inside Member Portal
if (elMemberRegisterLink) {
    elMemberRegisterLink.addEventListener("click", (e) => {
        e.preventDefault();
        elMemberLoginForm.classList.add("hidden");
        elMemberRegisterForm.classList.remove("hidden");
    });
}
if (elMemberLoginLink) {
    elMemberLoginLink.addEventListener("click", (e) => {
        e.preventDefault();
        elMemberRegisterForm.classList.add("hidden");
        elMemberLoginForm.classList.remove("hidden");
    });
}

// Enforce Role-Based Access Controls on UI
function applyRoleAccessControls() {
    const isAdmin = state.isAdminUser;

    // Toggle navigation tab visibility (e.g. User management is admin only)
    elAdminOnlyNav.forEach(el => {
        if (isAdmin) {
            el.classList.remove("hidden");
        } else {
            el.classList.add("hidden");
        }
    });

    // Toggle action buttons (add / delete buttons) visibility/disable state
    elAdminOnlyBtn.forEach(btn => {
        if (isAdmin) {
            btn.classList.remove("hidden");
            btn.removeAttribute("disabled");
        } else {
            btn.classList.add("hidden");
            btn.setAttribute("disabled", "true");
        }
    });

    // Disable settings input fields for viewers
    const rentalInputs = elRentalForm.querySelectorAll("input, button");
    rentalInputs.forEach(input => {
        if (isAdmin) {
            input.removeAttribute("disabled");
        } else {
            input.setAttribute("disabled", "true");
        }
    });
}

// Start database listeners
function startRealtimeSubscriptions() {
    // 1. Members Subscribe
    const unsubMembers = subscribeToMembers((members) => {
        state.members = members;
        updateUI();
    });
    activeSubscriptions.push(unsubMembers);

    // 2. Bills Subscribe
    const unsubBills = subscribeToBills((bills) => {
        state.bills = bills;
        updateUI();
    });
    activeSubscriptions.push(unsubBills);

    // 3. Transactions Subscribe
    const unsubTransactions = subscribeToTransactions((transactions) => {
        state.transactions = transactions;
        updateUI();
    });
    activeSubscriptions.push(unsubTransactions);

    // 4. Settings Subscribe
    const unsubSettings = subscribeToSettings((settings) => {
        state.settings = settings;
        updateUI();
    });
    activeSubscriptions.push(unsubSettings);

    // 5. Admin only: Subscribe to user directory for approvals queue
    if (state.isAdminUser) {
        const unsubUsers = subscribeToAllUsers((users) => {
            state.allUsers = users;
            renderUserManagement();
        });
        activeSubscriptions.push(unsubUsers);
    }
}

// --- Auth Submissions Handlers ---

// Admin Login
elAdminLoginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("admin-email").value;
    const password = document.getElementById("admin-password").value;

    try {
        // Enforce Admin Portal tab marker
        elTabPortalAdmin.classList.add("active");
        elTabPortalMember.classList.remove("active");

        await signInWithEmailAndPassword(auth, email, password);
        elAdminLoginForm.reset();
    } catch (error) {
        console.error("Admin Login Error:", error);
        alert("Admin Login Failed: " + error.message);
    }
});

// Member Login
elMemberLoginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("member-email").value;
    const password = document.getElementById("member-password").value;

    try {
        elTabPortalMember.classList.add("active");
        elTabPortalAdmin.classList.remove("active");

        await signInWithEmailAndPassword(auth, email, password);
        elMemberLoginForm.reset();
    } catch (error) {
        console.error("Member Login Error:", error);
        alert("Member Login Failed: " + error.message);
    }
});

// Member Sign Up
elMemberRegisterForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("member-reg-email").value;
    const password = document.getElementById("member-reg-password").value;

    try {
        elTabPortalMember.classList.add("active");
        elTabPortalAdmin.classList.remove("active");

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        // Save as unapproved Member/Viewer
        await saveUserProfile(uid, email, false, false);
        elMemberRegisterForm.reset();
    } catch (error) {
        console.error("Member Sign Up Error:", error);
        alert("Member Sign Up Failed: " + error.message);
    }
});

// Logouts
elLogoutBtn.addEventListener("click", async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Sign Out Error:", error);
    }
});
elPendingLogoutBtn.addEventListener("click", async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Sign Out Error:", error);
    }
});

// --- Theme Toggle ---
function initTheme() {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
        document.body.classList.add("dark-theme");
        elThemeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        document.body.classList.remove("dark-theme");
        elThemeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    }
}

elThemeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark-theme");
    const isDark = document.body.classList.contains("dark-theme");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    elThemeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    if (state.bills.length || state.transactions.length) {
        updateUI();
    }
});

initTheme();

// --- Tab Switching ---
window.switchTab = function (tabId) {
    document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
    document.getElementById(`sec-${tabId}`).classList.remove("hidden");

    document.querySelectorAll(".tab-btn").forEach(el => {
        el.classList.remove("active");
    });
    const activeTabBtn = document.getElementById(`tab-${tabId}`);
    if (activeTabBtn) activeTabBtn.classList.add("active");

    // Refresh charts after tab visibility changes so canvas sizing is correct.
    if (tabId === "dashboard") {
        setTimeout(() => updateChart(), 0);
    }
    if (tabId === "bills") {
        setTimeout(() => updateUtilitiesChart(), 0);
    }
};

// --- Modal Helper Functions ---
window.openModal = function (id) {
    const overlay = document.getElementById(id);
    if (overlay) overlay.classList.add("active");

    // Populate active members dropdown for recording rent
    if (id === "rent-payment-modal") {
        const elRentMemberSelect = document.getElementById("rent-member-select");
        if (elRentMemberSelect) {
            elRentMemberSelect.innerHTML = state.members.map(m => `
                <option value="${m.id}">${m.name}</option>
            `).join('');
        }
    }
};

window.closeModal = function (id) {
    const overlay = document.getElementById(id);
    if (overlay) overlay.classList.remove("active");
    if (id === "member-history-modal") {
        state.currentSelectedMemberId = null;
    }
    if (id === "bill-history-modal") {
        state.currentSelectedBillCategory = null;
    }
    if (id === "member-adjustment-modal") {
        state.pendingMemberAdjustment = null;
        if (elMemberAdjustmentForm) {
            elMemberAdjustmentForm.reset();
        }
    }
};

// --- Admin: Render User Management Tab ---
function renderUserManagement() {
    if (!state.isAdminUser) return;

    const elPendingBody = document.getElementById("pending-approvals-body");
    const elActiveBody = document.getElementById("active-users-body");

    const pendingUsers = state.allUsers.filter(u => !u.approved && !u.isAdmin);
    const activeUsers = state.allUsers.filter(u => u.approved && !u.isAdmin);

    // 1. Render Pending queue
    if (pendingUsers.length === 0) {
        elPendingBody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; color: var(--text-secondary);" class="py-8">
                    No pending registration approvals.
                </td>
            </tr>`;
    } else {
        elPendingBody.innerHTML = pendingUsers.map(user => `
            <tr class="animate-fade-in">
                <td style="font-weight: 600;">${user.email}</td>
                <td>
                    <span class="badge badge-warning">Pending Approval</span>
                </td>
                <td>
                    <div style="display: flex; gap: 0.5rem;">
                        <button onclick="approveUserAction('${user.uid}')" class="btn btn-success" style="font-size: 0.75rem; padding: 0.35rem 0.7rem;">
                            <i class="fas fa-check"></i> Approve
                        </button>
                        <button onclick="rejectUserAction('${user.uid}')" class="btn btn-danger btn-icon" style="height: 28px; width: 28px;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    // 2. Render Active Viewers list
    if (activeUsers.length === 0) {
        elActiveBody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; color: var(--text-secondary);" class="py-8">
                    No active viewers registered.
                </td>
            </tr>`;
    } else {
        elActiveBody.innerHTML = activeUsers.map(user => `
            <tr class="animate-fade-in">
                <td style="font-weight: 550;">${user.email}</td>
                <td>
                    <span class="badge badge-success">Approved Viewer</span>
                </td>
                <td>
                    <button onclick="rejectUserAction('${user.uid}', true)" class="btn btn-danger" style="font-size: 0.75rem; padding: 0.35rem 0.7rem;">
                        <i class="fas fa-user-slash"></i> Revoke Access
                    </button>
                </td>
            </tr>
        `).join('');
    }
}

// User Admin Actions
window.approveUserAction = async function (uid) {
    if (!state.isAdminUser) return;
    try {
        await approveUser(uid);
        alert("User account approved successfully.");
    } catch (error) {
        console.error("Approve User Error:", error);
        alert("Failed to approve user: " + error.message);
    }
};

window.rejectUserAction = async function (uid, isRevoke = false) {
    if (!state.isAdminUser) return;
    const confirmMsg = isRevoke
        ? "Revoke access and delete this viewer's account?"
        : "Reject and delete this registration request?";

    if (confirm(confirmMsg)) {
        try {
            await deleteUserAccount(uid);
            alert("User account removed.");
        } catch (error) {
            console.error("Delete User Error:", error);
            alert("Failed to remove user account: " + error.message);
        }
    }
};

// --- Financial Core Calculations & UI Rendering ---

function formatCurrency(amount) {
    return `LKR ${parseFloat(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function updateChart(totalMonthlyPaidBills = 0, rentalAmount = 0, totalMonthlyGLExpense = 0) {
    const chartCanvas = document.getElementById("expenseChart");
    if (!chartCanvas || typeof Chart === "undefined") return;

    const values = [
        Number(totalMonthlyPaidBills) || 0,
        Number(rentalAmount) || 0,
        Number(totalMonthlyGLExpense) || 0
    ];
    const hasData = values.some(v => v > 0);

    if (myChart) {
        myChart.destroy();
        myChart = null;
    }

    myChart = new Chart(chartCanvas, {
        type: "doughnut",
        data: {
            labels: hasData
                ? ["Paid Utility Bills", "Monthly Rental Target", "General Ledger Expenses"]
                : ["No Data"],
            datasets: [{
                data: hasData ? values : [1],
                backgroundColor: hasData
                    ? ["#ef4444", "#3b82f6", "#f59e0b"]
                    : ["rgba(148, 163, 184, 0.35)"],
                borderColor: hasData
                    ? ["#ffffff", "#ffffff", "#ffffff"]
                    : ["#ffffff"],
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "62%",
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        color: getComputedStyle(document.body).getPropertyValue("--text-secondary").trim() || "#64748b",
                        padding: 14,
                        usePointStyle: true,
                        pointStyle: "circle"
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            if (!hasData) return "No data yet";
                            return `${context.label}: ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            }
        }
    });
}

function updateUtilitiesChart() {
    const chartCanvas = document.getElementById("utilitiesChart");
    if (!chartCanvas || typeof Chart === "undefined") return;

    const now = new Date();
    const monthKeys = [];
    const monthLabels = [];

    // Build a rolling 6-month window (oldest -> newest).
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthKeys.push(key);
        monthLabels.push(d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }));
    }

    const eBillValues = new Array(6).fill(0);
    const waterValues = new Array(6).fill(0);

    state.bills.forEach((bill) => {
        if (!bill.createdAt?.seconds) return;

        const dt = new Date(bill.createdAt.seconds * 1000);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        const idx = monthKeys.indexOf(key);
        if (idx === -1) return;

        const amount = Number(bill.amount) || 0;
        if (bill.name === "E-Bill") eBillValues[idx] += amount;
        if (bill.name === "Water Bill") waterValues[idx] += amount;
    });

    if (utilitiesChart) {
        utilitiesChart.destroy();
        utilitiesChart = null;
    }

    const textColor = getComputedStyle(document.body).getPropertyValue("--text-secondary").trim() || "#64748b";

    utilitiesChart = new Chart(chartCanvas, {
        type: "bar",
        data: {
            labels: monthLabels,
            datasets: [
                {
                    label: "E-Bill",
                    data: eBillValues,
                    backgroundColor: "rgba(59, 130, 246, 0.75)",
                    borderColor: "#3b82f6",
                    borderWidth: 1,
                    borderRadius: 6
                },
                {
                    label: "Water Bill",
                    data: waterValues,
                    backgroundColor: "rgba(6, 182, 212, 0.75)",
                    borderColor: "#06b6d4",
                    borderWidth: 1,
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: { color: textColor },
                    grid: { color: "rgba(148, 163, 184, 0.15)" }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: textColor,
                        callback: (value) => `LKR ${Number(value).toLocaleString()}`
                    },
                    grid: { color: "rgba(148, 163, 184, 0.18)" }
                }
            },
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        color: textColor,
                        usePointStyle: true,
                        pointStyle: "rectRounded"
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${formatCurrency(context.raw)}`
                    }
                }
            }
        }
    });
}

function updateUI() {
    const isAdmin = state.isAdminUser;

    // Current calendar month epoch boundary
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    // Partition transactions
    const generalLedger = [];
    const rentContributions = {}; // memberId -> sum of rent contributions this month
    const historicalLedger = [];

    let totalMonthlyRentContributions = 0;
    let totalMonthlyGLIncome = 0;
    let totalMonthlyGLExpense = 0;

    state.transactions.forEach(t => {
        const time = t.createdAt ? t.createdAt.seconds * 1000 : Date.now();
        const isCurrent = time >= currentMonthStart.getTime();

        if (isCurrent) {
            if (t.isRentPayment) {
                if (!rentContributions[t.memberId]) {
                    rentContributions[t.memberId] = 0;
                }
                rentContributions[t.memberId] += t.amount;
                totalMonthlyRentContributions += t.amount;
            } else if (t.isGeneralLedger) {
                generalLedger.push(t);
                if (t.type === 'income') {
                    totalMonthlyGLIncome += t.amount;
                } else {
                    totalMonthlyGLExpense += t.amount;
                }
            }
        } else {
            historicalLedger.push(t);
        }
    });

    // Fetch paid utilities this month
    const currentMonthPaidBills = state.bills.filter(b => {
        const time = b.createdAt ? b.createdAt.seconds * 1000 : Date.now();
        const isCurrent = time >= currentMonthStart.getTime();
        return b.paid && isCurrent;
    });
    const totalMonthlyPaidBills = currentMonthPaidBills.reduce((sum, b) => sum + b.amount, 0);

    // Calculate Rental Net Balance & Inflow
    const rentalNetBalance = (totalMonthlyRentContributions + totalMonthlyGLIncome) - (totalMonthlyGLExpense + totalMonthlyPaidBills);
    const dashInflow = totalMonthlyRentContributions + totalMonthlyGLIncome;

    const totalMembers = state.members.length;
    const totalPendingBills = state.bills.filter(b => !b.paid).reduce((sum, b) => sum + b.amount, 0);

    // 2. Render Dash cards using new Rental calculations
    document.getElementById("net-balance-val").innerText = formatCurrency(rentalNetBalance);
    document.getElementById("dash-income").innerText = formatCurrency(dashInflow);
    document.getElementById("dash-members").innerText = totalMembers;
    document.getElementById("dash-pending").innerText = formatCurrency(totalPendingBills);
    document.getElementById("dash-paid-bills").innerText = formatCurrency(totalMonthlyPaidBills);

    // 3. Populate Member Checklist Selection Box (Admin Only)
    const elAllocationTargetsContainer = document.getElementById("allocation-targets-container");
    if (elAllocationTargetsContainer && isAdmin) {
        // Remember which IDs are currently checked
        const checkedIds = new Set(
            Array.from(elAllocationTargetsContainer.querySelectorAll("input[type='checkbox']:checked"))
                .map(cb => cb.value)
        );

        if (state.members.length === 0) {
            elAllocationTargetsContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; text-align: center; margin: auto;">No family members registered.</p>';
        } else {
            elAllocationTargetsContainer.innerHTML = state.members.map(member => `
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.9rem; margin-bottom: 0.2rem;" onclick="event.stopPropagation();">
                    <input type="checkbox" name="allocation-member" value="${member.id}" ${checkedIds.has(member.id) ? 'checked' : ''}>
                    <span style="font-weight: 550; color: var(--text-primary);">${member.name}</span>
                    <span class="mono" style="color: var(--text-secondary); font-size: 0.8rem; margin-left: auto;">(${formatCurrency(member.balance)})</span>
                </label>
            `).join('');
        }
    }

    // 4. Render Members Grid
    const elMembersGrid = document.getElementById("members-grid");
    if (state.members.length === 0) {
        elMembersGrid.innerHTML = `
            <div class="card flex-center py-8" style="grid-column: 1/-1;">
                <p style="color: var(--text-secondary); text-align: center;">No family members registered. Add one using the button above.</p>
            </div>`;
    } else {
        elMembersGrid.innerHTML = state.members.map((m, index) => {
            const cleanPhone = m.whatsapp ? m.whatsapp.replace(/[^0-9]/g, '') : '';
            return `
                <div class="card member-card animate-fade-in" onclick="viewMemberHistory(event, '${m.id}')" style="cursor: pointer;">
                    <div class="member-header">
                        <div>
                            <h4 class="member-name">${m.name}</h4>
                            <p class="member-desc" style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                                <span>Family Member</span>
                                ${m.whatsapp ? `
                                    <a href="https://wa.me/${cleanPhone}" target="_blank" onclick="event.stopPropagation();" style="color: var(--whatsapp-color); font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 0.2rem;" title="Chat on WhatsApp">
                                        <i class="fab fa-whatsapp" style="font-size: 0.95rem;"></i> Chat
                                    </a>
                                ` : ""}
                            </p>
                        </div>
                        ${isAdmin ? `
                            <button onclick="event.stopPropagation(); deleteMemberAction('${m.id}')" class="btn btn-danger btn-icon" title="Remove Member">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ""}
                    </div>
                    <div class="member-balance mono">${formatCurrency(m.balance)}</div>
                    ${isAdmin ? `
                        <div class="member-actions">
                            <button onclick="event.stopPropagation(); adjustMemberBalance('${m.id}', ${m.balance}, 'add')" class="btn btn-success font-bold">+ Add</button>
                            <button onclick="event.stopPropagation(); adjustMemberBalance('${m.id}', ${m.balance}, 'sub')" class="btn btn-danger font-bold">- Sub</button>
                        </div>
                    ` : ""}
                </div>
            `;
        }).join('');
    }

    // 5. Render Per-Category Utility Cards
    const elUtilitiesGrid = document.getElementById("utilities-grid");
    if (elUtilitiesGrid) {
        // Calculate outstanding pending balances for each category
        const pendingEBillTotal = state.bills.filter(b => b.name === 'E-Bill' && !b.paid).reduce((sum, b) => sum + b.amount, 0);
        const pendingWaterBillTotal = state.bills.filter(b => b.name === 'Water Bill' && !b.paid).reduce((sum, b) => sum + b.amount, 0);

        elUtilitiesGrid.innerHTML = `
            <div class="card member-card animate-fade-in" onclick="viewBillHistory('E-Bill')" style="cursor: pointer; border-left-color: #3b82f6;">
                <div class="member-header">
                    <div>
                        <h4 class="member-name">E-Bill</h4>
                        <p class="member-desc">Electricity Utility</p>
                    </div>
                </div>
                <div class="member-balance mono" style="color: #3b82f6;">${formatCurrency(pendingEBillTotal)}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 600;">Click card to view records history</div>
            </div>
            <div class="card member-card animate-fade-in" onclick="viewBillHistory('Water Bill')" style="cursor: pointer; border-left-color: #06b6d4;">
                <div class="member-header">
                    <div>
                        <h4 class="member-name">Water Bill</h4>
                        <p class="member-desc">Water Utility</p>
                    </div>
                </div>
                <div class="member-balance mono" style="color: #06b6d4;">${formatCurrency(pendingWaterBillTotal)}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 600;">Click card to view records history</div>
            </div>
        `;
    }

    // Render Block 1: Monthly Rental Contributions
    const elRentMembersList = document.getElementById("rent-members-list");
    if (elRentMembersList) {
        if (state.members.length === 0) {
            elRentMembersList.innerHTML = '<p style="color: var(--text-secondary); text-align: center;" class="py-4">No family members registered.</p>';
        } else {
            elRentMembersList.innerHTML = state.members.map(m => {
                const paidAmount = rentContributions[m.id] || 0;
                const isPaid = paidAmount > 0;
                return `
                    <div class="activity-item" style="padding: 0.6rem 0; border-bottom: 1px dashed var(--border-color);">
                        <div class="activity-info">
                            <div class="activity-indicator ${isPaid ? 'income' : 'expense'}"></div>
                            <div>
                                <div class="activity-title" style="font-weight: 600;">${m.name}</div>
                                <div class="activity-date" style="font-size: 0.75rem; margin-top: 0.15rem;">
                                    ${isPaid ? `<span class="badge badge-success" style="font-size:0.65rem; padding: 0.1rem 0.35rem;">Paid</span>` : `<span class="badge badge-warning" style="font-size:0.65rem; padding: 0.1rem 0.35rem;">Unpaid</span>`}
                                </div>
                            </div>
                        </div>
                        <div class="activity-amount mono" style="font-weight: 700; color: ${isPaid ? 'var(--success-color)' : 'var(--text-secondary)'};">
                            ${formatCurrency(paidAmount)}
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // Render Block 2: General House Ledger
    const elGeneralLedger = document.getElementById("general-ledger-body");
    if (elGeneralLedger) {
        if (generalLedger.length === 0) {
            elGeneralLedger.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: var(--text-secondary);" class="py-8">
                        No general entries this month.
                    </td>
                </tr>`;
        } else {
            elGeneralLedger.innerHTML = generalLedger.map(t => `
                <tr class="animate-fade-in">
                    <td style="font-weight: 550;">${t.desc}</td>
                    <td>
                        <span class="badge ${t.type === 'income' ? 'badge-success' : 'badge-danger'}">
                            ${t.type}
                        </span>
                    </td>
                    <td class="mono" style="font-weight: 600; color: ${t.type === 'income' ? 'var(--success-color)' : 'var(--danger-color)'}">
                        ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}
                    </td>
                    <td>
                        ${isAdmin ? `
                            <button onclick="deleteTransactionAction('${t.id}')" class="btn btn-danger btn-icon" style="height: 28px; width: 28px;">
                                <i class="fas fa-trash-can"></i>
                            </button>
                        ` : `<span style="color: var(--text-muted); font-size: 0.8rem;">No Actions</span>`}
                    </td>
                </tr>
            `).join('');
        }
    }

    // Render Block 3: Paid Utility Bills
    const elPaidUtilities = document.getElementById("paid-utilities-body");
    if (elPaidUtilities) {
        if (currentMonthPaidBills.length === 0) {
            elPaidUtilities.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align: center; color: var(--text-secondary);" class="py-8">
                        No utility bills paid this month.
                    </td>
                </tr>`;
        } else {
            elPaidUtilities.innerHTML = currentMonthPaidBills.map(b => `
                <tr class="animate-fade-in">
                    <td style="font-weight: 600; color: var(--text-primary);">${b.name}</td>
                    <td>
                        <span class="badge badge-success" style="font-size:0.65rem; padding: 0.1rem 0.35rem;">Paid</span>
                    </td>
                    <td class="mono" style="font-weight: 600; color: var(--danger-color);">
                        -${formatCurrency(b.amount)}
                    </td>
                </tr>
            `).join('');
        }
    }

    // Render Block 4: History Archives (Previous Months) - Bottom Layout
    const elArchiveLedger = document.getElementById("archive-ledger-body");
    if (elArchiveLedger) {
        if (historicalLedger.length === 0) {
            elArchiveLedger.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: var(--text-secondary);" class="py-8">
                        No archives from previous months.
                    </td>
                </tr>`;
        } else {
            elArchiveLedger.innerHTML = historicalLedger.map(t => {
                const dateObj = t.createdAt ? new Date(t.createdAt.seconds * 1000) : new Date();
                const monthStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

                let typeLabel = "General";
                let typeBadge = t.type === 'income' ? 'badge-success' : 'badge-danger';

                if (t.isRentPayment) {
                    typeLabel = "Rent Payment";
                    typeBadge = "badge-success";
                } else if (t.memberId) {
                    typeLabel = "Member Balance";
                    typeBadge = "badge-warning";
                } else if (t.isGeneralLedger) {
                    typeLabel = "General Ledger";
                }

                return `
                    <tr class="animate-fade-in">
                        <td style="color: var(--text-secondary); font-weight: 600;">${monthStr}</td>
                        <td>${t.desc}</td>
                        <td>
                            <span class="badge ${typeBadge}" style="font-size: 0.65rem; text-transform: uppercase;">
                                ${typeLabel}
                            </span>
                        </td>
                        <td class="mono" style="font-weight: 600; color: ${t.type === 'income' ? 'var(--success-color)' : 'var(--danger-color)'}">
                            ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    // 7. Update Rent Displays
    const elRentTotalConfig = document.getElementById("rent-total-config");
    const elRentDayConfig = document.getElementById("rent-day-config");
    if (elRentTotalConfig) elRentTotalConfig.innerText = formatCurrency(state.settings.rentalAmount || 0);
    if (elRentDayConfig) elRentDayConfig.innerText = state.settings.rentalDay || 1;

    const elRentalAmountInput = document.getElementById("rental-amount");
    const elRentalDayInput = document.getElementById("rental-day");
    if (elRentalAmountInput) elRentalAmountInput.value = state.settings.rentalAmount || 0;
    if (elRentalDayInput) elRentalDayInput.value = state.settings.rentalDay || 1;

    // 8. Render Today's Activity Feed (Dashboard Tab)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayActivities = [];

    // Transactions from today
    state.transactions.forEach(t => {
        const time = t.createdAt ? t.createdAt.seconds * 1000 : Date.now();
        if (time >= startOfToday.getTime()) {
            todayActivities.push({
                id: t.id,
                desc: t.desc,
                amount: t.amount,
                type: t.type,
                date: new Date(time),
                memberId: t.memberId || null,
                isRentPayment: t.isRentPayment || false,
                isGeneralLedger: t.isGeneralLedger || false,
                isBill: false
            });
        }
    });

    // Paid utility bills from today
    state.bills.forEach(b => {
        const time = b.createdAt ? b.createdAt.seconds * 1000 : Date.now();
        if (b.paid && time >= startOfToday.getTime()) {
            todayActivities.push({
                id: b.id,
                desc: `Paid Bill: ${b.name}`,
                amount: b.amount,
                type: 'expense',
                date: new Date(time),
                name: b.name, // "E-Bill" or "Water Bill"
                memberId: null,
                isRentPayment: false,
                isGeneralLedger: false,
                isBill: true
            });
        }
    });

    // Sort today's activities chronologically descending (newest first) for Dashboard rendering
    todayActivities.sort((a, b) => b.date - a.date);

    const elRecentActivity = document.getElementById("recent-activity");
    if (elRecentActivity) {
        if (todayActivities.length === 0) {
            elRecentActivity.innerHTML = `
                <div class="flex-center py-8" style="flex-direction: column; text-align: center;">
                    <p style="color: var(--text-muted); font-size: 0.9rem;">No transactions logged today.</p>
                </div>`;
        } else {
            elRecentActivity.innerHTML = todayActivities.map(act => `
                <div class="activity-item animate-fade-in">
                    <div class="activity-info">
                        <div class="activity-indicator ${act.type}"></div>
                        <div>
                            <div class="activity-title" style="font-weight:600;">${act.desc}</div>
                            <div class="activity-date">${act.date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                    </div>
                    <div class="activity-amount mono ${act.type}" style="font-weight:700;">
                        ${act.type === 'income' ? '+' : '-'}${formatCurrency(act.amount)}
                    </div>
                </div>
            `).join('');
        }
    }

    // Generate Grouped WhatsApp Daily Report Link
    const elBtnWhatsappDaily = document.getElementById("btn-whatsapp-daily");
    if (elBtnWhatsappDaily) {
        if (todayActivities.length === 0) {
            elBtnWhatsappDaily.style.display = "none";
        } else {
            elBtnWhatsappDaily.style.display = "flex";

            const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            let msg = `*Daily Finance Report - ${dateStr}*\n\n`;

            // Group today's activities (sorted chronologically oldest first)
            const oldestFirstToday = [...todayActivities].reverse();

            const memberSections = {};
            const eBillSection = [];
            const waterBillSection = [];
            const rentalSection = []; // general ledger and rent payments

            oldestFirstToday.forEach(act => {
                // Route Rent Payments to the Rental Section instead of Member sections
                if (act.memberId && !act.isRentPayment) {
                    if (!memberSections[act.memberId]) {
                        const m = state.members.find(member => member.id === act.memberId);
                        if (m) {
                            memberSections[act.memberId] = { member: m, list: [] };
                        }
                    }
                    if (memberSections[act.memberId]) {
                        memberSections[act.memberId].list.push(act);
                    }
                } else if (act.isBill) {
                    if (act.name === "E-Bill") {
                        eBillSection.push(act);
                    } else if (act.name === "Water Bill") {
                        waterBillSection.push(act);
                    }
                } else {
                    // Filter out transactions containing "For Foods" from the Rental section in WhatsApp reports
                    if (act.desc && act.desc.toLowerCase().includes("for foods")) {
                        return;
                    }
                    rentalSection.push(act);
                }
            });

            // Helpers for deltas
            const netMap = getNetBalances(rentalNetBalance);

            // Helpers to format balance and transaction amounts matching exact mockup signs
            const formatWhatsAppBalance = (val) => {
                const sign = val < 0 ? '-' : '';
                const absVal = Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                return `LKR ${sign}${absVal}`;
            };

            const formatWhatsAppTx = (val, type) => {
                const sign = type === 'income' ? '+' : '-';
                const absVal = Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                return `${sign}LKR ${absVal}`;
            };

            // 1. Members Sections
            Object.values(memberSections).forEach(sec => {
                const m = sec.member;
                if (sec.list.length === 0) return; // Skip if no non-rental transactions today

                const phoneFormatted = m.whatsapp ? `${m.whatsapp.replace(/[^0-9]/g, '')}` : "No Number";

                const balancesMap = getMemberBalances(m);

                // Find overall starting (previous) and ending (net) day balances
                const firstAct = sec.list[0];
                const lastAct = sec.list[sec.list.length - 1];

                const dayBeforeBal = balancesMap[firstAct.id] ? balancesMap[firstAct.id].before : m.balance;
                const dayAfterBal = balancesMap[lastAct.id] ? balancesMap[lastAct.id].after : m.balance;

                msg += `*Member: ${m.name} (${phoneFormatted})*\n`;
                msg += `Previous Balance: ${formatWhatsAppBalance(dayBeforeBal)}\n`;

                sec.list.forEach(act => {
                    msg += `* ${act.desc}: ${formatWhatsAppTx(act.amount, act.type)}\n`;
                });

                msg += `Net Balance: ${formatWhatsAppBalance(dayAfterBal)}\n\n`;
            });

            // 2. E-Bill Section
            if (eBillSection.length > 0) {
                msg += `*Account: E-Bill*\n`;
                eBillSection.forEach(act => {
                    const bal = netMap[act.id] || { before: 0, after: 0 };
                    msg += `* Paid E-Bill Utility Cost: -LKR ${parseFloat(act.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
                    msg += `  (Household Net: ${formatWhatsAppBalance(bal.before)} ➜ ${formatWhatsAppBalance(bal.after)})\n`;
                });
                msg += `\n`;
            }

            // 3. Water Bill Section
            if (waterBillSection.length > 0) {
                msg += `*Account: Water Bill*\n`;
                waterBillSection.forEach(act => {
                    const bal = netMap[act.id] || { before: 0, after: 0 };
                    msg += `* Paid Water Bill Utility Cost: -LKR ${parseFloat(act.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
                    msg += `  (Household Net: ${formatWhatsAppBalance(bal.before)} ➜ ${formatWhatsAppBalance(bal.after)})\n`;
                });
                msg += `\n`;
            }

            // 4. Rental Section (Includes General ledger entries + Rent payments)
            if (rentalSection.length > 0) {
                msg += `*Account: Rental*\n`;

                const firstAct = rentalSection[0];
                const lastAct = rentalSection[rentalSection.length - 1];

                const rentalBeforeNet = netMap[firstAct.id] ? netMap[firstAct.id].before : rentalNetBalance;
                const rentalAfterNet = netMap[lastAct.id] ? netMap[lastAct.id].after : rentalNetBalance;

                msg += `Previous Balance: ${formatWhatsAppBalance(rentalBeforeNet)}\n`;

                rentalSection.forEach(act => {
                    msg += `* ${act.desc}: ${formatWhatsAppTx(act.amount, act.type)}\n`;
                });

                msg += `Net Balance: ${formatWhatsAppBalance(rentalAfterNet)}\n\n`;
            }

            msg += `_Generated by HomeFinance Assistant_`;
            elBtnWhatsappDaily.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
        }
    }

    // 9. Refresh Doughnut Chart - Synced to Rental parameters
    updateChart(totalMonthlyPaidBills, state.settings.rentalAmount || 0, totalMonthlyGLExpense);

    // 10. Refresh Utilities Grouped Bar Chart
    updateUtilitiesChart();

    // 11. Refresh Member History Modal Table if active
    const elHistoryModal = document.getElementById("member-history-modal");
    if (elHistoryModal && elHistoryModal.classList.contains("active") && state.currentSelectedMemberId) {
        renderMemberHistoryTable(state.currentSelectedMemberId);
    }

    // 12. Refresh Bill Category History Modal Table if active
    const elBillHistoryModal = document.getElementById("bill-history-modal");
    if (elBillHistoryModal && elBillHistoryModal.classList.contains("active") && state.currentSelectedBillCategory) {
        renderBillHistoryTable(state.currentSelectedBillCategory);
    }

    // 13. Refresh Rental History Modal Table if active
    const elRentalHistoryModal = document.getElementById("rental-history-modal");
    if (elRentalHistoryModal && elRentalHistoryModal.classList.contains("active")) {
        renderRentalHistoryTable();
    }

    // 14. Refresh Dashboard Members Modal Table if active
    const elDashMembersModal = document.getElementById("dashboard-members-modal");
    if (elDashMembersModal && elDashMembersModal.classList.contains("active")) {
        renderDashboardMembersTable();
    }
}

// Helpers to back-calculate balance states before/after transaction per member
function getMemberBalances(member) {
    const memberTrans = state.transactions
        .filter(t => t.memberId === member.id)
        .sort((a, b) => {
            const timeA = a.createdAt ? a.createdAt.seconds : 0;
            const timeB = b.createdAt ? b.createdAt.seconds : 0;
            return timeB - timeA; // newest first
        });

    const balancesMap = {};
    let running = member.balance;
    memberTrans.forEach(tr => {
        balancesMap[tr.id] = {
            after: running,
            before: tr.type === 'income' ? (running - tr.amount) : (running + tr.amount)
        };
        running = balancesMap[tr.id].before;
    });
    return balancesMap;
}

// Helpers to back-calculate Household Net Balance states before/after transaction
function getNetBalances(rentalNetBalance) {
    const rentalHistoryList = [];
    state.transactions.forEach(t => {
        if (t.isRentPayment || t.isGeneralLedger) {
            rentalHistoryList.push({
                id: t.id,
                amount: t.amount,
                type: t.type,
                date: t.createdAt ? t.createdAt.seconds : 0
            });
        }
    });
    state.bills.forEach(b => {
        if (b.paid) {
            rentalHistoryList.push({
                id: b.id,
                amount: b.amount,
                type: 'expense',
                date: b.createdAt ? b.createdAt.seconds : 0
            });
        }
    });

    rentalHistoryList.sort((a, b) => b.date - a.date); // newest first

    const netMap = {};
    let runningNet = rentalNetBalance;
    rentalHistoryList.forEach(item => {
        netMap[item.id] = {
            after: runningNet,
            before: item.type === 'income' ? (runningNet - item.amount) : (runningNet + item.amount)
        };
        runningNet = netMap[item.id].before;
    });
    return netMap;
}

// --- Member Transaction History Renderers ---

window.viewMemberHistory = function (event, memberId) {
    if (event.target.tagName === 'INPUT' || event.target.closest('button') || event.target.closest('a')) {
        return;
    }
    state.currentSelectedMemberId = memberId;
    openModal("member-history-modal");
    renderMemberHistoryTable(memberId);
};

window.renderMemberHistoryTable = function (memberId) {
    const member = state.members.find(m => m.id === memberId);
    if (!member) return;

    document.getElementById("history-modal-title").innerText = `${member.name} - Transaction History`;

    // Filter ledger entries linked to this member, strictly excluding Rent payments
    const memberTransactions = state.transactions.filter(t => t.memberId === memberId && !t.isRentPayment);
    const elHistoryBody = document.getElementById("history-table-body");

    if (memberTransactions.length === 0) {
        elHistoryBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--text-secondary);" class="py-8">
                    No transactions recorded for this member.
                </td>
            </tr>`;
        return;
    }

    const isAdmin = state.isAdminUser;

    elHistoryBody.innerHTML = memberTransactions.map(t => `
        <tr class="animate-fade-in">
            <td style="font-weight: 550; color: var(--text-primary);">${t.desc}</td>
            <td>
                <span class="badge ${t.type === 'income' ? 'badge-success' : 'badge-danger'}">
                    ${t.type}
                </span>
            </td>
            <td class="mono" style="font-weight: 600; color: ${t.type === 'income' ? 'var(--success-color)' : 'var(--danger-color)'}">
                ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}
            </td>
            <td>
                ${isAdmin ? `
                    <div style="display: flex; gap: 0.5rem;">
                        <button onclick="openEditTransaction('${t.id}')" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.35rem 0.7rem;">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button onclick="deleteTransactionFromHistory('${t.id}')" class="btn btn-danger btn-icon" style="height: 28px; width: 28px;" title="Delete Ledger Entry">
                            <i class="fas fa-trash-can"></i>
                        </button>
                    </div>
                ` : `<span style="color: var(--text-muted); font-size: 0.8rem;">No Actions</span>`}
            </td>
        </tr>
    `).join('');
};

window.openEditTransaction = function (transactionId) {
    const trans = state.transactions.find(t => t.id === transactionId);
    if (!trans) return;

    document.getElementById("edit-trans-id").value = trans.id;
    document.getElementById("edit-trans-member-id").value = trans.memberId || "";
    document.getElementById("edit-trans-desc").value = trans.desc;
    document.getElementById("edit-trans-type").value = trans.type;
    document.getElementById("edit-trans-amount").value = trans.amount;

    openModal("edit-transaction-modal");
};

// Edit form submit listener
if (elEditTransactionForm) {
    elEditTransactionForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!state.isAdminUser) return;

        const id = document.getElementById("edit-trans-id").value;
        const memberId = document.getElementById("edit-trans-member-id").value;
        const desc = document.getElementById("edit-trans-desc").value;
        const type = document.getElementById("edit-trans-type").value;
        const amount = parseFloat(document.getElementById("edit-trans-amount").value) || 0;

        if (amount <= 0) {
            alert("Please enter a valid amount greater than 0.");
            return;
        }

        const trans = state.transactions.find(t => t.id === id);
        if (!trans) {
            alert("Ledger entry not found.");
            return;
        }

        const oldType = trans.type;
        const oldAmount = trans.amount;

        try {
            // 1. Update document in Firestore
            await updateTransaction(id, desc, type, amount);

            // 2. Adjust linked member balance (if applicable)
            if (memberId) {
                const member = state.members.find(m => m.id === memberId);
                if (member) {
                    let currentBalance = member.balance;

                    // Reverse old transaction amount
                    if (oldType === "income") {
                        currentBalance -= oldAmount;
                    } else {
                        currentBalance += oldAmount;
                    }

                    // Apply new transaction amount
                    if (type === "income") {
                        currentBalance += amount;
                    } else {
                        currentBalance -= amount;
                    }

                    await updateMemberBalance(memberId, currentBalance);
                }
            }

            closeModal("edit-transaction-modal");
            alert("Transaction successfully updated.");
        } catch (error) {
            console.error("Update Transaction Error:", error);
            alert("Update failed: " + error.message);
        }
    });
}

// Delete transaction and sync balance
window.deleteTransactionFromHistory = async function (transactionId) {
    if (!state.isAdminUser) return;
    if (!confirm("Are you sure you want to delete this transaction? This will automatically reverse the transaction amount to restore the member's balance.")) return;

    const trans = state.transactions.find(t => t.id === transactionId);
    if (!trans) return;

    const memberId = trans.memberId;
    const type = trans.type;
    const amount = trans.amount;

    try {
        // 1. Delete document from Firestore
        await deleteTransaction(transactionId);

        // 2. Reverse balance changes on member card
        if (memberId) {
            const member = state.members.find(m => m.id === memberId);
            if (member) {
                let currentBalance = member.balance;

                if (type === "income") {
                    currentBalance -= amount;
                } else {
                    currentBalance += amount;
                }

                await updateMemberBalance(memberId, currentBalance);
            }
        }
        alert("Transaction deleted successfully and member balance restored.");
    } catch (error) {
        console.error("Delete Transaction Error:", error);
        alert("Delete failed: " + error.message);
    }
};

// --- Per-Category Utility History Renderers ---

window.viewBillHistory = function (category) {
    state.currentSelectedBillCategory = category;
    openModal("bill-history-modal");
    renderBillHistoryTable(category);
};

window.renderBillHistoryTable = function (category) {
    const filteredBills = state.bills.filter(b => b.name === category);
    const elHistoryBody = document.getElementById("bill-history-table-body");
    document.getElementById("bill-history-modal-title").innerText = `${category} Records History`;

    if (filteredBills.length === 0) {
        elHistoryBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--text-secondary);" class="py-8">
                    No records found for this category.
                </td>
            </tr>`;
        return;
    }

    const isAdmin = state.isAdminUser;

    elHistoryBody.innerHTML = filteredBills.map(b => {
        const dateObj = b.createdAt ? new Date(b.createdAt.seconds * 1000) : new Date();
        const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        return `
            <tr class="animate-fade-in">
                <td style="color: var(--text-secondary);">${dateStr}</td>
                <td class="mono" style="font-weight: 600; color: var(--text-primary);">${formatCurrency(b.amount)}</td>
                <td>
                    <span class="badge ${b.paid ? 'badge-success' : 'badge-warning'}">
                        ${b.paid ? 'Paid' : 'Pending'}
                    </span>
                </td>
                <td>
                    ${isAdmin ? `
                        <div style="display: flex; gap: 0.5rem;">
                            <button onclick="toggleBillStatus('${b.id}', ${b.paid})" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.35rem 0.7rem;">
                                ${b.paid ? 'Mark Pending' : 'Mark Paid'}
                            </button>
                            <button onclick="openEditBill('${b.id}')" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.35rem 0.7rem;">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button onclick="deleteBillAction('${b.id}')" class="btn btn-danger btn-icon" style="height: 28px; width: 28px;" title="Delete Bill Record">
                                <i class="fas fa-trash-can"></i>
                            </button>
                        </div>
                    ` : `<span style="color: var(--text-muted); font-size: 0.8rem;">No Actions</span>`}
                </td>
            </tr>
        `;
    }).join('');
};

window.openEditBill = function (billId) {
    const bill = state.bills.find(b => b.id === billId);
    if (!bill) return;

    document.getElementById("edit-bill-id").value = bill.id;
    document.getElementById("edit-bill-name").value = bill.name;
    document.getElementById("edit-bill-amount").value = bill.amount;
    document.getElementById("edit-bill-status").value = bill.paid ? "paid" : "pending";

    openModal("edit-bill-modal");
};

// Edit bill form submit
if (elEditBillForm) {
    elEditBillForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!state.isAdminUser) return;

        const id = document.getElementById("edit-bill-id").value;
        const name = document.getElementById("edit-bill-name").value;
        const amount = parseFloat(document.getElementById("edit-bill-amount").value) || 0;
        const status = document.getElementById("edit-bill-status").value;

        if (amount <= 0) {
            alert("Please enter a valid amount greater than 0.");
            return;
        }

        try {
            await updateBill(id, name, amount, status);
            closeModal("edit-bill-modal");
            alert("Utility bill record successfully updated.");
        } catch (error) {
            console.error("Update Bill Error:", error);
            alert("Update failed: " + error.message);
        }
    });
}

// --- Admin Modification Form Handlers ---

// Add Family Member
elMemberForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.isAdminUser) return;

    const name = document.getElementById("member-name").value;
    const whatsapp = document.getElementById("member-whatsapp").value;
    const balance = document.getElementById("member-balance").value;

    try {
        await addMember(name, balance, whatsapp);
        closeModal("member-modal");
        elMemberForm.reset();
    } catch (error) {
        console.error("Add Member Error:", error);
        alert("Failed to add member: " + error.message);
    }
});

// Allocate funds across selected members
elAllocationForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.isAdminUser) return;

    const desc = document.getElementById("allocation-desc").value.trim();
    const type = document.getElementById("allocation-type").value;
    const amount = parseFloat(document.getElementById("allocation-amount").value) || 0;
    const selectedMemberIds = Array.from(document.querySelectorAll("input[name='allocation-member']:checked"))
        .map(cb => cb.value);

    if (!desc) {
        alert("Please enter an allocation description.");
        return;
    }

    if (amount <= 0) {
        alert("Please enter a valid allocation amount greater than 0.");
        return;
    }

    if (selectedMemberIds.length === 0) {
        alert("Please select at least one member to allocate funds to.");
        return;
    }

    const perMemberAmount = amount / selectedMemberIds.length;

    try {
        for (const memberId of selectedMemberIds) {
            const member = state.members.find(m => m.id === memberId);
            if (!member) continue;

            const currentBalance = Number(member.balance) || 0;
            const nextBalance = type === "income"
                ? currentBalance + perMemberAmount
                : currentBalance - perMemberAmount;

            await updateMemberBalance(memberId, nextBalance);
            await addTransaction(
                desc,
                type,
                perMemberAmount,
                memberId,
                false,
                false
            );
        }

        elAllocationForm.reset();
        updateUI();
        alert(`Allocation applied to ${selectedMemberIds.length} member(s).`);
    } catch (error) {
        console.error("Allocation Error:", error);
        alert("Failed to apply allocation: " + error.message);
    }
});

const elAllocationSelectAll = document.getElementById("allocation-select-all");
if (elAllocationSelectAll) {
    elAllocationSelectAll.addEventListener("click", () => {
        document.querySelectorAll("input[name='allocation-member']").forEach(cb => {
            cb.checked = true;
        });
    });
}

const elAllocationDeselectAll = document.getElementById("allocation-deselect-all");
if (elAllocationDeselectAll) {
    elAllocationDeselectAll.addEventListener("click", () => {
        document.querySelectorAll("input[name='allocation-member']").forEach(cb => {
            cb.checked = false;
        });
    });
}

// Adjust Member Balance Action
window.adjustMemberBalance = function (id, currentBalance, type) {
    if (!state.isAdminUser) return;

    const member = state.members.find(m => m.id === id);
    if (!member) {
        alert("Member not found.");
        return;
    }

    state.pendingMemberAdjustment = {
        memberId: id,
        type,
        currentBalance: Number(currentBalance) || Number(member.balance) || 0
    };

    const modal = document.getElementById("member-adjustment-modal");
    const title = document.getElementById("member-adjustment-modal-title");
    const summary = document.getElementById("member-adjustment-summary");
    const descInput = document.getElementById("member-adjustment-desc");
    const amountInput = document.getElementById("member-adjustment-amount");

    if (title) {
        title.innerText = type === "add" ? "Add Amount to Member Account" : "Subtract Amount from Member Account";
    }

    if (summary) {
        summary.innerText = `${member.name} | Current Balance: ${formatCurrency(state.pendingMemberAdjustment.currentBalance)}`;
    }

    if (descInput) descInput.value = type === "add" ? "Manual deposit" : "Manual withdrawal";
    if (amountInput) amountInput.value = "";

    openModal("member-adjustment-modal");
};

if (elMemberAdjustmentForm) {
    elMemberAdjustmentForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!state.isAdminUser) return;

        const pending = state.pendingMemberAdjustment;
        if (!pending) {
            alert("No member adjustment is currently open.");
            return;
        }

        const member = state.members.find(m => m.id === pending.memberId);
        if (!member) {
            alert("Member not found.");
            return;
        }

        const desc = document.getElementById("member-adjustment-desc").value.trim();
        const amount = parseFloat(document.getElementById("member-adjustment-amount").value) || 0;

        if (!desc) {
            alert("Please enter a description.");
            return;
        }

        if (amount <= 0) {
            alert("Please enter a valid positive amount.");
            return;
        }

        const currentBalance = Number(member.balance) || 0;
        const newBalance = pending.type === "add" ? (currentBalance + amount) : (currentBalance - amount);

        try {
            await updateMemberBalance(member.id, newBalance);
            await addTransaction(
                `${desc} (${member.name})`,
                pending.type === "add" ? "income" : "expense",
                amount,
                member.id
            );

            closeModal("member-adjustment-modal");
            updateUI();
            alert("Member balance updated successfully.");
        } catch (error) {
            console.error("Adjust Balance Error:", error);
            alert("Failed to adjust balance: " + error.message);
        }
    });
}

// Delete Member
window.deleteMemberAction = async function (id) {
    if (!state.isAdminUser) return;
    if (confirm("Are you sure you want to delete this family member account?")) {
        try {
            await deleteMember(id);
        } catch (error) {
            console.error("Delete Member Error:", error);
            alert("Failed to delete member: " + error.message);
        }
    }
};

// Add Utility Bill (Captures status, no due date)
elBillForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.isAdminUser) return;

    const name = document.getElementById("bill-name").value;
    const amount = document.getElementById("bill-amount").value;
    const status = document.getElementById("bill-status").value;

    try {
        await addBill(name, amount, status);
        closeModal("bill-modal");
        elBillForm.reset();
    } catch (error) {
        console.error("Add Bill Error:", error);
        alert("Failed to add bill: " + error.message);
    }
});

// Toggle Bill Status
window.toggleBillStatus = async function (id, currentPaidStatus) {
    if (!state.isAdminUser) return;
    try {
        await toggleBillPaidStatus(id, currentPaidStatus);
    } catch (error) {
        console.error("Toggle Bill Status Error:", error);
        alert("Failed to change bill status: " + error.message);
    }
};

// Delete Bill
window.deleteBillAction = async function (id) {
    if (!state.isAdminUser) return;
    if (confirm("Are you sure you want to delete this utility bill?")) {
        try {
            await deleteBill(id);
        } catch (error) {
            console.error("Delete Bill Error:", error);
            alert("Failed to delete bill: " + error.message);
        }
    }
};

// Add Transaction (General Ledger form)
elTransactionForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.isAdminUser) return;

    const desc = document.getElementById("trans-desc").value;
    const type = document.getElementById("trans-type").value;
    const amount = document.getElementById("trans-amount").value;

    try {
        // Sets isRentPayment=false, isGeneralLedger=true
        await addTransaction(desc, type, amount, "", false, true);
        closeModal("transaction-modal");
        elTransactionForm.reset();
    } catch (error) {
        console.error("Add Transaction Error:", error);
        alert("Failed to add transaction: " + error.message);
    }
});

// Delete Transaction
window.deleteTransactionAction = async function (id) {
    if (!state.isAdminUser) return;
    if (confirm("Are you sure you want to delete this ledger entry?")) {
        try {
            await deleteTransaction(id);
        } catch (error) {
            console.error("Delete Transaction Error:", error);
            alert("Failed to delete transaction: " + error.message);
        }
    }
};

// Save Rental Settings (Config modal)
elRentalForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.isAdminUser) return;

    const amount = document.getElementById("rental-amount").value;
    const day = document.getElementById("rental-day").value;

    try {
        await saveSettings(amount, day);
        closeModal("rental-config-modal");
        alert("Settings saved successfully!");
    } catch (error) {
        console.error("Save Settings Error:", error);
        alert("Failed to save settings: " + error.message);
    }
});

// Record Rent Payment from specific Member
if (elRentPaymentForm) {
    elRentPaymentForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!state.isAdminUser) return;

        const memberId = document.getElementById("rent-member-select").value;
        const amount = parseFloat(document.getElementById("rent-amount-input").value) || 0;

        if (amount <= 0) {
            alert("Please enter a valid amount.");
            return;
        }

        const member = state.members.find(m => m.id === memberId);
        if (!member) return;

        try {
            await addTransaction(
                `Rent Contribution (${member.name})`,
                'income',
                amount,
                memberId,
                true, // isRentPayment flag
                false // isGeneralLedger flag
            );
            closeModal("rent-payment-modal");
            elRentPaymentForm.reset();
            alert("Rent payment recorded successfully.");
        } catch (error) {
            console.error("Rent Payment Submit Error:", error);
            alert("Record failed: " + error.message);
        }
    });
}

// --- Interactive Dashboard Modals Logic ---

window.openRentalHistoryModal = function () {
    openModal("rental-history-modal");
    renderRentalHistoryTable();
};

window.renderRentalHistoryTable = function () {
    const unifiedList = [];

    // 1. Rent Contributions & General Ledger entries
    state.transactions.forEach(t => {
        if (t.isRentPayment || t.isGeneralLedger) {
            unifiedList.push({
                id: t.id,
                date: t.createdAt ? new Date(t.createdAt.seconds * 1000) : new Date(),
                desc: t.desc,
                category: t.isRentPayment ? "Rent Payment" : "General Ledger",
                amount: t.amount,
                type: t.type, // "income" or "expense"
                isBill: false
            });
        }
    });

    // 2. Paid Utility Bills
    state.bills.forEach(b => {
        if (b.paid) {
            unifiedList.push({
                id: b.id,
                date: b.createdAt ? new Date(b.createdAt.seconds * 1000) : new Date(),
                desc: `${b.name} (Paid Utility)`,
                category: "Paid Utility",
                amount: b.amount,
                type: "expense", // utility is outflow
                isBill: true
            });
        }
    });

    // Sort chronologically desc
    unifiedList.sort((a, b) => b.date - a.date);

    const elHistoryBody = document.getElementById("rental-history-table-body");
    if (!elHistoryBody) return;

    if (unifiedList.length === 0) {
        elHistoryBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-secondary);" class="py-8">
                    No rental transactions recorded.
                </td>
            </tr>`;
        return;
    }

    const isAdmin = state.isAdminUser;

    elHistoryBody.innerHTML = unifiedList.map(item => {
        const dateStr = item.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

        let catBadge = "badge-success";
        if (item.category === "General Ledger") {
            catBadge = item.type === "income" ? "badge-success" : "badge-danger";
        } else if (item.category === "Paid Utility") {
            catBadge = "badge-danger";
        }

        return `
            <tr class="animate-fade-in">
                <td style="color: var(--text-secondary);">${dateStr}</td>
                <td style="font-weight: 550; color: var(--text-primary);">${item.desc}</td>
                <td>
                    <span class="badge ${catBadge}" style="font-size: 0.65rem; text-transform: uppercase;">
                        ${item.category}
                    </span>
                </td>
                <td class="mono" style="font-weight: 600; color: ${item.type === 'income' ? 'var(--success-color)' : 'var(--danger-color)'}">
                    ${item.type === 'income' ? '+' : '-'}${formatCurrency(item.amount)}
                </td>
                <td>
                    ${isAdmin ? `
                        <div style="display: flex; gap: 0.5rem;">
                            <button onclick="editRentalHistoryItem('${item.id}', ${item.isBill})" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.35rem 0.7rem;">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button onclick="deleteRentalHistoryItem('${item.id}', ${item.isBill})" class="btn btn-danger btn-icon" style="height: 28px; width: 28px;">
                                <i class="fas fa-trash-can"></i>
                            </button>
                        </div>
                    ` : `<span style="color: var(--text-muted); font-size: 0.8rem;">No Actions</span>`}
                </td>
            </tr>
        `;
    }).join('');
};

window.editRentalHistoryItem = function (id, isBill) {
    closeModal("rental-history-modal");
    if (isBill) {
        openEditBill(id);
    } else {
        openEditTransaction(id);
    }
};

window.deleteRentalHistoryItem = function (id, isBill) {
    if (isBill) {
        deleteBillAction(id);
    } else {
        deleteTransactionAction(id);
    }
};

window.openDashboardMembersModal = function () {
    openModal("dashboard-members-modal");
    renderDashboardMembersTable();
};

window.renderDashboardMembersTable = function () {
    const elMembersBody = document.getElementById("dashboard-members-table-body");
    if (!elMembersBody) return;

    if (state.members.length === 0) {
        elMembersBody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; color: var(--text-secondary);" class="py-8">
                    No household members registered.
                </td>
            </tr>`;
        return;
    }

    elMembersBody.innerHTML = state.members.map(m => {
        const cleanPhone = m.whatsapp ? m.whatsapp.replace(/[^0-9]/g, '') : '';
        return `
            <tr class="animate-fade-in">
                <td style="font-weight: 600; color: var(--text-primary);">${m.name}</td>
                <td>
                    ${m.whatsapp ? `
                        <a href="https://wa.me/${cleanPhone}" target="_blank" style="color: var(--whatsapp-color); font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 0.2rem;">
                            <i class="fab fa-whatsapp" style="font-size: 0.95rem;"></i> Chat
                        </a>
                    ` : `<span style="color: var(--text-muted); font-size: 0.85rem;">No WhatsApp</span>`}
                </td>
                <td class="mono" style="font-weight: 700; color: var(--accent-blue);">${formatCurrency(m.balance)}</td>
            </tr>
        `;
    }).join('');
};
