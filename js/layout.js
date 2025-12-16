document.addEventListener("DOMContentLoaded", () => {
    verificarSesion();
    inyectarLayout();
    inicializarModoOscuro(); // Inicia el tema
});

function verificarSesion() {
    const path = window.location.pathname;
    if (path.includes('index.html') || path.includes('portal.html') || path === '/' || path.endsWith('/')) return;
    const user = localStorage.getItem('leezar_user');
    if (!user) window.location.href = 'index.html';
}

function cerrarSesion() {
    localStorage.clear();
    window.location.href = 'index.html';
}

function inyectarLayout() {
    const path = window.location.pathname;
    if (path.includes('index.html') || path.includes('portal.html')) return;

    const userInitial = (localStorage.getItem('leezar_user') || 'U').charAt(0).toUpperCase();
    const userRole = localStorage.getItem('leezar_role') || 'Colaborador';
    
    const activeClass = (p) => path.includes(p) 
        ? 'bg-teal-50 text-teal-700 border-r-4 border-teal-600 font-bold dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-400' 
        : 'text-gray-500 hover:bg-gray-50 hover:text-teal-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-teal-300';

    const sidebarHTML = `
    <aside class="w-64 min-w-[16rem] bg-white border-r border-gray-100 flex-shrink-0 flex flex-col fixed left-0 top-0 h-full z-[100] font-inter transition-all shadow-sm dark:bg-slate-900 dark:border-slate-800 overflow-y-auto">
        <div class="h-20 flex items-center px-8 border-b border-gray-100 dark:border-slate-800 shrink-0">
            <div class="flex items-center gap-2 text-teal-700 dark:text-teal-400">
                <span class="material-symbols-rounded text-3xl">apartment</span>
                <span class="font-extrabold text-lg tracking-tight text-gray-800 dark:text-white">LEEZAR</span>
            </div>
        </div>
        
        <nav class="flex-1 py-6 px-3 space-y-1">
            <p class="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 dark:text-slate-500">Gestión</p>
            <a href="dashboard.html" class="${activeClass('dashboard')} flex items-center px-4 py-3 rounded-xl transition-all mb-1 group">
                <span class="material-symbols-rounded mr-3 text-xl group-hover:scale-110 transition-transform">dashboard</span> Dashboard
            </a>
            <a href="gestion.html" class="${activeClass('gestion')} flex items-center px-4 py-3 rounded-xl transition-all mb-1 group">
                <span class="material-symbols-rounded mr-3 text-xl group-hover:scale-110 transition-transform">folder_managed</span> Expedientes
            </a>
            <a href="nuevo-expediente.html" class="${activeClass('nuevo-expediente')} flex items-center px-4 py-3 rounded-xl transition-all mb-1 group">
                <span class="material-symbols-rounded mr-3 text-xl group-hover:scale-110 transition-transform">add_circle</span> Nuevo
            </a>

            <p class="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-6 mb-2 dark:text-slate-500">Técnico</p>
            <a href="operacion.html" class="${activeClass('operacion')} flex items-center px-4 py-3 rounded-xl transition-all mb-1 group">
                <span class="material-symbols-rounded mr-3 text-xl group-hover:scale-110 transition-transform">design_services</span> Hoja de Trabajo
            </a>
        </nav>
        
        <div class="p-6 border-t border-gray-100 dark:border-slate-800 shrink-0">
            <button onclick="toggleDarkMode()" class="w-full mb-4 flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-100 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors">
                <span id="dark-mode-text">Cambiar Tema</span>
                <span id="dark-mode-icon" class="material-symbols-rounded text-base">contrast</span>
            </button>

            <div class="flex items-center gap-3">
                <div class="h-10 w-10 min-w-[2.5rem] rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold shadow-sm border border-teal-200 dark:bg-teal-900 dark:text-teal-200 dark:border-teal-800">${userInitial}</div>
                <div class="overflow-hidden">
                    <p class="text-sm font-bold text-gray-700 truncate w-32 dark:text-gray-200">${localStorage.getItem('leezar_user') || 'Usuario'}</p>
                    <p class="text-[10px] text-gray-400 uppercase font-semibold tracking-wide dark:text-gray-500">${userRole}</p>
                </div>
            </div>
            <button onclick="cerrarSesion()" class="mt-4 w-full py-2 text-xs text-red-500 hover:bg-red-50 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors dark:hover:bg-red-900/20">
                <span class="material-symbols-rounded text-sm">logout</span> Cerrar Sesión
            </button>
        </div>
    </aside>`;

    document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
    document.body.classList.add('pl-64'); 
}

function inicializarModoOscuro() {
    // Revisar preferencia guardada o del sistema
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        actualizarBotonOscuro(true);
    } else {
        document.documentElement.classList.remove('dark');
        actualizarBotonOscuro(false);
    }
}

function toggleDarkMode() {
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.theme = 'light';
        actualizarBotonOscuro(false);
    } else {
        document.documentElement.classList.add('dark');
        localStorage.theme = 'dark';
        actualizarBotonOscuro(true);
    }
}

function actualizarBotonOscuro(isDark) {
    const text = document.getElementById('dark-mode-text');
    const icon = document.getElementById('dark-mode-icon');
    if(text && icon) {
        text.textContent = isDark ? 'Modo Oscuro' : 'Modo Claro';
        icon.textContent = isDark ? 'dark_mode' : 'light_mode';
    }
}