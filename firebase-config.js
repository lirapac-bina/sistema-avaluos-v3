// firebase-config.js
// Configuración centralizada y segura (Live-Server Proof)

var apiKeyEncoded = "QUl6YVN5QkRYM2hZVzJ1LU9oWUpXSjlCMmdBQW50VjBPWnlrZms0";

var firebaseConfig = {
    apiKey: atob(apiKeyEncoded),
    authDomain: "sistema-hipoteca-facil.firebaseapp.com",
    projectId: "sistema-hipoteca-facil",
    storageBucket: "sistema-hipoteca-facil.firebasestorage.app",
    messagingSenderId: "880781885603",
    appId: "1:880781885603:web:8a74a7f811974940ccbf16"
};

// Inicializar Firebase (Solo si no existe)
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("🔥 Firebase inicializado correctamente.");
}

// Configurar DB y Auth
if (typeof firebase !== 'undefined') {
    window.db = firebase.firestore();
    window.db.settings({ ignoreUndefinedProperties: true }); 
    console.log("✅ Base de datos conectada y global.");

    var getCookie = function(name) {
        var value = "; " + document.cookie;
        var parts = value.split("; " + name + "=");
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    };

    var fbToken = getCookie('leezar_token');
    
    if (fbToken && typeof firebase.auth === 'function') {
        firebase.auth().onAuthStateChanged(function(user) {
            if (!user) {
                firebase.auth().signInWithCustomToken(fbToken)
                    .then(function() { console.log("🔐 Conexión segura establecida con Firebase Auth."); })
                    .catch(function(error) { console.error("❌ Error de credenciales Firebase:", error); });
            } else {
                console.log("🔐 Sesión activa detectada. Permisos listos.");
            }
        });
    }
}