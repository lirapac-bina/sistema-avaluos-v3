document.addEventListener("DOMContentLoaded", () => {
    // =================================================================
    // 0. MEMORIA DEL MENÚ CONTRAÍDO
    // =================================================================
    const isSidebarCollapsed = localStorage.getItem('sidebar_aveme_state') === 'collapsed';
    if (isSidebarCollapsed) document.body.classList.add('sidebar-collapsed');

    // =================================================================
    // 1. GESTIÓN DE SESIÓN Y SEGURIDAD (Heredado del core Leezar)
    // =================================================================
    const SESSION_KEY = 'leezar_user_active';
    let activeUser = null;
    
    try {
        const stored = localStorage.getItem(SESSION_KEY);
        if (stored) activeUser = JSON.parse(stored);
    } catch (e) {
        localStorage.removeItem(SESSION_KEY);
    }

    const path = window.location.pathname;
    const file = path.split('/').pop() || 'index.html';
    
    if (!activeUser) {
        window.location.replace('index.html?error=auth_required');
        return; 
    }

    // =================================================================
    // 2. RENDERIZADO DEL LAYOUT EXCLUSIVO AvEME (UI)
    // =================================================================
    
    if (!document.getElementById('layout-aveme-resources')) {
        const head = document.head;
        
        // 1. Inyectar Fuentes Requeridas (Inter y Material Symbols)
        const fontLink = document.createElement('link'); 
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'; 
        fontLink.rel = 'stylesheet'; 
        head.appendChild(fontLink);
        
        const iconLink = document.createElement('link'); 
        iconLink.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20,400,1,0'; 
        iconLink.rel = 'stylesheet'; 
        head.appendChild(iconLink);

        const style = document.createElement('style');
        style.id = 'layout-aveme-resources';
        style.innerHTML = `
            body { font-family: 'Inter', 'Segoe UI', sans-serif; display: flex; min-height: 100vh; overflow-x: hidden; }
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
                #sidebar-toggle-btn { display: none; }
            }
            #sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 45; }
            .dark { color-scheme: dark; }
            .custom-scroll::-webkit-scrollbar { width: 6px; }
            .custom-scroll::-webkit-scrollbar-track { background: transparent; }
            .custom-scroll::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
        `;
        head.appendChild(style);
    }

    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }

    const fotoSrc = activeUser.photo || activeUser.photoUrl || activeUser.fotoUrl || '';
    const avatarHTML = fotoSrc 
        ? `<img src="${fotoSrc}" alt="Perfil" class="w-10 h-10 rounded-full object-cover border-2 border-red-500 shadow-sm shrink-0">` 
        : `<div class="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">${activeUser.iniciales || 'U'}</div>`;

    // Estilos base para los botones del menú AvEME
    const opBase = "w-full flex items-center px-4 py-2.5 font-medium text-sm rounded-lg group transition-all nav-item";
    const opHover = "text-slate-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400";
    const opActive = "bg-gradient-to-r from-red-500/10 to-transparent border-r-2 border-red-500 text-red-700 dark:text-red-400 font-bold";

    let menuAvEME = `
        <li><a href="dashboard_dictamen.html" title="Panel de Control" class="${opBase} ${file === 'dashboard_dictamen.html' ? opActive : opHover}">
            <span class="material-symbols-rounded mr-3 text-[20px] transition-all ${file === 'dashboard_dictamen.html' ? 'text-red-600 dark:text-red-400' : 'group-hover:text-red-600 dark:group-hover:text-red-400'}">query_stats</span>
            <span class="sidebar-text">Panel de Control</span>
        </a></li>
        <li><a href="dictamen_eme.html" title="Nuevo Dictamen" class="${opBase} ${file === 'dictamen_eme.html' ? opActive : opHover}">
            <span class="material-symbols-rounded mr-3 text-[20px] transition-all ${file === 'dictamen_eme.html' ? 'text-red-600 dark:text-red-400' : 'group-hover:text-red-600 dark:group-hover:text-red-400'}">contract</span>
            <span class="sidebar-text">Nuevo Dictamen</span>
        </a></li>
    `;

    // Menú de Admin (Para la nueva colección usuarios_dictamen)
    const esAltoMando = ['ADMIN', 'SUPER ADMIN', 'DIRECTOR', 'SUPER_ADMIN'].includes(activeUser.rol);
    const menuAdminHTML = esAltoMando ? `
        <div class="pt-4 mt-4 border-t border-slate-200 dark:border-slate-700/50">
            <p class="px-4 text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1 sidebar-section-title"><span class="sidebar-text">Administración</span> <span class="material-symbols-rounded text-[12px] sidebar-text">admin_panel_settings</span></p>
            <a href="admin_dictamen.html" title="Gestión de Perfiles" class="${opBase} ${file === 'admin_dictamen.html' ? opActive : opHover}">
                <span class="material-symbols-rounded mr-3 text-[20px] transition-all ${file === 'admin_dictamen.html' ? 'text-red-600 dark:text-red-400' : 'group-hover:text-red-600 dark:group-hover:text-red-400'}">manage_accounts</span>
                <span class="sidebar-text">Gestión de Perfiles</span>
            </a>
        </div>
    ` : '';

    const iconToggleStr = isSidebarCollapsed ? 'menu' : 'menu_open';

    const layoutHTML = `
    <div id="sidebar-overlay" onclick="toggleSidebar()"></div>
    
    <div id="mobile-header" class="bg-white/90 border-b border-slate-200 dark:bg-leezar-darkBg/90 dark:border-slate-800 transition-colors">
        <div class="flex items-center gap-3">
            <button onclick="toggleSidebar()" class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><span class="material-symbols-rounded text-2xl text-slate-700 dark:text-white">menu</span></button>
            <span class="font-black text-lg text-slate-800 dark:text-white tracking-tight">Av<span class="text-red-600">EME</span></span>
        </div>
        <div>${avatarHTML}</div>
    </div>

    <aside id="app-sidebar" class="bg-white border-r border-gray-200 dark:bg-[#0b1121] dark:border-slate-800 flex flex-col transition-all duration-300">
        
        <div class="h-20 flex items-center px-4 shrink-0 md:flex hidden justify-between sidebar-header relative">
            <div class="flex items-center gap-3">
                <!-- Contenedor del Logo EME -->
                <div class="bg-white p-1 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 flex-shrink-0">
                    <img src="https://centrointegralinmobiliarioeme.com/wp-content/uploads/2023/09/logo-eme-2023.png" alt="Logo EME" class="h-8 w-auto object-contain">
                </div>
                <!-- El texto se oculta automáticamente al contraer por la clase sidebar-logo-text -->
                <h1 class="text-lg font-black tracking-tight text-slate-800 dark:text-white sidebar-logo-text">Av<span class="text-red-600">EME</span></h1>
            </div>
            
            <button id="sidebar-toggle-btn" onclick="toggleDesktopSidebar()" class="text-slate-400 hover:text-red-600 transition-all p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 absolute right-2" title="Contraer/Expandir menú">
                <span class="material-symbols-rounded transition-transform" id="sidebar-toggle-icon">${iconToggleStr}</span>
            </button>
        </div>
        
        <div class="h-16 md:hidden"></div>

        <div class="flex-1 overflow-y-auto px-3 py-6 custom-scroll">
            <div>
                <p class="px-4 text-[10px] font-extrabold text-red-600 dark:text-red-500 uppercase tracking-widest mb-2 flex items-center gap-1 sidebar-section-title"><span class="sidebar-text">Motor Pericial</span></p>
                <ul class="space-y-1">${menuAvEME}</ul>
            </div>
            ${menuAdminHTML}
            
            <div class="pt-4 mt-4 border-t border-slate-200 dark:border-slate-700/50">
                 <a href="index.html" title="Volver al Inicio" class="w-full flex items-center px-4 py-2.5 font-medium text-sm rounded-lg group transition-all text-slate-500 hover:text-slate-800 dark:hover:text-white nav-item">
                    <span class="material-symbols-rounded mr-3 text-[20px]">arrow_back</span>
                    <span class="sidebar-text">Volver al Home</span>
                </a>
            </div>
        </div>
        
        <div class="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#0b1121] space-y-3 flex flex-col items-center">
            <button onclick="toggleTheme()" class="w-full bg-white dark:bg-slate-800 p-2.5 rounded-xl flex justify-between items-center text-xs font-bold text-slate-600 dark:text-slate-300 shadow-sm border border-slate-200 dark:border-slate-700 hover:border-red-500 transition-colors theme-toggle-btn">
                <span class="sidebar-text">Modo Oscuro</span> 
                <span class="material-symbols-rounded text-lg">${document.documentElement.classList.contains('dark') ? 'dark_mode' : 'light_mode'}</span>
            </button>
            
            <div class="w-full flex items-center gap-3 p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 group profile-container">
                ${avatarHTML}
                <div class="flex-1 overflow-hidden profile-info">
                    <p class="text-xs font-bold text-slate-800 dark:text-white truncate">${activeUser.nombre}</p>
                    <p class="text-[9px] text-red-600 dark:text-red-500 font-bold truncate uppercase">${activeUser.rol}</p>
                </div>
            </div>
            
            <button onclick="cerrarSesion()" class="w-full flex justify-center items-center gap-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg font-bold mt-1 transition-colors py-2">
                <span class="material-symbols-rounded text-lg">logout</span>
                <span class="text-[10px] sidebar-text uppercase">Cerrar Sesión</span>
            </button>
        </div>
    </aside>`;

    document.body.insertAdjacentHTML('afterbegin', layoutHTML);

    // =================================================================
    // 3. FUNCIONES GLOBALES INTERFAZ AvEME
    // =================================================================
    window.toggleSidebar = () => { 
        document.getElementById('app-sidebar').classList.toggle('open'); 
        document.getElementById('sidebar-overlay').classList.toggle('active'); 
    };

    window.toggleDesktopSidebar = () => {
        document.body.classList.toggle('sidebar-collapsed');
        const isCol = document.body.classList.contains('sidebar-collapsed');
        localStorage.setItem('sidebar_aveme_state', isCol ? 'collapsed' : 'expanded');
        const iconElement = document.getElementById('sidebar-toggle-icon');
        if (iconElement) iconElement.innerText = isCol ? 'menu' : 'menu_open';
    };

    window.toggleTheme = () => {
        document.documentElement.classList.toggle('dark');
        localStorage.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    };

    window.cerrarSesion = () => { 
        if(confirm("¿Estás seguro que deseas salir del Motor Pericial?")) { 
            localStorage.removeItem(SESSION_KEY);
            window.location.href = 'index.html'; 
        } 
    };

    // Aplicar estilos al MAIN si existe
    const main = document.querySelector('main');
    if (main) {
        main.className = "flex-1 flex flex-col h-full relative overflow-hidden bg-slate-50 dark:bg-[#0f172a] transition-all duration-300 custom-scroll overflow-y-auto p-4 md:p-8";
    }
});