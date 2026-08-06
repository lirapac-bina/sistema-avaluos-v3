// eme-widget-core.js
// Este es el cerebro que inyecta la interfaz gráfica en la web del cliente

document.addEventListener("DOMContentLoaded", () => {
    // 1. Buscamos el contenedor que el cliente pegó en su web
    const widgetContenedor = document.getElementById('eme-motor-widget');

    if (widgetContenedor) {
        // 2. Limpiamos los estilos por defecto
        widgetContenedor.style = "max-width: 400px; margin: 0 auto; font-family: system-ui, -apple-system, sans-serif;";
        
        // 3. Dibujamos la interfaz gráfica oficial
        widgetContenedor.innerHTML = `
            <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); overflow: hidden;">
                
                <!-- ENCABEZADO (Cambia el #1e293b por el color oscuro oficial de AvEME) -->
                <div style="background: #1e293b; padding: 16px; text-align: center;">
                    <h3 style="margin: 0; color: white; font-size: 16px; font-weight: bold; letter-spacing: 0.5px;">
                        Motor Pericial AvEME
                    </h3>
                </div>

                <!-- CUERPO DEL WIDGET -->
                <div style="padding: 24px 20px; text-align: center;">
                    <p style="margin: 0 0 20px 0; font-size: 14px; color: #4b5563; line-height: 1.5;">
                        Obtén un estimado de valor comercial preciso con nuestra tecnología de Inteligencia Artificial.
                    </p>
                    
                    <!-- BOTÓN (Cambia el #991b1b por tu color de acción principal) -->
                    <button id="btn-eme-iniciar" style="background: #991b1b; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; transition: background 0.3s;" onmouseover="this.style.background='#7f1d1d'" onmouseout="this.style.background='#991b1b'">
                        Generar Dictamen
                    </button>
                </div>

                <!-- PIE DE PÁGINA (Backlink SEO) -->
                <div style="background: #f9fafb; padding: 12px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <span style="font-size: 11px; color: #9ca3af;">Tecnología impulsada por</span><br>
                    <a href="https://centrointegralinmobiliarioeme.com" target="_blank" style="font-size: 12px; color: #1e293b; font-weight: bold; text-decoration: none;">
                        Centro Integral Inmobiliario EME
                    </a>
                </div>
            </div>
        `;

        // 4. Le damos vida al botón
        document.getElementById('btn-eme-iniciar').addEventListener('click', () => {
            alert('Aquí abriremos el formulario del Motor Pericial AvEME.');
        });
    } else {
        console.warn("Widget AvEME: No se encontró el contenedor #eme-motor-widget en esta página.");
    }
});