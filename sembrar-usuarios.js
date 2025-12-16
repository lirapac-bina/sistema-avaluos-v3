const admin = require('firebase-admin');

// 1. CONEXIÓN
// Busca la llave en la carpeta donde la tienes guardada
const serviceAccount = require('./netlify/functions/serviceaccountkey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 2. DEFINICIÓN DEL EQUIPO
const equipo = [
  // --- ADMINISTRADORES (Control Total) ---
  { email: 'lirapac@gmail.com', rol: 'admin', nombre: 'Lira' },
  { email: 'ivan.herrera110@gmail.com', rol: 'admin', nombre: 'Iván' },
  { email: 'perinu88@gmail.com', rol: 'admin', nombre: 'Perinu' },
  { email: 'pamenogue9@gmail.com', rol: 'admin', nombre: 'Pame' },

  // --- GESTORES (Asigna tareas, ve folios) ---
  { email: 'bel1305co@gmail.com', rol: 'gestor', nombre: 'Belén' },

  // --- CAPTURISTAS (Solo hojas de trabajo) ---
  { email: 'buenfil.alonso364@ueh.edu.mx', rol: 'capturista', nombre: 'Buenfil' }
];

async function sembrar() {
  console.log("🌱 Sembrando usuarios en Firebase...");

  for (const usuario of equipo) {
    // LIMPIEZA DE DATOS: Convertir a minúsculas y quitar espacios
    // Esto evita errores si Google manda "Buenfil..." con mayúscula
    const emailLimpio = usuario.email.toLowerCase().trim();

    await db.collection('usuarios').doc(emailLimpio).set({
      rol: usuario.rol,
      nombre: usuario.nombre,
      activo: true,
      fechaAlta: new Date().toISOString()
    });
    
    console.log(`✅ Usuario registrado: ${usuario.nombre} -> ${emailLimpio} (${usuario.rol})`);
  }
  console.log("🏁 ¡Base de datos de personal actualizada correctamente!");
}

sembrar();