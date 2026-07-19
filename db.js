import { 
    collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, 
    onSnapshot, query, orderBy, limit, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

// --- AUTH / USER HELPERS ---

/**
 * Saves a user profile doc into the 'users' collection with Admin/Approval states.
 */
async function saveUserProfile(uid, email, isAdmin, approved) {
    const userRef = doc(db, "users", uid);
    await setDoc(userRef, {
        email: email,
        isAdmin: isAdmin,
        approved: approved,
        createdAt: serverTimestamp()
    }, { merge: true });
}

/**
 * Retrieves a user profile by UID to read their role.
 */
async function getUserProfile(uid) {
    const userRef = doc(db, "users", uid);
    const docSnap = await getDoc(userRef);
    if (docSnap.exists()) {
        return docSnap.data();
    }
    return null;
}

/**
 * Listens to all user profiles in real-time. (Admin Only)
 */
function subscribeToAllUsers(callback) {
    const usersRef = collection(db, "users");
    const q = query(usersRef, orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
        const users = [];
        snapshot.forEach((doc) => {
            users.push({ uid: doc.id, ...doc.data() });
        });
        callback(users);
    }, (error) => {
        console.error("Error subscribing to users list:", error);
    });
}

/**
 * Approves a user's registration request. (Admin Only)
 */
async function approveUser(uid) {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
        approved: true
    });
}

/**
 * Rejects or deletes a user profile document from Firestore. (Admin Only)
 */
async function deleteUserAccount(uid) {
    const userRef = doc(db, "users", uid);
    await deleteDoc(userRef);
}

// --- MEMBERS OPERATIONS ---

/**
 * Listens to the 'members' collection in real-time, ordered by creation date.
 */
function subscribeToMembers(callback) {
    const membersRef = collection(db, "members");
    const q = query(membersRef, orderBy("createdAt", "asc"));
    return onSnapshot(q, (snapshot) => {
        const members = [];
        snapshot.forEach((doc) => {
            members.push({ id: doc.id, ...doc.data() });
        });
        callback(members);
    }, (error) => {
        console.error("Error subscribing to members:", error);
    });
}

/**
 * Adds a new member to the household ledger, including WhatsApp contact.
 */
async function addMember(name, initialBalance, whatsapp) {
    const membersRef = collection(db, "members");
    await addDoc(membersRef, {
        name: name,
        balance: parseFloat(initialBalance) || 0,
        whatsapp: whatsapp || "",
        createdAt: serverTimestamp()
    });
}

/**
 * Updates a specific member's balance.
 */
async function updateMemberBalance(memberId, newBalance) {
    const memberRef = doc(db, "members", memberId);
    await updateDoc(memberRef, {
        balance: parseFloat(newBalance) || 0
    });
}

/**
 * Deletes a member from the ledger.
 */
async function deleteMember(memberId) {
    const memberRef = doc(db, "members", memberId);
    await deleteDoc(memberRef);
}

// --- UTILITY BILLS OPERATIONS ---

/**
 * Listens to the 'bills' collection in real-time, ordered by creation date (newest first).
 */
function subscribeToBills(callback) {
    const billsRef = collection(db, "bills");
    const q = query(billsRef, orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
        const bills = [];
        snapshot.forEach((doc) => {
            bills.push({ id: doc.id, ...doc.data() });
        });
        callback(bills);
    }, (error) => {
        console.error("Error subscribing to bills:", error);
    });
}

/**
 * Adds a new utility bill to the list.
 */
async function addBill(name, amount, paidStatus) {
    const billsRef = collection(db, "bills");
    await addDoc(billsRef, {
        name: name,
        amount: parseFloat(amount) || 0,
        paid: paidStatus === "paid",
        createdAt: serverTimestamp()
    });
}

/**
 * Toggles a bill's paid status.
 */
async function toggleBillPaidStatus(billId, currentPaidStatus) {
    const billRef = doc(db, "bills", billId);
    await updateDoc(billRef, {
        paid: !currentPaidStatus
    });
}

/**
 * Updates a utility bill's fields.
 */
async function updateBill(billId, name, amount, paidStatus) {
    const billRef = doc(db, "bills", billId);
    await updateDoc(billRef, {
        name: name,
        amount: parseFloat(amount) || 0,
        paid: paidStatus === "paid"
    });
}

/**
 * Deletes a utility bill.
 */
async function deleteBill(billId) {
    const billRef = doc(db, "bills", billId);
    await deleteDoc(billRef);
}

// --- TRANSACTIONS (INCOME & GENERAL EXPENSES) ---

/**
 * Listens to the 'transactions' collection in real-time, ordered by transaction date desc.
 */
function subscribeToTransactions(callback) {
    const transactionsRef = collection(db, "transactions");
    const q = query(transactionsRef, orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
        const transactions = [];
        snapshot.forEach((doc) => {
            transactions.push({ id: doc.id, ...doc.data() });
        });
        callback(transactions);
    }, (error) => {
        console.error("Error subscribing to transactions:", error);
    });
}

/**
 * Adds an income/expense entry to the ledger. Includes optional memberId reference, isRentPayment flag, and isGeneralLedger flag.
 */
async function addTransaction(desc, type, amount, memberId = "", isRentPayment = false, isGeneralLedger = false) {
    const transactionsRef = collection(db, "transactions");
    await addDoc(transactionsRef, {
        desc: desc,
        type: type, // "income" | "expense"
        amount: parseFloat(amount) || 0,
        memberId: memberId,
        isRentPayment: isRentPayment,
        isGeneralLedger: isGeneralLedger,
        createdAt: serverTimestamp()
    });
}

/**
 * Updates a transaction's fields.
 */
async function updateTransaction(transactionId, desc, type, amount) {
    const transactionRef = doc(db, "transactions", transactionId);
    await updateDoc(transactionRef, {
        desc: desc,
        type: type,
        amount: parseFloat(amount) || 0
    });
}

/**
 * Deletes a ledger entry.
 */
async function deleteTransaction(transactionId) {
    const transactionRef = doc(db, "transactions", transactionId);
    await deleteDoc(transactionRef);
}

// --- LEDGER CONFIGURATION / SETTINGS ---

/**
 * Listens to the single settings document (rental settings) in real-time.
 */
function subscribeToSettings(callback) {
    const settingsRef = doc(db, "settings", "rental");
    return onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists()) {
            callback(docSnap.data());
        } else {
            // Default settings if non-existent yet
            callback({ rentalAmount: 0, rentalDay: 1 });
        }
    }, (error) => {
        console.error("Error subscribing to settings:", error);
    });
}

/**
 * Saves or updates rental settings in Firestore.
 */
async function saveSettings(rentalAmount, rentalDay) {
    const settingsRef = doc(db, "settings", "rental");
    await setDoc(settingsRef, {
        rentalAmount: parseFloat(rentalAmount) || 0,
        rentalDay: parseInt(rentalDay) || 1
    }, { merge: true });
}

export {
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
};
