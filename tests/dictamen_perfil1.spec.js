const { test, expect } = require('@playwright/test');

// 📍 Autorizamos automáticamente el uso del GPS/Ubicación para que el mapa no bloquee el script
test.use({ permissions: ['geolocation'] });

// Agregamos "context" para controlar todas las pestañas
test('Prueba E2E Completa: Pre-Dictamen y Forjado de PDF', async ({ page, context }) => {
    
    // 🛡️ 1. EL SIMULACRO GLOBAL (MOCK) 
    await context.route('**/.netlify/functions/*', async route => {
        const respuestaSimulada = {
            resultado: {
                data: { valor_final: 1500000 },
                auditoria_inyeccion: { limite_inf: 1350000, limite_sup: 1650000 }
            },
            estatus: "completado",
            estatus_pdf: "completado", 
            pdf_url: "https://sistema-local.com/documento.pdf" 
        };
        
        await route.fulfill({ 
            status: 200, 
            contentType: 'application/json', 
            body: JSON.stringify(respuestaSimulada) 
        });
    });

    // 🛡️ 1.5 MOCK DE LA DESCARGA GLOBAL (Protege la nueva pestaña)
    await context.route('https://sistema-local.com/documento.pdf', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: '<h1 style="color: #059669; text-align: center; font-family: sans-serif; margin-top: 50px;">📄 PDF Simulado Descargado Correctamente</h1>'
        });
    });

    // 🌐 2. NAVEGACIÓN Y BYPASS DE SEGURIDAD
    await page.goto('http://localhost:8888/'); 
    await page.evaluate(() => {
        localStorage.setItem('leezar_user_active', JSON.stringify({ 
            email: 'buenfil.alonso364@ueh.edu.mx', 
            rol: 'admin' 
        }));
    });
    await page.goto('http://localhost:8888/dictamen_eme.html');

    // 🤖 3. LLENADO DEL FORMULARIO
    await page.waitForSelector('#perfil_usuario');
    await page.selectOption('#perfil_usuario', '1');
    await page.waitForSelector('#tipo_inmueble');
    await page.selectOption('#tipo_inmueble', 'Casa');
    await page.fill('#num_superficie_terreno', '150');
    await page.fill('#num_sup_const', '120');
    await page.fill('#num_edad', '5');

    // 🚀 4. CALCULAR PRE-DICTAMEN
    await page.click('#btn_pre_calcular'); // ID real de tu código
    await page.waitForSelector('#sec_checkout', { state: 'visible' }); // Esperamos al Checkout
    
    // 💳 5. BYPASS DE STRIPE: Simulamos el retorno exitoso de pago
    await page.goto('http://localhost:8888/dictamen_eme.html?success=true&session_id=cs_test_123&ticket_id=TEST-LOCAL-123');

    // 📄 6. GENERAR PDF FINAL
    await page.waitForSelector('#btn_forjar_pdf', { state: 'visible' }); // Botón inyectado por JS
    await page.click('#btn_forjar_pdf');

    // Esperamos a que la UI confirme la descarga y tomamos la foto de victoria
    await page.waitForTimeout(2000); 
    await page.screenshot({ path: 'evidencia-pdf-terminado.png', fullPage: true });
    
    console.log("¡Dictamen forjado con éxito!");
});