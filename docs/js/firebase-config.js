console.log("firebase-config.js: Script started.");
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAUYBM8Fzz-8couD9c_--e7sWJQixk9CfA",
  authDomain: "exodus-calendar.firebaseapp.com",
  projectId: "exodus-calendar",
  storageBucket: "exodus-calendar.firebasestorage.app",
  messagingSenderId: "456650258105",
  appId: "1:456650258105:web:ec9fc2686a721b19ef0d68",
  measurementId: "G-6LT5GHSKCP"
};

var auth;
var db;

try {
  console.log("firebase-config.js: Checking for global firebase object...");
  if (typeof firebase === 'undefined') {
    console.error("firebase-config.js: CRITICAL - global 'firebase' object is UNDEFINED. SDKs didn't load or run.");
    throw new Error("Firebase SDK not loaded.");
  }
  console.log("firebase-config.js: Global 'firebase' object found:", firebase);

  if (!firebase.apps.length) {
    console.log("firebase-config.js: Initializing Firebase app using firebase.initializeApp()...");
    firebase.initializeApp(firebaseConfig);
    console.log("firebase-config.js: firebase.initializeApp called.");
  } else {
    console.log("firebase-config.js: Firebase app already initialized.");
  }

  console.log("firebase-config.js: Attempting to get auth and firestore instances using firebase.auth() and firebase.firestore()...");
  if (firebase.auth) {
    auth = firebase.auth();
    console.log("firebase-config.js: 'auth' instance created (v8):", auth ? 'OK' : 'FAILED');
  } else {
    console.error("firebase-config.js: CRITICAL - firebase.auth function is UNDEFINED.");
  }

  if (firebase.firestore) {
    db = firebase.firestore();
    console.log("firebase-config.js: 'db' instance created (v8):", db ? 'OK' : 'FAILED');
  } else {
    console.error("firebase-config.js: CRITICAL - firebase.firestore function is UNDEFINED.");
  }

} catch (e) {
  console.error("firebase-config.js: CRITICAL ERROR in try-catch block:", e);
}

console.log("firebase-config.js: Script finished. Final 'auth':", auth, "Final 'db':", db);
