const admin = require('firebase-admin');

exports.handler = async (event, context) => {
  const headers = { 'Access-Control-Allow-Origin': '*' }; // Para que el portal no tenga errores de CORS
  const id = event.queryStringParameters.id;
  if (!id) return { statusCode: 400, body: 'Falta ID' };

  try {
    const serviceAccount = require('./serviceaccountkey.json');
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    const db = admin.firestore();

    // Buscar en ambas colecciones
    let doc = await db.collection('expedientes_avaluos').doc(id).get();
    if (!doc.exists) doc = await db.collection('expedientes_hipotecas').doc(id).get();

    if (!doc.exists) return { statusCode: 404, body: JSON.stringify({ error: 'No encontrado' }) };

    const data = doc.data();
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        nombreCliente: data.nombreCliente,
        tipoTramite: data.tipoTramite,
        fechaCreacion: data.fechaCreacion,
        checklist: data.checklist || {} // Devuelve el checklist guardado
      })
    };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};