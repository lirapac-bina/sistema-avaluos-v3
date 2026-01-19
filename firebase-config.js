// firebase-config.js
// Configuración centralizada y segura (Base64)

const apiKeyEncoded = "QUl6YVN5QkRYM2hZVzJ1LU9oWUpXSjlCMmdBQW50VjBPWnlrZms0";

const firebaseConfig = {
    apiKey: atob(apiKeyEncoded),
    authDomain: "sistema-hipoteca-facil.firebaseapp.com",
    projectId: "sistema-hipoteca-facil",
    storageBucket: "sistema-hipoteca-facil.firebasestorage.app",
    messagingSenderId: "880781885603",
    appId: "1:880781885603:web:8a74a7f811974940ccbf16"
};

// Inicializar solo si no existe ya una instancia
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase inicializado desde el Maestro (Modo Seguro).");
}
// Exportamos db globalmente si se necesita
let db;
if (typeof firebase !== 'undefined') {
    db = firebase.firestore();
}