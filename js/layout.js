document.addEventListener("DOMContentLoaded", () => {
    // =================================================================
    // 1. SEGURIDAD: INACTIVIDAD (TIPO BANCARIO)
    // =================================================================
    const LIMITE_INACTIVIDAD_MINUTOS = 15;
    let contadorInactividad = 0;

    function reiniciarContador() { contadorInactividad = 0; }

    setInterval(() => {
        contadorInactividad++;
        if (contadorInactividad >= LIMITE_INACTIVIDAD_MINUTOS) {
            if(localStorage.getItem('leezar_user_active') || sessionStorage.getItem('admin_unlocked')) {
                alert("⚠️ Sesión cerrada por seguridad (15 min inactividad).");
                cerrarSesion();
            }
        }
    }, 60000); 

    window.onload = () => { reiniciarContador(); verificarCumpleanos(); };
    document.onmousemove = reiniciarContador;
    document.onkeypress = reiniciarContador;
    document.ontouchstart = reiniciarContador;

    // =================================================================
    // 2. RECURSOS Y ESTILOS
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
            #sidebar-overlay { display: none; position: fixed; inset: 0; bg-black/50; z-index: 45; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); }
            ::-webkit-scrollbar { width: 6px; height: 6px; } 
            ::-webkit-scrollbar-track { background: transparent; } 
            ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
            .dark ::-webkit-scrollbar-thumb { background: #334155; }
            .nav-item { transition: all 0.2s; border-right: 3px solid transparent; }
            .nav-item:hover { background-color: #f1f5f9; color: #0d9488; }
            .dark .nav-item:hover { background-color: rgba(255,255,255,0.05); color: #2dd4bf; }
            .nav-item.active { background: linear-gradient(90deg, rgba(20, 184, 166, 0.1) 0%, transparent 100%); border-right-color: #14b8a6; color: #0f766e; }
            .dark .nav-item.active { color: white; }
            .shake { animation: shake 0.5s; }
            @keyframes shake { 0%, 100% { transform: translateX(0); } 10%, 90% { transform: translateX(-5px); } 20%, 80% { transform: translateX(5px); } }
            
            /* ESTILOS DOODLE CUMPLEAÑOS */
            .balloon { position: fixed; bottom: -100px; width: 50px; height: 60px; background-color: #ff5252; border-radius: 50%; animation: floatUp 5s ease-in infinite; z-index: 9999; opacity: 0.8; }
            .balloon::before { content: ''; position: absolute; bottom: -10px; left: 24px; width: 2px; height: 40px; background: rgba(255,255,255,0.5); }
            @keyframes floatUp { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(-120vh) rotate(20deg); opacity: 0; } }
        `;
        head.appendChild(style);
    }

    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }

    // Obtener usuario activo
    const activeUser = JSON.parse(localStorage.getItem('leezar_user_active')) || { nombre: 'SUPER ADMIN', iniciales: 'SA', rol: 'SUPER ADMIN' };

    const layoutHTML = `
    <div id="sidebar-overlay" onclick="toggleSidebar()"></div>
    <div id="mobile-header" class="bg-white/90 border-b border-slate-200 dark:bg-[#0b1121]/90 dark:border-slate-800">
        <div class="flex items-center gap-3">
            <button onclick="toggleSidebar()" class="p-2 rounded-lg text-slate-600 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800"><span class="material-symbols-rounded text-2xl">menu</span></button>
            <span class="material-symbols-rounded text-teal-500 text-2xl">apartment</span>
            <span class="font-extrabold text-slate-800 dark:text-white text-lg tracking-tight">LEEZAR</span>
        </div>
        <div class="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-xs shadow-md">${activeUser.iniciales}</div>
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
                    <li><a href="dashboard.html" class="nav-item w-full flex items-center px-3 py-2.5 text-slate-600 dark:text-slate-400 font-medium text-sm rounded-lg group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${window.location.pathname.includes('dashboard') ? 'active' : ''}"><span class="material-symbols-rounded mr-3 text-[22px]">dashboard</span>Dashboard</a></li>
                    <li><a href="gestion.html" class="nav-item w-full flex items-center px-3 py-2.5 text-slate-600 dark:text-slate-400 font-medium text-sm rounded-lg group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${window.location.pathname.includes('gestion') ? 'active' : ''}"><span class="material-symbols-rounded mr-3 text-[22px]">folder_shared</span>Expedientes</a></li>
                </ul>
            </div>
            <div>
                <p class="px-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2">Técnico</p>
                <ul class="space-y-1">
                    <li><a href="operacion.html" class="nav-item w-full flex items-center px-3 py-2.5 text-slate-600 dark:text-slate-400 font-medium text-sm rounded-lg group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${window.location.pathname.includes('operacion') ? 'active' : ''}"><span class="material-symbols-rounded mr-3 text-[22px]">design_services</span>Hoja de Trabajo</a></li>
                </ul>
            </div>
            <div class="pt-2 border-t border-slate-100 dark:border-slate-800/50 mt-2">
                <p class="px-3 text-[10px] font-extrabold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-1">Admin <span class="material-symbols-rounded text-[10px] opacity-50">lock</span></p>
                <a href="#" onclick="solicitarPin(event)" class="nav-item w-full flex items-center px-3 py-2.5 text-slate-600 dark:text-slate-400 font-medium text-sm rounded-lg group hover:text-indigo-600 dark:hover:text-white ${window.location.pathname.includes('admin') ? 'active' : ''}"><span class="material-symbols-rounded mr-3 text-[22px] text-indigo-400 group-hover:text-indigo-600 dark:group-hover:text-white transition-colors">settings</span>Configuración</a>
            </div>
        </div>
        <div class="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#0b1121] space-y-3">
            <button onclick="document.documentElement.classList.toggle('dark'); localStorage.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'" class="w-full bg-white border border-slate-200 dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 p-2 rounded-lg flex items-center justify-between transition-colors text-xs font-bold text-slate-600 dark:text-slate-300 shadow-sm cursor-pointer"><span>Tema</span> <span class="material-symbols-rounded text-base">dark_mode</span></button>
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold shadow-md text-xs">${activeUser.iniciales}</div>
                <div class="flex-1 overflow-hidden"><p class="text-xs font-bold text-slate-800 dark:text-white truncate">${activeUser.nombre}</p><p class="text-[9px] text-slate-500 dark:text-slate-400 font-bold truncate">${activeUser.rol || 'SUPER ADMIN'}</p></div>
                <button onclick="cerrarSesion()" class="text-slate-400 hover:text-red-500 transition-colors"><span class="material-symbols-rounded text-lg">logout</span></button>
            </div>
        </div>
    </aside>
    <div id="security-modal" class="fixed inset-0 z-[100] hidden bg-[#0b1121]/90 backdrop-blur-md flex items-center justify-center p-4">
        <div class="bg-white dark:bg-[#1e293b] w-full max-w-xs rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-700 text-center relative overflow-hidden animate-[fadeIn_0.2s]">
            <div class="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600 dark:text-indigo-400"><span class="material-symbols-rounded text-3xl">lock</span></div>
            <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-1">Acceso Restringido</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mb-6">Ingresa tu PIN de seguridad.</p>
            <div class="flex justify-center gap-2 mb-6"><input type="password" id="pin-input" maxlength="4" class="w-32 text-center text-3xl font-bold tracking-[0.5em] bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl py-2 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="••••"></div>
            <button onclick="validarPin()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-500/30 transition-transform active:scale-95">Desbloquear</button>
            <button onclick="cerrarModalPin()" class="mt-4 text-xs text-slate-400 hover:text-white font-bold">Cancelar</button>
        </div>
    </div>
    
    <div id="birthday-overlay" class="fixed inset-0 z-[200] hidden pointer-events-none flex items-center justify-center">
        <div class="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-8 rounded-3xl text-center shadow-2xl border-4 border-yellow-400 animate-[fadeIn_1s]">
            <div class="text-6xl mb-4">🎂🎉🎈</div>
            <h1 class="text-3xl font-extrabold text-slate-800 dark:text-white mb-2">¡Feliz Cumpleaños!</h1>
            <p class="text-slate-600 dark:text-slate-300 font-bold" id="bday-user-name">Ingeniero</p>
            <p class="text-xs text-slate-400 mt-4">De parte de todo el equipo Leezar.</p>
            <button onclick="document.getElementById('birthday-overlay').classList.add('hidden')" class="mt-6 bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-6 rounded-full pointer-events-auto shadow-lg transition-transform active:scale-95">¡Gracias!</button>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('afterbegin', layoutHTML);

    window.toggleSidebar = () => { document.getElementById('app-sidebar').classList.toggle('open'); document.getElementById('sidebar-overlay').classList.toggle('active'); };
    window.solicitarPin = (e) => { e.preventDefault(); if(window.innerWidth < 768) window.toggleSidebar(); if (sessionStorage.getItem('admin_unlocked') === 'true') { window.location.href = 'admin.html'; return; } document.getElementById('security-modal').classList.remove('hidden'); setTimeout(() => document.getElementById('pin-input').focus(), 100); };
    window.cerrarModalPin = () => { document.getElementById('security-modal').classList.add('hidden'); document.getElementById('pin-input').value = ''; };
    
    window.validarPin = () => { 
        const input = document.getElementById('pin-input'); 
        const pin = input.value;
        const users = JSON.parse(localStorage.getItem('leezar_users')) || [];
        
        const foundUser = users.find(u => u.pin === pin);
        
        if (foundUser || pin === "1077") { 
            sessionStorage.setItem('admin_unlocked', 'true');
            // Guardar usuario activo completo
            const userToSave = foundUser || { nombre: 'SUPER ADMIN', iniciales: 'SA', rol: 'SUPER ADMIN' };
            localStorage.setItem('leezar_user_active', JSON.stringify(userToSave));
            
            window.location.href = 'admin.html'; 
        } else { 
            input.value = ''; input.classList.add('shake', 'border-red-500'); setTimeout(() => input.classList.remove('shake', 'border-red-500'), 500); 
        } 
    };
    
    window.cerrarSesion = () => { if(confirm("¿Cerrar sesión de forma segura?")) { sessionStorage.removeItem('admin_unlocked'); localStorage.removeItem('leezar_user_active'); window.location.href = 'dashboard.html'; } };
    
    // VALIDACIÓN CUMPLEAÑOS
    window.verificarCumpleanos = () => {
        const user = JSON.parse(localStorage.getItem('leezar_user_active'));
        if (user && user.fechaNacimiento) {
            const today = new Date();
            const bday = new Date(user.fechaNacimiento);
            // Comparamos día y mes (recordar que getMonth es base 0)
            // Se usa bday.getUTCDate() para evitar problemas de zona horaria si se guardó como string YYYY-MM-DD
            // Pero como viene de input date, lo más seguro es splitear
            const parts = user.fechaNacimiento.split('-');
            const bDayNum = parseInt(parts[2]);
            const bMonthNum = parseInt(parts[1]);

            if (today.getDate() === bDayNum && (today.getMonth() + 1) === bMonthNum) {
                // Es su cumple
                document.getElementById('bday-user-name').textContent = user.nombre;
                document.getElementById('birthday-overlay').classList.remove('hidden');
                lanzarGlobos();
            }
        }
    };

    window.lanzarGlobos = () => {
        const colors = ['#ff5252', '#448aff', '#69f0ae', '#ffd740', '#e040fb'];
        for (let i = 0; i < 15; i++) {
            const balloon = document.createElement('div');
            balloon.className = 'balloon';
            balloon.style.left = Math.random() * 90 + 'vw';
            balloon.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            balloon.style.animationDuration = (4 + Math.random() * 4) + 's';
            balloon.style.animationDelay = Math.random() * 2 + 's';
            document.body.appendChild(balloon);
            setTimeout(() => balloon.remove(), 8000);
        }
    };

    const pinInput = document.getElementById('pin-input'); if(pinInput) pinInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') window.validarPin(); });

    const main = document.querySelector('main');
    if (main) { const originalContent = main.innerHTML; main.innerHTML = `<div class="flex-1 h-full overflow-y-auto p-6 fade-in w-full">${originalContent}</div>`; main.className = "flex-1 flex flex-col h-full relative overflow-hidden bg-gray-50 dark:bg-[#0f172a] transition-colors duration-300"; }
});