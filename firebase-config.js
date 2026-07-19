// Import the Firebase SDK modules we need from the CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// TODO: Replace this placeholder config object with the one you copied 
// from your Firebase Console (Project Settings > Your Apps > Web app setup).
const firebaseConfig = {
    apiKey: "AIzaSyCDvrqNoSIfi3u569ryc_R6HtGrfwDe1jU",
    authDomain: "finance-tracker-v2-3a716.firebaseapp.com",
    projectId: "finance-tracker-v2-3a716",
    storageBucket: "finance-tracker-v2-3a716.firebasestorage.app",
    messagingSenderId: "837943421384",
    appId: "1:837943421384:web:d7604eb15a53e240a878fd",
    measurementId: "G-YPBDLDH2ES"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Export instances to be used by other parts of the application
export { app, auth, db, firebaseConfig };
