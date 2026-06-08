import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Configuration Firebase (À remplacer par vos infos)
const firebaseConfig = {
    apiKey: "AIzaSyAeQmIo2EEQNSvuBt54obS-qrRxn35WaT8",
    authDomain: "operating-system-ea358.firebaseapp.com",
    projectId: "operating-system-ea358",
    storageBucket: "operating-system-ea358.firebasestorage.app",
    messagingSenderId: "896027329219",
    appId: "1:896027329219:web:59d7ef893c8ee61c10d876",
    measurementId: "G-8KRMJJF1C8"
};

// Initialisation
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.getElementById('employeeLoginForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        // 1. Connexion de l'utilisateur
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Vérification de son existence dans la collection "users"
        const userDoc = await getDoc(doc(db, "users", user.uid));

        if (userDoc.exists()) {
            alert(`Bienvenue ${userDoc.data().firstName} ! Connexion réussie.`);
            // Redirection vers l'espace de travail ici
        } else {
            alert("Compte valide mais introuvable dans la base employés.");
        }
    } catch (error) {
        console.error("Erreur de connexion :", error);
        alert("Identifiants incorrects ou erreur réseau.");
    }
});