document.addEventListener("DOMContentLoaded", () => {
    // =================================================================
    // 1. GESTIÓN DE SESIÓN Y DATOS
    // =================================================================
    
    // A. Captura prioritaria desde URL (Login)
    const params = new URLSearchParams(window.location.search);
    if (params.has('email')) {
        sessionStorage.setItem('leezar_user_email', params.get('email'));
        if(params.get('name')) sessionStorage.setItem('leezar_user_name', params.get('name'));
        if(params.get('role')) sessionStorage.setItem('leezar_user_role', params.get('role'));
        if(params.get('photo')) sessionStorage.setItem('leezar_user_photo', params.get('photo'));
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // B. Recuperar sesión (Intentamos leer foto actualizada si existe)
    let activeUser = null;
    const emailSession = sessionStorage.getItem('leezar_user_email');
    
    if (emailSession) {
        activeUser = {
            nombre: sessionStorage.getItem('leezar_user_name') || 'Usuario Leezar',
            email: emailSession,
            rol: sessionStorage.getItem('leezar_user_role') || 'invitado',
            photo: sessionStorage.getItem('leezar_user_photo'),
            iniciales: (sessionStorage.getItem('leezar_user_name') || 'U').substring(0, 2).toUpperCase()
        };
    } 

    // C. Seguridad de Acceso
    const paginasPublicas = ['index.html', 'portal.html', 'login.html'];
    const paginaActual = window.location.pathname.split('/').pop() || 'index.html';

    if (!activeUser && !paginasPublicas.includes(paginaActual)) {
        window.location.href = 'index.html?error=sesion_expirada';
        return;
    }

    if (!activeUser) {
        activeUser = { nombre: 'Invitado', iniciales: 'IN', rol: 'ACCESO LIMITADO' };
    }

    // --- BLINDAJE DE ROLES ---
    const rolNormalizado = (activeUser.rol || '').toLowerCase();
    const esAdmin = ['admin', 'super admin', 'director'].includes(rolNormalizado);

    if (paginaActual.includes('admin') && !esAdmin) {
        alert("⛔ ACCESO DENEGADO");
        window.location.href = 'dashboard.html';
        return;
    }

    // =================================================================
    // 2. RENDERIZADO DEL LAYOUT (UI)
    // =================================================================
    if (!document.getElementById('layout-resources')) {
        const head = document.head;
        const fontLink = document.createElement('link'); fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'; fontLink.rel = 'stylesheet'; head.appendChild(fontLink);
        const iconLink = document.createElement('link'); iconLink.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20,400,1,0'; iconLink.rel = 'stylesheet'; head.appendChild(iconLink);
        
        const style = document.createElement('style');
        style.id = 'layout-resources';
        style.innerHTML = `
            body { font-family: 'Inter', sans-serif; display: flex; min-height: 100vh; overflow-x: hidden; }
            #app-sidebar { width: 16rem; position: fixed; top: 0; left: 0; height: 100vh; z-index: 50; transition: transform 0.3s ease-in-out; }
            main { margin-left: 16rem; width: calc(100% - 16rem); flex: 1; display: flex; flex-direction: column; min-height: 100vh; transition: margin 0.3s; }
            #mobile-header { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 60px; z-index: 40; align-items: center; justify-content: space-between; padding: 0 1rem; backdrop-filter: blur(10px); }
            @media (max-width: 768px) { 
                #app-sidebar { transform: translateX(-100%); box-shadow: none; }
                #app-sidebar.open { transform: translateX(0); box-shadow: 5px 0 15px rgba(0,0,0,0.3); }
                main { margin-left: 0; width: 100%; padding-top: 60px; }
                #mobile-header { display: flex; }
                #sidebar-overlay.active { display: block; }
            }
            #sidebar-overlay { display: none; position: fixed; inset: 0; bg-black/50; z-index: 45; }
            ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
            .nav-item:hover { background-color: #f1f5f9; color: #0d9488; }
            .nav-item.active { background: linear-gradient(90deg, rgba(20, 184, 166, 0.1) 0%, transparent 100%); border-right-color: #14b8a6; color: #0f766e; }
            .shake { animation: shake 0.5s; } @keyframes shake { 0%, 100% { transform: translateX(0); } 10%, 90% { transform: translateX(-5px); } 20%, 80% { transform: translateX(5px); } }
            .dark { color-scheme: dark; }
            /* Animación Modal */
            .modal-scale { animation: scaleIn 0.2s ease-out forwards; }
            @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        `;
        head.appendChild(style);
    }
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark');

    // Función auxiliar para generar el HTML del Avatar
    const getAvatarHTML = (user) => user.photo 
        ? `<img src="${user.photo}" id="sidebar-user-img" class="w-9 h-9 rounded-full shadow-md object-cover border border-slate-200 dark:border-slate-600">`
        : `<div id="sidebar-user-initials" class="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold shadow-md text-xs">${user.iniciales}</div>`;

    const menuAdminHTML = esAdmin ? `
        <div class="pt-2 border-t border-slate-100 dark:border-slate-800/50 mt-2">
            <p class="px-3 text-[10px] font-extrabold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-1">Admin <span class="material-symbols-rounded text-[10px] opacity-50">lock</span></p>
            <a href="#" onclick="solicitarPin(event)" class="nav-item w-full flex items-center px-3 py-2.5 text-slate-600 dark:text-slate-400 font-medium text-sm rounded-lg group hover:text-indigo-600 dark:hover:text-white ${window.location.pathname.includes('admin') ? 'active' : ''}"><span class="material-symbols-rounded mr-3 text-[22px] text-indigo-400 group-hover:text-indigo-600 dark:group-hover:text-white transition-colors">settings</span>Configuración</a>
        </div>
    ` : '';

    const layoutHTML = `
    <div id="sidebar-overlay" onclick="toggleSidebar()"></div>
    <div id="mobile-header" class="bg-white/90 border-b border-slate-200 dark:bg-[#0b1121]/90 dark:border-slate-800">
        <div class="flex items-center gap-3">
            <button onclick="toggleSidebar()" class="p-2 rounded-lg"><span class="material-symbols-rounded text-2xl">menu</span></button>
            <span class="font-extrabold text-lg">LEEZAR</span>
        </div>
        <div onclick="abrirMiPerfil()">${getAvatarHTML(activeUser)}</div>
    </div>
    <aside id="app-sidebar" class="bg-white border-r border-gray-200 dark:bg-[#0b1121] dark:border-slate-800 flex flex-col transition-colors duration-300">
        <div class="h-20 flex items-center px-6 shrink-0 md:flex hidden">
            <span class="material-symbols-rounded text-teal-500 text-4xl mr-2">apartment</span>
            <h1 class="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-white">LEEZAR</h1>
        </div>
        <div class="h-16 md:hidden"></div> 
        <div class="flex-1 overflow-y-auto px-3 space-y-6 py-4">
            <div>
                <p class="px-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2">Gestión</p>
                <ul class="space-y-1">
                    <li><a href="dashboard.html" class="nav-item w-full flex items-center px-3 py-2.5 text-slate-600 dark:text-slate-400 font-medium text-sm rounded-lg ${window.location.pathname.includes('dashboard') ? 'active' : ''}"><span class="material-symbols-rounded mr-3 text-[22px]">dashboard</span>Dashboard</a></li>
                    <li><a href="gestion.html" class="nav-item w-full flex items-center px-3 py-2.5 text-slate-600 dark:text-slate-400 font-medium text-sm rounded-lg ${window.location.pathname.includes('gestion') ? 'active' : ''}"><span class="material-symbols-rounded mr-3 text-[22px]">folder_shared</span>Expedientes</a></li>
                    <li><a href="revision.html" class="nav-item w-full flex items-center px-3 py-2.5 text-slate-600 dark:text-slate-400 font-medium text-sm rounded-lg ${window.location.pathname.includes('revision') ? 'active' : ''}"><span class="material-symbols-rounded mr-3 text-[22px]">verified</span>Mesa de Control</a></li>
                </ul>
            </div>
            <div>
                <p class="px-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2">Técnico</p>
                <ul class="space-y-1">
                    <li><a href="operacion.html" class="nav-item w-full flex items-center px-3 py-2.5 text-slate-600 dark:text-slate-400 font-medium text-sm rounded-lg ${window.location.pathname.includes('operacion') ? 'active' : ''}"><span class="material-symbols-rounded mr-3 text-[22px]">design_services</span>Hoja de Trabajo</a></li>
                </ul>
            </div>
            ${menuAdminHTML}
        </div>
        
        <div class="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#0b1121] space-y-3">
            <button onclick="document.documentElement.classList.toggle('dark'); localStorage.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'" class="w-full bg-white p-2 rounded-lg flex justify-between text-xs font-bold text-slate-600 shadow-sm"><span>Tema</span> <span class="material-symbols-rounded text-base">dark_mode</span></button>
            <div class="flex items-center gap-3 cursor-pointer p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors" onclick="abrirMiPerfil()" title="Editar mi perfil">
                ${getAvatarHTML(activeUser)}
                <div class="flex-1 overflow-hidden">
                    <p class="text-xs font-bold text-slate-800 dark:text-white truncate">${activeUser.nombre}</p>
                    <p class="text-[9px] text-teal-600 dark:text-teal-400 font-bold truncate uppercase">${activeUser.rol}</p>
                </div>
                <span class="material-symbols-rounded text-slate-400 text-lg">settings</span>
            </div>
            <button onclick="cerrarSesion()" class="w-full text-center text-[10px] text-red-400 hover:text-red-600 font-bold mt-1">CERRAR SESIÓN</button>
        </div>
    </aside>

    <div id="modal-mi-perfil" class="fixed inset-0 z-[100] hidden bg-[#0b1121]/90 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white dark:bg-[#1e293b] w-full max-w-sm rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-700 modal-scale relative">
            <button onclick="cerrarMiPerfil()" class="absolute top-4 right-4 text-slate-400 hover:text-white"><span class="material-symbols-rounded">close</span></button>
            
            <div class="text-center mb-6">
                <div class="relative w-24 h-24 mx-auto mb-2 group cursor-pointer" onclick="document.getElementById('mi-avatar-input').click()">
                    <img id="mi-avatar-preview" src="${activeUser.photo || ''}" class="w-full h-full rounded-full object-cover border-4 border-slate-100 dark:border-slate-700 shadow-lg ${!activeUser.photo ? 'hidden' : ''}">
                    <div id="mi-avatar-fallback" class="w-full h-full rounded-full bg-teal-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg ${activeUser.photo ? 'hidden' : ''}">${activeUser.iniciales}</div>
                    
                    <div class="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 backdrop-blur-[2px]">
                        <span class="material-symbols-rounded text-white mb-1">photo_camera</span>
                        <span class="text-[8px] text-white font-bold tracking-widest uppercase">CAMBIAR</span>
                    </div>

                    <div class="absolute bottom-0 right-0 bg-indigo-600 text-white rounded-full p-1.5 border-2 border-white dark:border-slate-800 shadow-sm group-hover:scale-110 transition-transform">
                        <span class="material-symbols-rounded text-[14px] block">edit</span>
                    </div>
                </div>

                <p class="text-[10px] text-slate-400 font-medium cursor-pointer hover:text-indigo-500 transition-colors" onclick="document.getElementById('mi-avatar-input').click()">Clic para cambiar foto</p>

                <h3 class="text-lg font-bold text-slate-800 dark:text-white mt-3">${activeUser.nombre}</h3>
                <p class="text-xs text-teal-500 font-bold uppercase">${activeUser.rol}</p>
                <input type="file" id="mi-avatar-input" accept="image/*" class="hidden" onchange="previewMiAvatar(event)">
            </div>

            <div class="space-y-4">
                <div>
                    <label class="block text-[10px] font-extrabold text-slate-400 mb-1 uppercase">Correo (No editable)</label>
                    <input type="text" value="${activeUser.email}" disabled class="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-500">
                </div>
                
                ${esAdmin ? `
                <div>
                    <label class="block text-[10px] font-extrabold text-slate-400 mb-1 uppercase">Mi PIN de Seguridad</label>
                    <input type="text" id="mi-pin-input" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Nuevo PIN" maxlength="4">
                </div>` : ''}
            </div>

            <button onclick="guardarMiPerfil()" class="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2">
                <span class="material-symbols-rounded">save</span> Guardar Cambios
            </button>
        </div>
    </div>

    <div id="security-modal" class="fixed inset-0 z-[100] hidden bg-[#0b1121]/90 backdrop-blur-md flex items-center justify-center p-4">
        <div class="bg-white dark:bg-[#1e293b] w-full max-w-xs rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-700 text-center relative modal-scale">
            <div class="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600 dark:text-indigo-400"><span class="material-symbols-rounded text-3xl">lock</span></div>
            <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-1">Acceso Restringido</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mb-6">Ingresa tu PIN de seguridad.</p>
            <div class="flex justify-center gap-2 mb-6"><input type="password" id="pin-input" maxlength="4" class="w-32 text-center text-3xl font-bold tracking-[0.5em] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl py-2 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="••••"></div>
            <button onclick="validarPin()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg transition-transform active:scale-95">Desbloquear</button>
            <button onclick="cerrarModalPin()" class="mt-4 text-xs text-slate-400 hover:text-white font-bold">Cancelar</button>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('afterbegin', layoutHTML);

    window.toggleSidebar = () => { document.getElementById('app-sidebar').classList.toggle('open'); document.getElementById('sidebar-overlay').classList.toggle('active'); };
    
    // --- LÓGICA DE PIN ---
    window.solicitarPin = (e) => { 
        e.preventDefault(); 
        if (sessionStorage.getItem('admin_unlocked') === 'true') { window.location.href = 'admin.html'; return; } 
        document.getElementById('security-modal').classList.remove('hidden'); 
        setTimeout(() => document.getElementById('pin-input').focus(), 100); 
    };
    window.cerrarModalPin = () => { document.getElementById('security-modal').classList.add('hidden'); document.getElementById('pin-input').value = ''; };
    window.validarPin = () => { 
        const pin = document.getElementById('pin-input').value;
        if (pin === "1077") { // Idealmente esto también debería validarse contra backend, pero para MVP está bien
            sessionStorage.setItem('admin_unlocked', 'true');
            window.location.href = 'admin.html'; 
        } else { 
            const input = document.getElementById('pin-input');
            input.value = ''; input.classList.add('shake'); setTimeout(() => input.classList.remove('shake'), 500); 
        } 
    };

    window.cerrarSesion = () => { 
        if(confirm("¿Cerrar sesión?")) { 
            sessionStorage.clear(); 
            document.cookie = "leezar_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            window.location.href = 'index.html'; 
        } 
    };

    // --- LÓGICA DE "MI PERFIL" ---
    let nuevaFotoBase64 = null;

    window.abrirMiPerfil = () => { document.getElementById('modal-mi-perfil').classList.remove('hidden'); };
    window.cerrarMiPerfil = () => { document.getElementById('modal-mi-perfil').classList.add('hidden'); nuevaFotoBase64 = null; };

    window.previewMiAvatar = (e) => {
        const file = e.target.files[0];
        if(!file) return;
        if(file.size > 1024*1024) { alert("Máximo 1MB"); return; }
        
        const reader = new FileReader();
        reader.onload = (ev) => {
            nuevaFotoBase64 = ev.target.result;
            const img = document.getElementById('mi-avatar-preview');
            img.src = nuevaFotoBase64;
            img.classList.remove('hidden');
            document.getElementById('mi-avatar-fallback').classList.add('hidden');
        };
        reader.readAsDataURL(file);
    };

    window.guardarMiPerfil = async () => {
        const btn = document.querySelector('#modal-mi-perfil button');
        const txt = btn.innerHTML;
        btn.innerHTML = 'Guardando...'; btn.disabled = true;

        const updateData = {
            email: activeUser.email,
            nombre: activeUser.nombre, // Necesario enviarlo aunque no cambie para validación
            rol: activeUser.rol,       // Igual
            // Campos opcionales que sí cambian:
            ...(nuevaFotoBase64 && { fotoUrl: nuevaFotoBase64 }),
            ...(esAdmin && document.getElementById('mi-pin-input')?.value && { pin: document.getElementById('mi-pin-input').value })
        };

        try {
            const res = await fetch('/.netlify/functions/manage-users', {
                method: 'POST',
                body: JSON.stringify(updateData)
            });

            if(res.ok) {
                // ACTUALIZAR SESIÓN LOCAL INMEDIATAMENTE
                if(nuevaFotoBase64) sessionStorage.setItem('leezar_user_photo', nuevaFotoBase64);
                alert("Perfil actualizado. Los cambios se verán reflejados.");
                window.location.reload(); // Recargar para ver foto nueva en sidebar
            } else {
                alert("Error al guardar perfil.");
            }
        } catch(e) {
            console.error(e);
            alert("Error de conexión.");
        }
        btn.innerHTML = txt; btn.disabled = false;
    };

    const pinInput = document.getElementById('pin-input'); if(pinInput) pinInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') window.validarPin(); });

    const main = document.querySelector('main');
    if (main) { const originalContent = main.innerHTML; main.innerHTML = `<div class="flex-1 h-full overflow-y-auto p-6 fade-in w-full">${originalContent}</div>`; main.className = "flex-1 flex flex-col h-full relative overflow-hidden bg-gray-50 dark:bg-[#0f172a] transition-colors duration-300"; }
});