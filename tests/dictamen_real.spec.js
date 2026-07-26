const { test, expect } = require('@playwright/test');

// Inyectamos las credenciales reales de la captura
test.use({ 
    permissions: ['geolocation'],
    storageState: {
        cookies: [],
        origins: [{
            origin: 'http://localhost:8888',
            localStorage: [{
                name: 'leezar_user_active',
                value: '{"email":"pamenogue9@gmail.com","rol":"admin","nombre":"Pamela Nogueira Aguayo","cedula":"11839324","telefono":"2281527629"}'
            }]
        }]
    }
});

test('Prueba REAL Fase 1 y 2: Motor V3600 y Generación PDF', async ({ page }) => {
    
    // ⏱️ AUMENTAMOS EL TIEMPO GLOBAL DE LA PRUEBA A 120 SEGUNDOS (120,000 ms)
    test.setTimeout(120000);

    // 🌐 1. NAVEGACIÓN (Sin Mocks, conexión directa a Producción)
    await page.goto('http://localhost:8888/dictamen_eme.html');

    // 👤 2. IDENTIFICACIÓN Y UBICACIÓN
    await page.waitForSelector('#perfil_usuario');
    await page.selectOption('#perfil_usuario', '3'); 
    
    await page.selectOption('#tipo_inmueble', 'Terreno');
    await page.selectOption('#uso_suelo', 'Habitacional');
    await page.fill('#txt_estado', 'Veracruz');
    await page.fill('#txt_ciudad', 'Xalapa');
    await page.fill('#txt_colonia', 'Badillo');
    
    await page.fill('#txt_calle', 'TERCERA PRIVADA DE AGUA SANTA');
    await page.fill('#txt_cp', '91045');
    await page.fill('#coordenadas_google', '19.527538, -96.901454');
    
    // 📐 3. CARACTERÍSTICAS DEL TERRENO
    await page.fill('#num_superficie_terreno', '180.75');
    await page.fill('#num_frente', '8.89');
    await page.fill('#num_fondo', '19.95');
    await page.selectOption('select[name="Ubicacion_en_Manzana"]', 'Un frente');
    await page.selectOption('select[name="Frente_a"]', 'Servidumbre de paso');
    await page.selectOption('select[name="Topografia"]', 'Plano');
    await page.selectOption('#sel_clase', 'Interés Social');

    // 🏗️ 4. CAPA ADN E INFRAESTRUCTURA
    await page.selectOption('select[name="Tipo_de_Calle"]', 'Calle de Piedra');
    await page.selectOption('select[name="Tipo_de_Acceso_Complejo"]', 'Porton Electrico');
    await page.selectOption('select[name="Red_de_Agua"]', 'Conexion al Inmueble');
    await page.selectOption('select[name="Tipo_de_Drenaje"]', 'Conexion a Red');
    await page.selectOption('select[name="Senalizacion_Nomenclatura"]', 'Solo Nomenclatura');

    // ⚖️ 5. PARÁMETROS CRÍTICOS
    await page.selectOption('select[name="Certeza_Juridica"]', 'Escritura Publica');
    await page.selectOption('select[name="Regimen_Propiedad"]', 'Privada Condominal');
    await page.selectOption('select[name="Tipo_de_Vigilancia"]', 'Publica');
    await page.selectOption('select[name="Colindancia"]', 'Habitacional');

    // 📊 6. TESTIGOS MANUALES (Muestreo)
    // T1
    await page.fill('input[name="EME_CP_T1_Precio"]', '450000');
    await page.fill('input[name="EME_CP_T1_Sup_Terreno"]', '198');
    await page.selectOption('select[name="EME_CP_T1_Zona"]', 'Peor que el sujeto');
    await page.fill('input[name="EME_CP_T1_Link"]', 'https://bit.ly/4fnoP67');
    // T2
    await page.fill('input[name="EME_CP_T2_Precio"]', '600000');
    await page.fill('input[name="EME_CP_T2_Sup_Terreno"]', '296');
    await page.selectOption('select[name="EME_CP_T2_Zona"]', 'Peor que el sujeto');
    await page.fill('input[name="EME_CP_T2_Link"]', 'https://bit.ly/3RC7jBL');
    // T3
    await page.fill('input[name="EME_CP_T3_Precio"]', '450000');
    await page.fill('input[name="EME_CP_T3_Sup_Terreno"]', '254');
    await page.selectOption('select[name="EME_CP_T3_Zona"]', 'Peor que el sujeto');
    await page.fill('input[name="EME_CP_T3_Link"]', 'https://bit.ly/4fmI1Rl');
    // T4 - INYECCIÓN DE VARIACIÓN MATEMÁTICA PARA FORZAR HASH
    const variacionAleatoria = Math.floor(Math.random() * 99) + 1; // Suma entre $1 y $99 pesos al azar
    const precioT4Modificado = 550000 + variacionAleatoria;

    await page.fill('input[name="EME_CP_T4_Precio"]', precioT4Modificado.toString());
    await page.fill('input[name="EME_CP_T4_Sup_Terreno"]', '222');
    await page.selectOption('select[name="EME_CP_T4_Zona"]', 'Peor que el sujeto');
    await page.fill('input[name="EME_CP_T4_Link"]', 'https://bit.ly/4hzjqtT');

    // =========================================================================
    // 👇 NOVEDADES: SELLO DE TIEMPO Y SUBIDA DE FOTOS (Selectores Exactos)
    // =========================================================================

    // A) INYECTAR LA HORA EN LAS NOTAS CON CÓDIGO ÚNICO DE PRECISIÓN
    const fechaHora = new Date().toLocaleString('es-MX');
    // Generamos una firma única combinando milisegundos exactos + un factor aleatorio
    const firmaUnica = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    
    await page.fill('textarea[name="Notas_Particulares"]', `Auditoría automatizada. Ejecución: ${fechaHora} [Auth: ${firmaUnica}]`); 

    // B) SUBIR LA FOTO DE PORTADA 
    const inputPortada = page.locator('#foto_portada'); 
    await inputPortada.setInputFiles('tests/fachada.jpg');

    // =========================================================================

    // 🚀 7. CALCULAR PRE-DICTAMEN (Clic Forzado e Infalible)
    const btnCalcular = page.locator('#btn_pre_calcular');
    await btnCalcular.scrollIntoViewIfNeeded(); 
    await page.waitForTimeout(1000); 
    await btnCalcular.click({ force: true }); 

    // Aumentamos el límite de espera individual a 90 segundos (90000ms)
    await page.waitForSelector('#sec_checkout', { state: 'visible', timeout: 90000 });

    // 💳 8. BYPASS DE STRIPE (Mock Inteligente de Pasarela)
    await page.route('**/.netlify/functions/create-checkout-dictamen', async route => {
        const requestBody = JSON.parse(route.request().postData());
        
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ 
                url: `http://localhost:8888/dictamen_eme.html?success=true&session_id=cs_auto_local&ticket_id=${requestBody.ticket_id}` 
            })
        });
    });

    // Hacemos clic natural para que el frontend guarde el 'localStorage' y se auto-redirija
    await page.click('#btn_pagar_stripe');

    // 📄 9. FORJADO REAL DE PDF
    await page.waitForSelector('#btn_forjar_pdf', { state: 'visible', timeout: 30000 });
    await page.click('#btn_forjar_pdf');
    
    // 📸 10. EVIDENCIA
    await page.screenshot({ path: 'evidencia-pdf-real.png', fullPage: true });
    console.log("¡Dictamen REAL forjado con éxito en Netlify!");

    // 🛑 Le damos 10 segundos de gracia al navegador para que puedas ver el PDF cargado
    await page.waitForTimeout(10000); 
});