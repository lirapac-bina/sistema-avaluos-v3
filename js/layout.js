document.addEventListener("DOMContentLoaded", () => {
    // =================================================================
    // 1. GESTIÓN DE SESIÓN UNIFICADA
    // =================================================================
    // Usamos sessionStorage para que la sesión muera al cerrar la pestaña (Más seguro)
    const SESSION_KEY = 'leezar_session_active'; 
    
    // A. CAPTURA DE SESIÓN DESDE URL (Cuando regresas de Google/Auth-finish)
    const params = new URLSearchParams(window.location.search);
    if (params.has('email') && params.has('role')) {
        const newUser = {
            email: params.get('email'),
            nombre: params.get('name') || 'Usuario',
            rol: params.get('role').toUpperCase(),
            photo: params.get('photo') || '',
            iniciales: (params.get('name') || 'U').substring(0, 2).toUpperCase(),
            // Guardamos el timestamp para forzar re-login si pasa mucho tiempo (opcional)
            loginTime: Date.now()
        };
        
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(newUser));
        
        // Limpiar URL para seguridad visual
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // B. LECTURA DE SESIÓN ACTUAL
    let activeUser = null;
    try {
        const stored = sessionStorage.getItem(SESSION_KEY);
        if (stored) activeUser = JSON.parse(stored);
    } catch (e) {
        console.error("Error leyendo sesión:", e);
        sessionStorage.removeItem(SESSION_KEY);
    }

    // C. SEGURIDAD DE RUTAS (ROUTER GUARD)
    const path = window.location.pathname;
    const file = path.split('/').pop() || 'index.html';
    
    // Páginas que NO requieren login
    const publicPages = ['index.html', 'login.html', 'portal.html'];
    
    // 1. SI NO HAY USUARIO y estás en página privada -> SACAR
    if (!activeUser && !publicPages.includes(file)) {
        console.warn("Acceso no autorizado. Redirigiendo a Login.");
        window.location.href = 'index.html?error=auth_required';
        return; // Detener ejecución
    }

    // 2. SI HAY USUARIO y estás en Login -> METER AL DASHBOARD
    if (activeUser && (file === 'index.html' || file === 'login.html')) {
        window.location.href = 'dashboard.html';
        return; // Detener ejecución
    }

    // 3. PROTECCIÓN DE ADMIN (Solo roles altos)
    if (activeUser && (file.includes('admin') || file.includes('sembrar'))) {
        const rolesAdmin = ['ADMIN', 'SUPER ADMIN', 'DIRECTOR', 'SUPER_ADMIN'];
        if (!rolesAdmin.includes(activeUser.rol)) {
            alert("⛔ ACCESO DENEGADO: Se requieren permisos de Administrador.");
            window.location.href = 'dashboard.html';
            return;
        }
    }

    // Si no hay usuario (y es página pública), no pintamos sidebar ni nada.
    if (!activeUser) return;

    // =================================================================
    // 2. RENDERIZADO DEL LAYOUT (UI)
    // =================================================================
    
    // Inyectar recursos globales (Fuentes e Iconos)
    if (!document.getElementById('layout-resources')) {
        const head = document.head;
        const fontLink = document.createElement('link'); 
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'; 
        fontLink.rel = 'stylesheet'; 
        head.appendChild(fontLink);
        
        const iconLink = document.createElement('link'); 
        iconLink.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20,400,1,0'; 
        iconLink.rel = 'stylesheet'; 
        head.appendChild(iconLink);
        
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
            #sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 45; }
            .nav-item:hover { background-color: #f1f5f9; color: #0d9488; }
            .nav-item.active { background: linear-gradient(90deg, rgba(20, 184, 166, 0.1) 0%, transparent 100%); border-right: 2px solid #14b8a6; color: #0f766e; }
            .dark { color-scheme: dark; }
            .dark .nav-item:hover { background-color: #1e293b; color: #2dd4bf; }
            .modal-scale { animation: scaleIn 0.2s ease-out forwards; }
            @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            .fade-in { animation: fadeIn 0.3s ease-out forwards; }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `;
        head.appendChild(style);
    }

    // Modo Oscuro (Persistimos tema en localStorage porque es preferencia de UI, no dato sensible)
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }

    // Helper Avatar
    const getAvatarHTML = (u) => u.photo 
        ? `<img src="${u.photo}" id="sidebar-user-img" class="w-9 h-9 rounded-full shadow-md object-cover border border-slate-200 dark:border-slate-600">`
        : `<div id="sidebar-user-initials" class="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold shadow-md text-xs">${u.iniciales}</div>`;

    // Menú Admin
    const esAdmin = ['ADMIN', 'SUPER ADMIN', 'DIRECTOR'].includes(activeUser.rol);
    const menuAdminHTML = esAdmin ? `
        <div class="pt-4 mt-4 border-t border-slate-100 dark:border-slate-700/50">
            <p class="px-4 text-[10px] font-extrabold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-1">Admin <span class="material-symbols-rounded text-[12px]">lock</span></p>
            <a href="admin.html" class="nav-item w-full flex items-center px-4 py-2.5 text-slate-600 dark:text-slate-400 font-medium text-sm rounded-lg group hover:text-indigo-600 dark:hover:text-white transition-all ${file.includes('admin') ? 'active' : ''}">
                <span class="material-symbols-rounded mr-3 text-[20px] text-indigo-400 group-hover:text-indigo-600 dark:group-hover:text-white">settings_suggest</span>Configuración
            </a>
        </div>
    ` : '';

    // HTML Sidebar
    const layoutHTML = `
    <div id="sidebar-overlay" onclick="toggleSidebar()"></div>
    
    <div id="mobile-header" class="bg-white/90 border-b border-slate-200 dark:bg-[#0b1121]/90 dark:border-slate-800 transition-colors">
        <div class="flex items-center gap-3">
            <button onclick="toggleSidebar()" class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><span class="material-symbols-rounded text-2xl text-slate-700 dark:text-white">menu</span></button>
            <span class="font-extrabold text-lg text-slate-800 dark:text-white tracking-tight">LEEZAR</span>
        </div>
        <div onclick="abrirMiPerfil()">${getAvatarHTML(activeUser)}</div>
    </div>

    <aside id="app-sidebar" class="bg-white border-r border-gray-200 dark:bg-[#0b1121] dark:border-slate-800 flex flex-col transition-colors duration-300">
        <div class="h-20 flex items-center px-6 shrink-0 md:flex hidden">
            <div class="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center mr-3 shadow-lg shadow-teal-500/30">
                <span class="material-symbols-rounded text-white text-xl">apartment</span>
            </div>
            <h1 class="text-xl font-extrabold tracking-tight text-slate-800 dark:text-white">LEEZAR <span class="text-teal-500">.</span></h1>
        </div>
        
        <div class="h-16 md:hidden"></div>

        <div class="flex-1 overflow-y-auto px-3 space-y-6 py-6 custom-scroll">
            <div>
                <p class="px-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2">Operaciones</p>
                <ul class="space-y-1">
                    <li><a href="dashboard.html" class="nav-item w-full flex items-center px-4 py-2.5 text-slate-600 dark:text-slate-400 font-medium text-sm rounded-lg transition-all ${file.includes('dashboard') ? 'active' : ''}"><span class="material-symbols-rounded mr-3 text-[20px]">dashboard</span>Dashboard</a></li>
                    <li><a href="gestion.html" class="nav-item w-full flex items-center px-4 py-2.5 text-slate-600 dark:text-slate-400 font-medium text-sm rounded-lg transition-all ${file.includes('gestion') ? 'active' : ''}"><span class="material-symbols-rounded mr-3 text-[20px]">folder_shared</span>Expedientes</a></li>
                    <li><a href="revision.html" class="nav-item w-full flex items-center px-4 py-2.5 text-slate-600 dark:text-slate-400 font-medium text-sm rounded-lg transition-all ${file.includes('revision') ? 'active' : ''}"><span class="material-symbols-rounded mr-3 text-[20px]">fact_check</span>Mesa de Control</a></li>
                </ul>
            </div>
            
            <div>
                <p class="px-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2">Técnico</p>
                <ul class="space-y-1">
                    <li><a href="hoja_trabajo.html" class="nav-item w-full flex items-center px-4 py-2.5 text-slate-600 dark:text-slate-400 font-medium text-sm rounded-lg transition-all ${file.includes('operacion') ? 'active' : ''}"><span class="material-symbols-rounded mr-3 text-[20px]">architecture</span>Hoja de Trabajo</a></li>
                </ul>
            </div>
            ${menuAdminHTML}
        </div>
        
        <div class="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#0b1121] space-y-3">
            <button onclick="toggleTheme()" class="w-full bg-white dark:bg-slate-800 p-2.5 rounded-xl flex justify-between items-center text-xs font-bold text-slate-600 dark:text-slate-300 shadow-sm border border-slate-200 dark:border-slate-700 hover:border-teal-500 transition-colors">
                <span>Modo Oscuro</span> 
                <span class="material-symbols-rounded text-lg">${document.documentElement.classList.contains('dark') ? 'dark_mode' : 'light_mode'}</span>
            </button>
            
            <div class="flex items-center gap-3 cursor-pointer p-2.5 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 group" onclick="abrirMiPerfil()">
                ${getAvatarHTML(activeUser)}
                <div class="flex-1 overflow-hidden">
                    <p class="text-xs font-bold text-slate-800 dark:text-white truncate group-hover:text-teal-600 transition-colors">${activeUser.nombre}</p>
                    <p class="text-[9px] text-teal-600 dark:text-teal-400 font-bold truncate uppercase">${activeUser.rol}</p>
                </div>
                <span class="material-symbols-rounded text-slate-400 text-lg group-hover:text-teal-500">settings</span>
            </div>
            
            <button onclick="cerrarSesion()" class="w-full text-center text-[10px] text-red-400 hover:text-red-600 font-bold mt-1 transition-colors py-1">CERRAR SESIÓN</button>
        </div>
    </aside>

    <div id="modal-mi-perfil" class="fixed inset-0 z-[100] hidden bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white dark:bg-[#1e293b] w-full max-w-sm rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-700 modal-scale relative">
            <button onclick="cerrarMiPerfil()" class="absolute top-4 right-4 text-slate-400 hover:text-rose-500 transition-colors"><span class="material-symbols-rounded">close</span></button>
            
            <div class="text-center mb-6">
                <div class="relative w-24 h-24 mx-auto mb-3 group cursor-pointer" onclick="document.getElementById('mi-avatar-input').click()">
                    <img id="mi-avatar-preview" src="${activeUser.photo || ''}" class="w-full h-full rounded-full object-cover border-4 border-slate-100 dark:border-slate-700 shadow-lg ${!activeUser.photo ? 'hidden' : ''}">
                    <div id="mi-avatar-fallback" class="w-full h-full rounded-full bg-teal-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg ${activeUser.photo ? 'hidden' : ''}">${activeUser.iniciales}</div>
                    
                    <div class="absolute inset-0 bg-black/50 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-[2px]">
                        <span class="material-symbols-rounded text-white mb-1">photo_camera</span>
                        <span class="text-[8px] text-white font-bold tracking-widest uppercase">CAMBIAR</span>
                    </div>
                </div>
                <h3 class="text-lg font-bold text-slate-800 dark:text-white">${activeUser.nombre}</h3>
                <p class="text-xs text-teal-500 font-bold uppercase tracking-wide">${activeUser.rol}</p>
                <input type="file" id="mi-avatar-input" accept="image/*" class="hidden" onchange="previewMiAvatar(event)">
            </div>

            <div class="space-y-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                <div>
                    <label class="block text-[10px] font-extrabold text-slate-400 mb-1 uppercase">Correo Registrado</label>
                    <div class="flex items-center gap-2 text-sm font-mono font-bold text-slate-600 dark:text-slate-300 break-all">
                        <span class="material-symbols-rounded text-slate-400 text-base">mail</span> ${activeUser.email}
                    </div>
                </div>
            </div>

            <button onclick="guardarMiPerfil()" id="btn-save-profile" class="w-full mt-6 bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-teal-500/30 transition-all active:scale-95 flex items-center justify-center gap-2">
                <span class="material-symbols-rounded">save</span> Guardar Cambios
            </button>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('afterbegin', layoutHTML);

    // =================================================================
    // 3. FUNCIONES GLOBALES DE INTERFAZ
    // =================================================================
    
    window.toggleSidebar = () => { 
        document.getElementById('app-sidebar').classList.toggle('open'); 
        document.getElementById('sidebar-overlay').classList.toggle('active'); 
    };

    window.toggleTheme = () => {
        document.documentElement.classList.toggle('dark');
        localStorage.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    };

    window.cerrarSesion = () => { 
        if(confirm("¿Estás seguro que deseas salir?")) { 
            sessionStorage.removeItem(SESSION_KEY);
            document.cookie = "leezar_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            window.location.href = 'index.html'; 
        } 
    };

    // --- MI PERFIL ---
    let nuevaFotoBase64 = null;
    window.abrirMiPerfil = () => document.getElementById('modal-mi-perfil').classList.remove('hidden');
    window.cerrarMiPerfil = () => { document.getElementById('modal-mi-perfil').classList.add('hidden'); nuevaFotoBase64 = null; };
    
    window.previewMiAvatar = (e) => {
        const file = e.target.files[0];
        if(!file) return;
        if(file.size > 1024*1024) { alert("La imagen debe pesar menos de 1MB"); return; }
        
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
        const btn = document.getElementById('btn-save-profile');
        const originalText = btn.innerHTML;
        
        if (!nuevaFotoBase64) {
            alert("No has realizado cambios.");
            cerrarMiPerfil();
            return;
        }

        btn.innerHTML = `<span class="material-symbols-rounded animate-spin">sync</span> Guardando...`;
        btn.disabled = true;

        try {
            const res = await fetch('/.netlify/functions/manage-users', {
                method: 'POST',
                body: JSON.stringify({
                    email: activeUser.email,
                    nombre: activeUser.nombre,
                    rol: activeUser.rol,
                    fotoUrl: nuevaFotoBase64
                })
            });

            if(res.ok) {
                // Actualizar Session Storage
                activeUser.photo = nuevaFotoBase64;
                sessionStorage.setItem(SESSION_KEY, JSON.stringify(activeUser));
                alert("Perfil actualizado correctamente.");
                window.location.reload(); 
            } else {
                alert("Error al guardar en el servidor.");
            }
        } catch(e) {
            console.error(e);
            alert("Error de conexión.");
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    // Inyección de contenedor principal
    const main = document.querySelector('main');
    if (main) {
        const originalContent = main.innerHTML;
        main.innerHTML = `<div class="flex-1 h-full overflow-y-auto p-4 md:p-8 fade-in w-full custom-scroll">${originalContent}</div>`;
        main.className = "flex-1 flex flex-col h-full relative overflow-hidden bg-slate-50 dark:bg-[#0f172a] transition-colors duration-300";
    }
});