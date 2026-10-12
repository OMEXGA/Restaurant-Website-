import {
	onAuthStateChanged,
	signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import { auth } from "./firebase.js";

const form = document.querySelector("#login-form");
const message = document.querySelector("#login-message");
const submitButton = form.querySelector('button[type="submit"]');

onAuthStateChanged(auth, (user) => {
	if (user) {
		window.location.replace("menu.html");
	}
});

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	message.textContent = "";
	submitButton.disabled = true;
	submitButton.textContent = "Signing in...";

	try {
		await signInWithEmailAndPassword(
			auth,
			form.elements.email.value.trim(),
			form.elements.password.value,
		);
		window.location.replace("menu.html");
	} catch {
		message.textContent = "Unable to sign in. Check your email and password.";
	} finally {
		submitButton.disabled = false;
		submitButton.textContent = "Enter";
	}
});