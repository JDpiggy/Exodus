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

