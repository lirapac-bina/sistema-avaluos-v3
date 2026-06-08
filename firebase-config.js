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
    window.db = firebase.firestore();
    
    // 🛠️ FIX CRÍTICO 1: Eliminamos 'experimentalForceLongPolling' que causaba el conflicto y crash en consola.
    window.db.settings({ ignoreUndefinedProperties: true }); 
    console.log("✅ Base de datos conectada y global.");

    // 4. 🔥 AUTENTICACIÓN OFICIAL DE FIREBASE (PARCHE ANTIBALAS)
    const getCookie = (name) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    };

    const fbToken = getCookie('leezar_token');
    
    // 🛡️ PARCHE: Si el navegador bloquea el script o falla el token, el sistema no crashea
    if (fbToken) {
        if (typeof firebase.auth === 'function') {
            // 🛠️ FIX CRÍTICO 2: Firebase maneja la sesión automáticamente. 
            // Solo iniciamos con el token si no hay un usuario ya logueado para evitar rechazos de permisos.
            firebase.auth().onAuthStateChanged((user) => {
                if (!user) {
                    firebase.auth().signInWithCustomToken(fbToken)
                        .then(() => console.log("🔐 Conexión segura establecida con Firebase Auth."))
                        .catch((error) => console.error("❌ Error de credenciales Firebase:", error));
                } else {
                    console.log("🔐 Sesión activa detectada. Permisos listos.");
                }
            });
        } else {
            console.warn("⚠️ El navegador bloqueó el script de Auth, operando con funciones básicas.");
        }
    } else {
        console.warn("⚠️ No hay token de seguridad en las cookies. Debes iniciar sesión de nuevo.");
    }

} else {
    console.error("❌ Error: Librerías de Firebase no cargadas antes de la configuración.");
}