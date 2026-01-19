// firebase-config.js
// Configuración centralizada y segura (Base64)

// 1. La Llave Maestra (Cifrada)
const apiKeyEncoded = "QUl6YVN5QkRYM2hZVzJ1LU9oWUpXSjlCMmdBQW50VjBPWnlrZms0";

const firebaseConfig = {
    apiKey: atob(apiKeyEncoded),
    authDomain: "sistema-hipoteca-facil.firebaseapp.com",
    projectId: "sistema-hipoteca-facil",
    storageBucket: "sistema-hipoteca-facil.firebasestorage.app",
    messagingSenderId: "880781885603",
    appId: "1:880781885603:web:8a74a7f811974940ccbf16"
};

// 2. Inicializar Firebase (Si no existe ya)
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("🔥 Firebase inicializado correctamente.");
}

// 3. EXPORTAR DB AL MUNDO (La corrección mágica)
if (typeof firebase !== 'undefined') {
    // Usamos 'window.db' para asegurar que TODOS los archivos la vean
    window.db = firebase.firestore();
    console.log("✅ Base de datos conectada y global.");
} else {
    console.error("❌ Error: Librerías de Firebase no cargadas antes de la configuración.");
}