document.addEventListener("DOMContentLoaded", () => {
    // =================================================================
    // 0. MEMORIA DEL MENÚ CONTRAÍDO
    // =================================================================
    const isSidebarCollapsed = localStorage.getItem('sidebar_state') === 'collapsed';
    if (isSidebarCollapsed) document.body.classList.add('sidebar-collapsed');

    // =================================================================
    // 1. GESTIÓN DE SESIÓN Y AUTO-SANIDAD
    // =================================================================
    const SESSION_KEY = 'leezar_user_active';
    
    // A. CAPTURA DE SESIÓN DESDE URL
    const params = new URLSearchParams(window.location.search);
    if (params.has('email') && params.has('role')) {
        const emailIngreso = params.get('email');
        const newUser = {
            email: emailIngreso,
            nombre: params.get('name') || 'Usuario',
            rol: params.get('role').toUpperCase(),
            photo: params.get('photo') || '',
            iniciales: (params.get('name') || 'U').substring(0, 2).toUpperCase(),
            loginTime: Date.now()
        };
        
        localStorage.setItem(SESSION_KEY, JSON.stringify(newUser));
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // B. LECTURA DE SESIÓN ACTUAL
    let activeUser = null;
    try {
        const stored = localStorage.getItem(SESSION_KEY);
        if (stored) activeUser = JSON.parse(stored);
    } catch (e) {
        localStorage.removeItem(SESSION_KEY);
    }

    // 🔥 C. AUTO-SANADOR SILENCIOSO
    if (activeUser) {
        fetch('/.netlify/functions/get-users')
            .then(res => res.json())
            .then(users => {
                const dbUser = users.find(u => u.email === activeUser.email);
                if (dbUser) {
                    const currentAcc = JSON.stringify(activeUser.accesos || "null");
                    const dbAcc = JSON.stringify(dbUser.accesos || "null");
                    
                    const dbPhoto = dbUser.fotoUrl || dbUser.photoUrl;
                    const currPhoto = activeUser.photoUrl || activeUser.fotoUrl || activeUser.photo;
                    
                    if (currentAcc !== dbAcc || activeUser.rol !== dbUser.rol || (dbPhoto && dbPhoto !== currPhoto)) {
                        activeUser.accesos = dbUser.accesos; 
                        activeUser.rol = dbUser.rol;
                        activeUser.funciones = dbUser.funciones || [];
                        
                        if (dbPhoto) activeUser.photo = dbPhoto; 
                        
                        localStorage.setItem(SESSION_KEY, JSON.stringify(activeUser));
                        window.location.reload(); 
                    }
                }
            })
            .catch(err => console.error("Error validando sesión:", err));
    }

    // 🔥 D. SEGURIDAD DE RUTAS SILENCIOSA
    const path = window.location.pathname;
    const file = path.split('/').pop() || 'index.html';
    const publicPages = ['index.html', 'login.html', 'portal.html'];
    
    if (!activeUser && !publicPages.includes(file)) {
        window.location.replace('index.html?error=auth_required');
        return; 
    }

    const esAltoMando = activeUser && ['ADMIN', 'SUPER ADMIN', 'DIRECTOR', 'SUPER_ADMIN'].includes(activeUser.rol);
    let accesosRuta = activeUser && activeUser.accesos ? activeUser.accesos : null;
    
    if (!accesosRuta || esAltoMando) accesosRuta = ['dashboard', 'gestion', 'revision', 'hoja_trabajo', 'visitas_dibujo'];

    const esOperativo = activeUser && ['CAPTURISTA', 'TECNICO', 'VISITADOR', 'DIBUJANTE'].includes(activeUser.rol);
    if (esOperativo) {
        accesosRuta = accesosRuta.filter(item => item !== 'dashboard');
    }

    if (activeUser && accesosRuta.length > 0) {
        const routeMap = { 'dashboard': 'dashboard.html', 'gestion': 'gestion.html', 'revision': 'revision.html', 'hoja_trabajo': 'hoja_trabajo.html', 'visitas_dibujo': 'visitas_dibujo.html' };
        
        const isBlocked = !esAltoMando && (
            (file.includes('dashboard') && !accesosRuta.includes('dashboard')) ||
            (file.includes('gestion') && !accesosRuta.includes('gestion')) ||
            (file.includes('revision') && !accesosRuta.includes('revision')) ||
            (file.includes('hoja_trabajo') && !accesosRuta.includes('hoja_trabajo') && !file.includes('operacion'))
        );

        if (isBlocked || file === 'index.html' || file === 'login.html' || file === '') {
             window.location.replace(routeMap[accesosRuta[0]]);
             return;
        }
    } else if (activeUser && accesosRuta.length === 0 && !publicPages.includes(file)) {
        document.body.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#0f172a; color:white; font-family:sans-serif;">
                <span style="font-size:4rem; margin-bottom:1rem;">⛔</span>
                <h2>Acceso Restringido</h2>
                <p style="color:#94a3b8; font-size:0.9rem; margin-bottom:2rem;">Tu cuenta no tiene permisos asignados.</p>
                <button onclick="localStorage.removeItem('${SESSION_KEY}'); window.location.href='index.html'" style="padding:10px 20px; background:#ef4444; color:white; border:none; border-radius:8px; cursor:pointer;">Cerrar Sesión</button>
            </div>`;
        return;
    }

    if (activeUser && (file.includes('admin') || file.includes('sembrar'))) {
        if (!esAltoMando) {
            alert("⛔ ACCESO DENEGADO: Se requieren permisos de Administrador.");
            window.location.replace('dashboard.html');
            return;
        }
    }

    if (!activeUser) return;

    // =================================================================
    // 2. RENDERIZADO DEL LAYOUT (UI)
    // =================================================================
    
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
            #app-sidebar { width: 16rem; position: fixed; top: 0; left: 0; height: 100vh; z-index: 50; transition: width 0.3s ease-in-out, transform 0.3s ease-in-out; overflow-x: hidden; }
            main { margin-left: 16rem; width: calc(100% - 16rem); flex: 1; display: flex; flex-direction: column; min-height: 100vh; transition: margin-left 0.3s ease-in-out, width 0.3s ease-in-out; }
            
            /* --- MODO CONTRAÍDO (DESKTOP) --- */
            @media (min-width: 769px) {
                body.sidebar-collapsed #app-sidebar { width: 5rem; }
                body.sidebar-collapsed main { margin-left: 5rem; width: calc(100% - 5rem); }
                body.sidebar-collapsed .sidebar-text { display: none; }
                body.sidebar-collapsed .sidebar-header { justify-content: center; flex-direction: column; padding-top: 1.2rem; height: auto; gap: 1rem; }
                body.sidebar-collapsed .sidebar-logo-text { display: none; }
                body.sidebar-collapsed .nav-item { justify-content: center; padding-left: 0; padding-right: 0; }
                body.sidebar-collapsed .nav-item .material-symbols-rounded { margin-right: 0; font-size: 1.5rem; }
                body.sidebar-collapsed .sidebar-section-title { font-size: 0; height: 2px; background: #e2e8f0; margin: 1.5rem 1rem 1rem 1rem; padding: 0; border: none; color: transparent; }
                .dark body.sidebar-collapsed .sidebar-section-title { background: #334155; }
                body.sidebar-collapsed .theme-toggle-btn { justify-content: center; }
                body.sidebar-collapsed .profile-container { justify-content: center; padding: 0.5rem; }
                body.sidebar-collapsed .profile-info { display: none; }
                body.sidebar-collapsed .profile-settings-icon { display: none; }
                body.sidebar-collapsed #sidebar-toggle-btn { margin: 0 auto; transform: rotate(180deg); }
            }

            /* --- MODO MOBILE --- */
            #mobile-header { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 60px; z-index: 40; align-items: center; justify-content: space-between; padding: 0 1rem; backdrop-filter: blur(10px); }
            @media (max-width: 768px) { 
                #app-sidebar { width: 16rem !important; transform: translateX(-100%); box-shadow: none; }
                #app-sidebar.open { transform: translateX(0); box-shadow: 5px 0 15px rgba(0,0,0,0.3); }
                main { margin-left: 0 !important; width: 100% !important; padding-top: 60px; }
                #mobile-header { display: flex; }
                #sidebar-overlay.active { display: block; }
                #sidebar-toggle-btn { display: none; } /* Ocultar botón de contraer en móvil */
            }
            #sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 45; }
            .dark { color-scheme: dark; }
            .modal-scale { animation: scaleIn 0.2s ease-out forwards; }
            @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            .fade-in { animation: fadeIn 0.3s ease-out forwards; }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `;
        head.appendChild(style);
    }

    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }

    const fotoSrc = activeUser.photo || activeUser.photoUrl || activeUser.fotoUrl || '';
    
    const avatarHTML = fotoSrc 
        ? `<img src="${fotoSrc}" alt="Perfil" class="w-10 h-10 rounded-full object-cover border-2 border-leezar-500 shadow-sm shrink-0">` 
        : `<div class="w-10 h-10 rounded-full bg-leezar-600 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">${activeUser.iniciales || 'U'}</div>`;

    const menuAdminHTML = esAltoMando ? `
        <div class="pt-4 mt-4 border-t border-slate-100 dark:border-slate-700/50">
            <p class="px-4 text-[10px] font-extrabold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-1 sidebar-section-title"><span class="sidebar-text">Admin</span> <span class="material-symbols-rounded text-[12px] sidebar-text">shield_person</span></p>
            <a href="admin.html" title="Configuración" class="w-full flex items-center px-4 py-2.5 font-medium text-sm rounded-lg group transition-all ${file.includes('admin') ? 'bg-gradient-to-r from-indigo-500/10 to-transparent border-r-2 border-indigo-500 text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400'}">
                <span class="material-symbols-rounded mr-3 text-[20px] transition-all ${file.includes('admin') ? 'text-indigo-600 dark:text-indigo-400' : 'group-hover:text-indigo-600 dark:group-hover:text-indigo-400'}">settings_suggest</span>
                <span class="sidebar-text">Configuración</span>
            </a>
        </div>
    ` : '';

    let menuOperacionesHTML = '';
    const opBase = "w-full flex items-center px-4 py-2.5 font-medium text-sm rounded-lg group transition-all";
    const opHover = "text-slate-600 dark:text-slate-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:text-teal-600 dark:hover:text-teal-400";
    const opActive = "bg-gradient-to-r from-teal-500/10 to-transparent border-r-2 border-teal-500 text-teal-700 dark:text-teal-400";

    if(accesosRuta.includes('dashboard')) menuOperacionesHTML += `<li><a href="dashboard.html" title="Tablero de Trabajo" class="${opBase} ${file.includes('dashboard') ? opActive : opHover}"><span class="material-symbols-rounded mr-3 text-[20px] transition-all ${file.includes('dashboard') ? 'text-teal-600 dark:text-teal-400' : 'group-hover:text-teal-600 dark:group-hover:text-teal-400'}">dashboard</span><span class="sidebar-text">Tablero de Trabajo</span></a></li>`;
    if(accesosRuta.includes('gestion')) menuOperacionesHTML += `<li><a href="gestion.html" title="Gestión de Expedientes" class="${opBase} ${file.includes('gestion') ? opActive : opHover}"><span class="material-symbols-rounded mr-3 text-[20px] transition-all ${file.includes('gestion') ? 'text-teal-600 dark:text-teal-400' : 'group-hover:text-teal-600 dark:group-hover:text-teal-400'}">folder_shared</span><span class="sidebar-text">Expedientes</span></a></li>`;
    if(accesosRuta.includes('revision')) menuOperacionesHTML += `<li><a href="revision.html" title="Mesa de Control" class="${opBase} ${file.includes('revision') ? opActive : opHover}"><span class="material-symbols-rounded mr-3 text-[20px] transition-all ${file.includes('revision') ? 'text-teal-600 dark:text-teal-400' : 'group-hover:text-teal-600 dark:group-hover:text-teal-400'}">fact_check</span><span class="sidebar-text">Mesa de Control</span></a></li>`;

    let menuTecnicoHTML = '';
    const tecBase = "w-full flex items-center px-4 py-2.5 font-medium text-sm rounded-lg group transition-all";
    const tecHover = "text-slate-600 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600 dark:hover:text-rose-400";
    const tecActive = "bg-gradient-to-r from-rose-500/10 to-transparent border-r-2 border-rose-500 text-rose-700 dark:text-rose-400";

    if(accesosRuta.includes('hoja_trabajo')) menuTecnicoHTML += `<li><a href="hoja_trabajo.html" title="Hoja de Trabajo" class="${tecBase} ${file.includes('hoja_trabajo') || file.includes('operacion') ? tecActive : tecHover}"><span class="material-symbols-rounded mr-3 text-[20px] transition-all ${file.includes('hoja_trabajo') || file.includes('operacion') ? 'text-rose-600 dark:text-rose-400' : 'group-hover:text-rose-600 dark:group-hover:text-rose-400'}">architecture</span><span class="sidebar-text">Hoja de Trabajo</span></a></li>`;
    if (['VISITADOR', 'DIBUJANTE', 'CAPTURISTA', 'TECNICO', 'ADMIN', 'SUPER ADMIN', 'GESTOR'].includes(activeUser.rol)) {
        menuTecnicoHTML += `<li><a href="visitas_dibujo.html" title="Visitas y Dibujo" class="${tecBase} ${file.includes('visitas_dibujo') ? tecActive : tecHover}"><span class="material-symbols-rounded mr-3 text-[20px] transition-all ${file.includes('visitas_dibujo') ? 'text-rose-600 dark:text-rose-400' : 'group-hover:text-rose-600 dark:group-hover:text-rose-400'}">explore</span><span class="sidebar-text">Visitas y Dibujo</span></a></li>`;
    }

    const renderOperaciones = menuOperacionesHTML ? `<div><p class="px-4 text-[10px] font-extrabold text-teal-500 dark:text-teal-400 uppercase tracking-widest mb-2 flex items-center gap-1 sidebar-section-title"><span class="sidebar-text">Operaciones</span> <span class="material-symbols-rounded text-[12px] sidebar-text">monitoring</span></p><ul class="space-y-1">${menuOperacionesHTML}</ul></div>` : '';
    const renderTecnico = menuTecnicoHTML ? `<div class="mt-6"><p class="px-4 text-[10px] font-extrabold text-rose-500 dark:text-rose-400 uppercase tracking-widest mb-2 flex items-center gap-1 sidebar-section-title"><span class="sidebar-text">Técnico</span> <span class="material-symbols-rounded text-[12px] sidebar-text">build</span></p><ul class="space-y-1">${menuTecnicoHTML}</ul></div>` : '';

    const iconToggleStr = isSidebarCollapsed ? 'menu' : 'menu_open';

    const layoutHTML = `
    <div id="sidebar-overlay" onclick="toggleSidebar()"></div>
    
    <div id="mobile-header" class="bg-white/90 border-b border-slate-200 dark:bg-[#0b1121]/90 dark:border-slate-800 transition-colors">
        <div class="flex items-center gap-3">
            <button onclick="toggleSidebar()" class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><span class="material-symbols-rounded text-2xl text-slate-700 dark:text-white">menu</span></button>
            <span class="font-extrabold text-lg text-slate-800 dark:text-white tracking-tight">SISTEMA AVALÚOS</span>
        </div>
        <div onclick="abrirMiPerfil()" class="cursor-pointer">${avatarHTML}</div>
    </div>

    <aside id="app-sidebar" class="bg-white border-r border-gray-200 dark:bg-[#0b1121] dark:border-slate-800 flex flex-col transition-all duration-300">
        
        <div class="h-20 flex items-center px-4 shrink-0 md:flex hidden justify-between sidebar-header">
            <div class="flex items-center">
                <div class="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center shadow-lg shadow-teal-500/30 shrink-0">
                    <span class="material-symbols-rounded text-white text-xl">apartment</span>
                </div>
                <h1 class="text-xl font-extrabold tracking-tight text-slate-800 dark:text-white ml-3 sidebar-logo-text">SISTEMA <span class="text-teal-500">AVALÚOS</span></h1>
            </div>
            
            <button id="sidebar-toggle-btn" onclick="toggleDesktopSidebar()" class="text-slate-400 hover:text-teal-600 transition-all p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="Contraer/Expandir menú">
                <span class="material-symbols-rounded transition-transform" id="sidebar-toggle-icon">${iconToggleStr}</span>
            </button>
        </div>
        
        <div class="h-16 md:hidden"></div>

        <div class="flex-1 overflow-y-auto px-3 py-6 custom-scroll">
            ${renderOperaciones}
            ${renderTecnico}
            ${menuAdminHTML}
        </div>
        
        <div class="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#0b1121] space-y-3 flex flex-col items-center">
            <button onclick="toggleTheme()" class="w-full bg-white dark:bg-slate-800 p-2.5 rounded-xl flex justify-between items-center text-xs font-bold text-slate-600 dark:text-slate-300 shadow-sm border border-slate-200 dark:border-slate-700 hover:border-teal-500 transition-colors theme-toggle-btn" title="Modo Oscuro / Claro">
                <span class="sidebar-text">Modo Oscuro</span> 
                <span class="material-symbols-rounded text-lg">${document.documentElement.classList.contains('dark') ? 'dark_mode' : 'light_mode'}</span>
            </button>
            
            <button onclick="limpiarCachéProfunda()" class="w-full bg-white dark:bg-slate-800 p-2.5 rounded-xl flex justify-between items-center text-xs font-bold text-slate-600 dark:text-slate-300 shadow-sm border border-slate-200 dark:border-slate-700 hover:border-teal-500 transition-colors theme-toggle-btn group" title="Limpiar Caché y Refrescar Scripts">
                <span class="sidebar-text">Limpiar Caché</span> 
                <span class="material-symbols-rounded text-lg text-teal-600 dark:text-teal-400 group-hover:rotate-12 transition-transform">mop</span>
            </button>
            
            <div class="w-full flex items-center gap-3 cursor-pointer p-2.5 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 group profile-container" onclick="abrirMiPerfil()" title="Configuración de Mi Perfil">
                ${avatarHTML}
                <div class="flex-1 overflow-hidden profile-info">
                    <p class="text-xs font-bold text-slate-800 dark:text-white truncate group-hover:text-teal-600 transition-colors">${activeUser.nombre}</p>
                    <p class="text-[9px] text-teal-600 dark:text-teal-400 font-bold truncate uppercase">${activeUser.rol}</p>
                </div>
                <span class="material-symbols-rounded text-slate-400 text-lg group-hover:text-teal-500 profile-settings-icon">settings</span>
            </div>
            
            <button onclick="cerrarSesion()" class="w-full flex justify-center items-center gap-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg font-bold mt-1 transition-colors py-2" title="Cerrar Sesión">
                <span class="material-symbols-rounded text-lg">logout</span>
                <span class="text-[10px] sidebar-text uppercase">Cerrar Sesión</span>
            </button>
        </div>
    </aside>

    <div id="modal-mi-perfil" class="fixed inset-0 z-[100] hidden bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white dark:bg-[#1e293b] w-full max-w-sm rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-700 modal-scale relative">
            <button onclick="cerrarMiPerfil()" class="absolute top-4 right-4 text-slate-400 hover:text-rose-500 transition-colors"><span class="material-symbols-rounded">close</span></button>
            
            <div class="text-center mb-6">
                <div class="relative w-24 h-24 mx-auto mb-3 group cursor-pointer" onclick="document.getElementById('mi-avatar-input').click()">
                    <img id="mi-avatar-preview" src="${fotoSrc}" class="w-full h-full rounded-full object-cover border-4 border-slate-100 dark:border-slate-700 shadow-lg ${!fotoSrc ? 'hidden' : ''}">
                    <div id="mi-avatar-fallback" class="w-full h-full rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-3xl shadow-lg ${fotoSrc ? 'hidden' : ''}">${activeUser.iniciales || 'U'}</div>
                    
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
    
    // 🧹 BOMBA ANTI-CACHÉ GLOBAL (Disponible en todas las páginas)
    window.limpiarCachéProfunda = () => {
        console.log("🧹 Pasando la escoba anti-caché...");
        const scripts = ['js/layout.js', 'firebase-config.js'];
        scripts.forEach(src => {
            const viejo = document.querySelector(`script[src^="${src}"]`);
            if (viejo) {
                const nuevo = document.createElement('script');
                nuevo.src = `${src}?v=${Date.now()}`;
                viejo.parentNode.replaceChild(nuevo, viejo);
            }
        });
        
        // Si la página tiene Firebase Realtime, forzamos sincronización, si no, recargamos la página.
        if (typeof iniciarEscuchaRealtime === 'function') {
            iniciarEscuchaRealtime();
        } else {
            window.location.reload(true);
        }
        alert("🧹 ¡Caché de scripts limpiada!");
    };

    // Toggle para versión Móvil
    window.toggleSidebar = () => { 
        document.getElementById('app-sidebar').classList.toggle('open'); 
        document.getElementById('sidebar-overlay').classList.toggle('active'); 
    };

    // 🔥 NUEVO: Toggle para versión Escritorio (Contraer/Expandir)
    window.toggleDesktopSidebar = () => {
        document.body.classList.toggle('sidebar-collapsed');
        const isCol = document.body.classList.contains('sidebar-collapsed');
        
        // Guardamos la preferencia en la memoria local
        localStorage.setItem('sidebar_state', isCol ? 'collapsed' : 'expanded');
        
        // Cambiamos el icono del botón
        const iconElement = document.getElementById('sidebar-toggle-icon');
        if (iconElement) {
            iconElement.innerText = isCol ? 'menu' : 'menu_open';
        }
    };

    window.toggleTheme = () => {
        document.documentElement.classList.toggle('dark');
        localStorage.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    };

    window.cerrarSesion = () => { 
        if(confirm("¿Estás seguro que deseas salir?")) { 
            localStorage.removeItem(SESSION_KEY);
            document.cookie = "leezar_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            window.location.href = 'index.html'; 
        } 
    };

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
                activeUser.photoUrl = nuevaFotoBase64; 
                localStorage.setItem(SESSION_KEY, JSON.stringify(activeUser));
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

    const main = document.querySelector('main');
    if (main) {
        const originalContent = main.innerHTML;
        main.innerHTML = `<div class="flex-1 h-full overflow-y-auto p-4 md:p-8 fade-in w-full custom-scroll">${originalContent}</div>`;
        main.className = "flex-1 flex flex-col h-full relative overflow-hidden bg-slate-50 dark:bg-[#0f172a] transition-all duration-300";
    }
});