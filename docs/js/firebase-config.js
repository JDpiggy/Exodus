// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Initialize Firebase
// This uses the globally available 'firebase' object loaded from the SDK script tags in HTML
try {
  if (!firebase.apps.length) { // Check if Firebase has already been initialized
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase initialized successfully in firebase-config.js");
    // if (firebase.analytics && typeof firebase.analytics === 'function') {
    //   firebase.analytics(); // Uncomment if you've set up Analytics and want to use it
    // }
  } else {
    console.log("Firebase already initialized.");
  }
} catch (e) {
  console.error("CRITICAL: Error initializing Firebase in firebase-config.js:", e);
  alert("Error initializing Firebase. Please check the console for details. The app may not work correctly.");
}

// Make Firebase services globally accessible via these variables for clarity,
// though they could also be accessed directly as firebase.auth() and firebase.firestore()
// in other files, provided this script and the SDKs run first.
let auth;
let db;

try {
  auth = firebase.auth();
  db = firebase.firestore();
  if (!auth) console.warn("firebase.auth() is not available after init.");
  if (!db) console.warn("firebase.firestore() is not available after init.");
} catch (e) {
  console.error("CRITICAL: Error accessing firebase.auth() or firebase.firestore() in firebase-config.js:", e);
  alert("Error accessing Firebase services. Please check the console. The app may not work correctly.");
}
