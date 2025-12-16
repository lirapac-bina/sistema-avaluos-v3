exports.handler = async (event, context) => {
  // Obtenemos el correo, convirtiéndolo a minúsculas para evitar errores
  const usuario = (event.queryStringParameters.user || '').toLowerCase();
  
  console.log(`🔍 Generando asignaciones personalizadas para: ${usuario}`);

  let asignaciones = [];

  // CASO 1: ADMIN (Lirapac) -> Ve 4 folios mixtos
  if (usuario.includes('lirapac')) {
    asignaciones = [
      { id: 'GYS-10001', etiqueta: 'GYS-10001 | CASA HABITACIÓN | ZONA CENTRO' }, // GYS 5 dígitos
      { id: 'GYS-10002', etiqueta: 'GYS-10002 | DEPARTAMENTO | REFORMA' },
      { id: 'EME-4001',  etiqueta: 'EME-4001  | TERRENO BALDÍO | LAS ÁNIMAS' }, // EME 4 dígitos
      { id: 'EME-4002',  etiqueta: 'EME-4002  | LOCAL COMERCIAL | PLAZA CRYSTAL' }
    ];
  } 
  // CASO 2: CAPTURISTA (Buenfil Alonso) -> Ve 2 folios diferentes
  else if (usuario.includes('buenfil.alonso')) {
    asignaciones = [
      { id: 'GYS-30500', etiqueta: 'GYS-30500 | CASA INTERÉS SOCIAL | EL TEJAR' },
      { id: 'EME-9100',  etiqueta: 'EME-9100  | BODEGA INDUSTRIAL | BRUNO PAGLIAI' }
    ];
  }
  // CASO 3: CUALQUIER OTRO (Para pruebas rápidas)
  else {
    asignaciones = [
      { id: 'GYS-99999', etiqueta: 'GYS-99999 | DEMO | USUARIO NUEVO' },
      { id: 'EME-1111',  etiqueta: 'EME-1111  | DEMO | USUARIO NUEVO' }
    ];
  }

  return {
    statusCode: 200,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*' 
    },
    body: JSON.stringify(asignaciones)
  };
};