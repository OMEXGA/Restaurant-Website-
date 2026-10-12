import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

const firebaseConfig = {
	apiKey: "AIzaSyBDDc9WZChMwwSYuFOf8M9fUld2N_nexOs",
	authDomain: "system-analysis-77ce1.firebaseapp.com",
	databaseURL: "https://system-analysis-77ce1-default-rtdb.asia-southeast1.firebasedatabase.app",
	projectId: "system-analysis-77ce1",
	storageBucket: "system-analysis-77ce1.firebasestorage.app",
	messagingSenderId: "101432144990",
	appId: "1:101432144990:web:dbae3cce51fd6da3e8b0cf",
	measurementId: "G-V5L8DHE3NV",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);