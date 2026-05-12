const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  
  const data = JSON.parse(event.body);
  
  // Configura tu correo (puedes usar Gmail o el de tu dominio)
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'tu-correo@gmail.com',
      pass: 'tu-contraseña-de-aplicacion' // No es tu clave normal, es una especial de Google
    }
  });

  const mailOptions = {
    from: '"🎣 Jack el Pescador" <tu-correo@gmail.com>',
    to: 'tu-correo-personal@gmail.com', // El que te notifica en el celular
    subject: `¡NUEVO CLIENTE: ${data.nombre}!`,
    text: `Jack acaba de pescar a: ${data.nombre}\nTrámite: ${data.tramite}\nTeléfono: ${data.telefono}\n\nEntra a Leezar para asignar unidad.`
  };

  try {
    await transporter.sendMail(mailOptions);
    return { statusCode: 200, body: JSON.stringify({ message: 'Alerta enviada' }) };
  } catch (error) {
    return { statusCode: 500, body: error.toString() };
  }
};