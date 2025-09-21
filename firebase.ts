import { initializeApp } from "firebase/app";
import { getFunctions } from "firebase/functions";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDCtM4i_wUZdnEjlc_cJSdtyynrGZnWRT8",
  authDomain: "kidreads-v2.firebaseapp.com",
  projectId: "kidreads-v2",
  storageBucket: "kidreads-v2.firebasestorage.app",
  messagingSenderId: "105452528274",
  appId: "1:105452528274:web:c590cfa6dfac01e1577c4b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const functions = getFunctions(app);