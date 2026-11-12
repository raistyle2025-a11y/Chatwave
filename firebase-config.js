
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCxX5jSa2OudiQnfq0gypLOZtTZUzoGVFE",
  authDomain: "chatwave-cad2d.firebaseapp.com",
  projectId: "chatwave-cad2d",
  storageBucket: "chatwave-cad2d.firebasestorage.app",
  messagingSenderId: "11375574517",
  appId: "1:11375574517:web:4a8e6a4f7418b64cda74bc"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export { app };
