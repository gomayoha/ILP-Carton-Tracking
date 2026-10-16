// ─────────────────────────────────────────────────────────────────────────────
// App configuration. This is the only file you normally need to edit.
// ─────────────────────────────────────────────────────────────────────────────

// 1) Firebase web config. Paste it from Firebase console →
//    Project settings → General → Your apps → Web app → "SDK setup and configuration" → Config.
//    Leave as null to run in DEMO mode (data is saved only in this browser).
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAzVxdKW05TkndO96tToBNImpZOVWJmil0",
  authDomain: "ilp-carton-tracking.firebaseapp.com",
  projectId: "ilp-carton-tracking",
  storageBucket: "ilp-carton-tracking.firebasestorage.app",
  messagingSenderId: "503990665447",
  appId: "1:503990665447:web:7ff8b9b78da10136f9e242",
};
// Example:
// export const FIREBASE_CONFIG = {
//   apiKey: "AIza...",
//   authDomain: "ilp-carton-tracking.firebaseapp.com",
//   projectId: "ilp-carton-tracking",
//   appId: "1:1234567890:web:abc123",
// };

// 2) Login. false = anyone with the link can use the app.
//    true  = staff sign in once per device (accounts are created in Firebase console → Authentication).
//    If you switch this on, also publish the "LOGIN MODE" rules from firestore.rules.
export const REQUIRE_LOGIN = false;

// 3) Public address of the app. Printed inside every QR code so a phone camera opens the carton record.
//    When the app is opened from this address it is detected automatically; this value is the fallback
//    used when labels are printed from a test copy (e.g. localhost).
export const APP_URL = 'https://gomayoha.github.io/ILP-Carton-Tracking/';

export const APP_VERSION = '1.0.0';
