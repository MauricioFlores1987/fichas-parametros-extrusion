// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyASU5rTQV4RXfG4rzdTxg-WtSAB99kFIQw",
  authDomain: "fichas-extrusion.firebaseapp.com",
  projectId: "fichas-extrusion",
  storageBucket: "fichas-extrusion.firebasestorage.app",
  messagingSenderId: "594713020374",
  appId: "1:594713020374:web:03dfb04041995cba6e4677",
  measurementId: "G-Z6QE8PFH4D"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
