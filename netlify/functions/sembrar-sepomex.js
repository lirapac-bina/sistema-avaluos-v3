const admin = require('firebase-admin');
const fs = require('fs');
const xml2js = require('xml2js');

// 1. CONEXIÓN A FIREBASE
const serviceAccount = require('./serviceaccountkey.json'); // Ajusta la ruta a tu llave
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 2. LECTURA Y PROCESAMIENTO DEL XML
fs.readFile('CPdescarga.xml', 'utf-8', (err, data) => {
  if (err) {
    console.error("❌ Error leyendo el archivo XML:", err);
    return;
  }

  xml2js.parseString(data, async (err, result) => {
    if (err) {
        console.error("❌ Error parseando el XML:", err);
        return;
    }

    console.log("⚙️ Procesando datos y agrupando por CP...");
    // El XML de SEPOMEX viene anidado en NewDataSet -> table
    const tablas = result.NewDataSet.table;
    const codigosPostales = {};

    tablas.forEach(row => {
        const cp = row.d_codigo ? row.d_codigo[0] : null;
        if (!cp) return;

        // Todo estrictamente a MAYÚSCULAS según regla de negocio
        const colonia = row.d_asenta ? row.d_asenta[0].toUpperCase() : '';
        const municipio = row.D_mnpio ? row.D_mnpio[0].toUpperCase() : '';
        const estado = row.d_estado ? row.d_estado[0].toUpperCase() : '';
        const ciudad = row.d_ciudad ? row.d_ciudad[0].toUpperCase() : '';
        const cve_municipio = row.c_mnpio ? row.c_mnpio[0] : '';
        const cve_estado = row.c_estado ? row.c_estado[0] : '';

        if (!codigosPostales[cp]) {
            codigosPostales[cp] = {
                colonias: [],
                municipio: municipio,
                estado: estado,
                ciudad: ciudad,
                cve_municipio: cve_municipio,
                cve_estado: cve_estado
            };
        }
        codigosPostales[cp].colonias.push(colonia);
    });

    const total = Object.keys(codigosPostales).length;
    console.log(`🚀 Listo para inyectar ${total} Códigos Postales a Firebase...`);

    // 3. INYECCIÓN POR LOTES (BATCH) PARA NO SATURAR FIREBASE
    let batch = db.batch();
    let count = 0;
    let completados = 0;

    for (const [cp, dataCP] of Object.entries(codigosPostales)) {
        // La colección se llamará 'codigos_postales' y el ID del doc será el CP (ej. '91637')
        const docRef = db.collection('codigos_postales').doc(cp);
        batch.set(docRef, dataCP);
        count++;
        completados++;

        // Firebase permite máximo 500 operaciones por Batch
        if (count === 450 || completados === total) {
            await batch.commit();
            console.log(`✅ Subidos: ${completados} / ${total}`);
            batch = db.batch(); // Reiniciamos el lote
            count = 0;
        }
    }

    console.log("🏁 ¡Base de datos SEPOMEX inyectada exitosamente!");
  });
});