// app.js - SISTEMA COMPLETO REDCAJEROS

// Configuración
const API_BASE = '';
let usuarioActual = null;

// Estado global (por usuario)
let cargas = [];
let cajeros = [];
let resumen = [];
let estadisticas = {};
let configuracion = {};
let isLoading = false;

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', function() {
    console.log('💰 RedCajeros v3.0 - Sistema Multi-Usuario');
    
    // Verificar autenticación
    verificarAutenticacion();
    
    // Setup event listeners
    setupEventListeners();
});

function verificarAutenticacion() {
    const userData = localStorage.getItem('redcajeros_user');
    const path = window.location.pathname;

    // 1. Si estamos en Dashboard/Admin, NO redirigir a login todavía.
    // Dejamos que cargarDatosIniciales() haga la llamada a la API.
    // Si la API falla (401), ELLA nos redirigirá al login.
    if (path.includes('dashboard') || path.includes('admin')) {
        // Solo verificamos visualmente, pero confiamos en la API
        if (!userData) {
            console.warn('No hay datos locales, pero dejamos al servidor decidir.');
        }
        return; 
    }

    // 2. Si estamos en Login/Registro y hay datos locales
    if (userData && (path === '/' || path.includes('login') || path.includes('register'))) {
        // NO redirigir automáticamente. Flask ya lo hubiera hecho si la cookie fuera válida.
        // Si estamos aquí y tenemos localStorage, significa que la cookie murió pero el storage no.
        // Así que limpiamos el storage para evitar confusiones.
        console.log('Sesión local huérfana detectada, limpiando...');
        localStorage.removeItem('redcajeros_user');
    } 
}

function mostrarLogin() {
    // Redirigir a login
    window.location.href = '/login';
}

// ========== AUTENTICACIÓN ==========
async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        mostrarAlerta('Error', 'Completa todos los campos', 'error');
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Guardar datos de usuario
            usuarioActual = data.user;
            localStorage.setItem('user', JSON.stringify(data.user));
            
            mostrarAlerta('¡Bienvenido!', `Hola ${data.user.nombre}`, 'success');
            
            // Redirigir al dashboard
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1000);
        } else {
            if (data.code === 'SUBSCRIPTION_EXPIRED') {
                mostrarModalSuscripcion(data.user);
            } else {
                mostrarAlerta('Error', data.error, 'error');
            }
        }
    } catch (error) {
        mostrarAlerta('Error', 'Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function register() {
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    const nombre = document.getElementById('registerNombre').value;
    const telefono = document.getElementById('registerTelefono').value;
    
    // Validaciones
    if (!email || !password || !confirmPassword || !nombre) {
        mostrarAlerta('Error', 'Completa todos los campos obligatorios', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        mostrarAlerta('Error', 'Las contraseñas no coinciden', 'error');
        return;
    }
    
    if (password.length < 6) {
        mostrarAlerta('Error', 'La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email, 
                password, 
                nombre,
                telefono 
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Guardar datos de usuario
            usuarioActual = data.user;
            localStorage.setItem('user', JSON.stringify(data.user));
            
            mostrarAlerta('¡Registro exitoso!', 
                `Bienvenido ${data.user.nombre}. Tienes 7 días de prueba gratuita.`, 
                'success');
            
            // Redirigir al dashboard
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1500);
        } else {
            mostrarAlerta('Error', data.error, 'error');
        }
    } catch (error) {
        mostrarAlerta('Error', 'Error de conexión', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function logout() {
    try {
        const response = await fetch(`${API_BASE}/api/auth/logout`, {
            method: 'POST'
        });
        
        // Limpiar localStorage
        localStorage.removeItem('user');
        usuarioActual = null;
        
        // Redirigir a login
        window.location.href = '/login';
        
    } catch (error) {
        console.error('Error cerrando sesión:', error);
        // Forzar logout
        localStorage.removeItem('user');
        window.location.href = '/login';
    }
}

// ========== SETUP EVENT LISTENERS ==========
function setupEventListeners() {
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Form submissions - SOLO si existen los elementos
    const nombreCajeroInput = document.getElementById('nombreCajero');
    const montoCargaInput = document.getElementById('montoCarga');
    
    if (nombreCajeroInput) {
        nombreCajeroInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') agregarCajero();
        });
    }
    
    if (montoCargaInput) {
        montoCargaInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') agregarCarga();
        });
    }
    
    // Actualizar UI del usuario si está disponible
    setTimeout(() => {
        const userData = localStorage.getItem('redcajeros_user');
        if (userData) {
            try {
                const user = JSON.parse(userData);
                actualizarUIUsuario(user);
            } catch (e) {
                console.error('Error parseando usuario:', e);
            }
        }
    }, 100);
}

function handleKeyboardShortcuts(event) {
    // Ctrl + R or Cmd + R to refresh
    if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
        event.preventDefault();
        cargarDatosIniciales();
        mostrarAlerta('Actualizando', 'Recargando todos los datos...', 'info');
    }
    
    // Ctrl + E or Cmd + E to export
    if ((event.ctrlKey || event.metaKey) && event.key === 'e') {
        event.preventDefault();
        exportarReporte();
    }
    
    // Escape to clear loading
    if (event.key === 'Escape' && isLoading) {
        mostrarLoading(false);
    }
}

function mostrarSeccion(seccion, { scroll = true } = {}) {
    const secciones = {
        resumen: ['seccionResumen', 'seccionTablaResumen'],
        historial: ['seccionHistorial'],
        todo: ['seccionResumen', 'seccionTablaResumen', 'seccionHistorial']
    };

    const idsVisibles = secciones[seccion] || secciones.todo;
    secciones.todo.forEach(id => {
        const element = document.getElementById(id);
        if (!element) return;
        element.style.display = idsVisibles.includes(id) ? '' : 'none';
    });

    if (scroll) {
        const firstId = idsVisibles[0];
        if (firstId) {
            const target = document.getElementById(firstId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }
}

function mostrarModalCajeros() {
    mostrarSeccion('todo', { scroll: false });
    const abrirModal = () => {
        const modalHtml = `
            <div class="modal fade" id="modalCajeros" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered modal-lg">
                    <div class="modal-content ig-card">
                        <div class="modal-header ig-card-header">
                            <h5 class="modal-title gradient-text">
                                <i class="fas fa-users me-2"></i>Gestión de Cajeros
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body ig-card-body">
                            <div class="row g-2 mb-3">
                                <div class="col-md-8">
                                    <input type="text" id="modalNombreCajero" class="form-control form-control-ig"
                                           placeholder="Nombre del cajero">
                                </div>
                                <div class="col-md-4">
                                    <button class="btn btn-ig w-100" onclick="agregarCajeroDesdeModal()">
                                        <i class="fas fa-plus me-2"></i>Agregar
                                    </button>
                                </div>
                            </div>
                            <div class="table-responsive">
                                <table class="table table-ig table-hover">
                                    <thead>
                                        <tr>
                                            <th>Cajero</th>
                                            <th>Estado</th>
                                            <th>Creación</th>
                                            <th>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody id="modalCajerosBody"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);

        renderCajerosModal();

        const modal = new bootstrap.Modal(document.getElementById('modalCajeros'));
        modal.show();

        modalContainer.querySelector('#modalCajeros').addEventListener('hidden.bs.modal', function () {
            document.body.removeChild(modalContainer);
        });
    };

    if (!cajeros.length) {
        abrirModal();
        cargarCajeros()
            .then(data => {
                cajeros = data || [];
                renderCajerosModal();
            })
            .catch(() => {
                mostrarAlerta('Error', 'No se pudieron cargar los cajeros', 'error');
            });
    } else {
        abrirModal();
    }

    const form = document.getElementById('formCajero');
    if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const input = document.getElementById('nombreCajero');
        if (input) input.focus();
    }

    const input = document.getElementById('nombreCajero');
    if (input) input.focus();
}

function mostrarModalCarga() {
    mostrarSeccion('todo', { scroll: false });
    if (!cajeros.length) {
        cargarCajeros()
            .then(data => {
                cajeros = data || [];
                if (!cajeros.length) {
                    mostrarAlerta('Sin cajeros', 'Debe crear al menos un cajero antes de registrar una carga', 'warning');
                    mostrarModalCajeros();
                    return;
                }
                mostrarModalCarga();
            })
            .catch(() => {
                mostrarAlerta('Error', 'No se pudieron cargar los cajeros', 'error');
            });
        return;
    }

    const cajerosActivos = cajeros.filter(c => c.activo);
    if (!cajerosActivos.length) {
        mostrarAlerta('Sin cajeros activos', 'Activa o crea un cajero para registrar una carga', 'warning');
        mostrarModalCajeros();
        return;
    }
    const options = cajerosActivos.map(cajero => `
        <option value="${cajero.id}">${cajero.nombre}</option>
    `).join('');

    const modalHtml = `
        <div class="modal fade" id="modalCarga" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content ig-card">
                    <div class="modal-header ig-card-header">
                        <h5 class="modal-title gradient-text">
                            <i class="fas fa-plus-circle me-2"></i>Nueva Carga
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body ig-card-body">
                        <div class="mb-3">
                            <label class="form-label text-muted">Cajero</label>
                            <select id="modalSelectCajero" class="form-select form-select-ig">
                                <option value="">Seleccione un cajero</option>
                                ${options}
                            </select>
                        </div>
                        <div class="mb-3">
                            <label class="form-label text-muted">Plataforma</label>
                            <select id="modalPlataforma" class="form-select form-select-ig">
                                <option value="Zeus">Zeus</option>
                                <option value="Gana">Gana</option>
                                <option value="Ganamos">Ganamos</option>
                            </select>
                        </div>
                        <div class="mb-3">
                            <label class="form-label text-muted">Monto</label>
                            <input type="number" id="modalMonto" class="form-control form-control-ig" min="0" step="0.01">
                        </div>
                        <div class="mb-3">
                            <label class="form-label text-muted">Nota</label>
                            <input type="text" id="modalNota" class="form-control form-control-ig" placeholder="Opcional">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-ig" onclick="agregarCargaDesdeModal()">
                            <i class="fas fa-save me-2"></i>Guardar Carga
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);

    const modal = new bootstrap.Modal(document.getElementById('modalCarga'));
    modal.show();

    modalContainer.querySelector('#modalCarga').addEventListener('hidden.bs.modal', function () {
        document.body.removeChild(modalContainer);
    });
    const input = document.getElementById('modalMonto');
    if (input) input.focus();
}

function mostrarModalReportes() {
    mostrarSeccion('todo', { scroll: false });
    const modalHtml = `
        <div class="modal fade" id="modalReportes" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content ig-card">
                    <div class="modal-header ig-card-header">
                        <h5 class="modal-title gradient-text">
                            <i class="fas fa-file-alt me-2"></i>Reportes
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body ig-card-body">
                        <button class="btn btn-ig w-100 mb-2" onclick="mostrarReporteDiario()">
                            <i class="fas fa-calendar-day me-2"></i>Reporte Diario
                        </button>
                        <button class="btn btn-ig w-100 mb-2" onclick="mostrarReporteSemanal()">
                            <i class="fas fa-calendar-week me-2"></i>Reporte Semanal
                        </button>
                        <button class="btn btn-ig w-100" onclick="mostrarReporteMensual()">
                            <i class="fas fa-calendar-alt me-2"></i>Reporte Mensual
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);

    const modal = new bootstrap.Modal(document.getElementById('modalReportes'));
    modal.show();

    modalContainer.querySelector('#modalReportes').addEventListener('hidden.bs.modal', function () {
        document.body.removeChild(modalContainer);
    });
    mostrarAlerta('Reportes', 'Usa el menú para generar reportes y exportar PDF.', 'info');
}

// ========== ALERT SYSTEM ==========

function mostrarAlerta(titulo, mensaje, tipo = 'info') {
    const tipos = {
        success: 'alert-ig-success',
        error: 'alert-ig-error',
        warning: 'alert-ig-warning',
        info: 'alert-ig-info'
    };

    const iconos = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    const alerta = document.createElement('div');
    alerta.className = `alert-ig ${tipos[tipo]} fade-in`;

    alerta.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="fas ${iconos[tipo]} fa-lg me-3"></i>
            <div class="flex-grow-1">
                <h6 class="mb-1 fw-bold">${titulo}</h6>
                <small>${mensaje}</small>
            </div>
            <button type="button" class="btn-close btn-close-white ms-2" onclick="cerrarAlerta(this)"></button>
        </div>
    `;

    const container = document.getElementById('alertContainer');
    if (!container) return;

    container.prepend(alerta);

    setTimeout(() => {
        alerta.classList.add('hiding');
        setTimeout(() => alerta.remove(), 300);
    }, 5000);
}



function cerrarAlerta(btn) {
    const alerta = btn.closest('.alert-ig');
    if (!alerta) return;

    alerta.classList.add('hiding');
    setTimeout(() => alerta.remove(), 300);
}


// ========== LOADING OVERLAY ==========

function mostrarLoading(mostrar = true) {
    isLoading = mostrar;
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;

    if (mostrar) {
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        if (window.loadingTimeout) clearTimeout(window.loadingTimeout);

        window.loadingTimeout = setTimeout(() => {
            if (isLoading) {
                console.warn('⚠️ Timeout de loading, forzando cierre');
                mostrarLoading(false);
            }
        }, 10000);

    } else {
        overlay.classList.remove('active');
        document.body.style.overflow = 'auto';

        if (window.loadingTimeout) {
            clearTimeout(window.loadingTimeout);
            window.loadingTimeout = null;
        }
    }
}


function forzarOcultarLoading() {
    isLoading = false;
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
    
    if (window.loadingTimeout) {
        clearTimeout(window.loadingTimeout);
        window.loadingTimeout = null;
    }
}

function diagnostico() {
    const plan = usuarioActual?.plan ? usuarioActual.plan.toUpperCase() : 'N/A';
    const nombre = usuarioActual?.nombre || 'Sin usuario';
    const correo = usuarioActual?.email || 'Sin email';

    const mensaje = `Usuario: ${nombre}\nEmail: ${correo}\nPlan: ${plan}\nCajeros: ${cajeros.length}\nCargas: ${cargas.length}`;
    mostrarAlerta('Diagnóstico', mensaje, 'info');
    console.table({
        usuario: nombre,
        email: correo,
        plan,
        cajeros: cajeros.length,
        cargas: cargas.length
    });
}

// ========== UI USUARIO ==========
function actualizarUIUsuario() {
    if (!usuarioActual) return;
    
    // Actualizar navbar con nombre de usuario
    const userNavElement = document.getElementById('userNav');
    if (userNavElement) {
        userNavElement.innerHTML = `
            <div class="dropdown">
                <button class="btn btn-ig-outline dropdown-toggle" type="button" data-bs-toggle="dropdown">
                    <div class="story-circle small me-2">
                        <i class="fas fa-user"></i>
                    </div>
                    ${usuarioActual.nombre}
                </button>
                <ul class="dropdown-menu dropdown-menu-dark border-gradient">
                    <li class="dropdown-item disabled">
                        <small class="text-muted">${usuarioActual.email}</small>
                    </li>
                    <li class="dropdown-item disabled">
                        <small class="text-muted">Plan: ${usuarioActual.plan}</small>
                    </li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item" href="#" onclick="cargarDatosIniciales()"><i class="fas fa-sync-alt me-2"></i> Actualizar</a></li>
                    <li><a class="dropdown-item" href="#" onclick="exportarReporte()"><i class="fas fa-file-pdf me-2"></i> Exportar PDF</a></li>
                    <li><a class="dropdown-item" href="#" onclick="verPendientes()"><i class="fas fa-clock me-2"></i> Ver Pendientes</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item" href="#" onclick="mostrarModalPago()"><i class="fas fa-credit-card me-2"></i> Renovar Plan</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item text-danger" href="#" onclick="logout()"><i class="fas fa-sign-out-alt me-2"></i> Cerrar Sesión</a></li>
                </ul>
            </div>
        `;
    }
    
    // Actualizar título de dashboard
    const dashboardTitle = document.getElementById('dashboardTitle');
    if (dashboardTitle) {
        dashboardTitle.textContent = `Panel de ${usuarioActual.nombre}`;
    }
    
    // Actualizar info de suscripción
    actualizarInfoSuscripcion();
}

function actualizarInfoSuscripcion() {
    if (!usuarioActual) return;
    
    const subscriptionInfo = document.getElementById('subscriptionInfo');
    if (subscriptionInfo) {
        const expiracion = new Date(usuarioActual.expiracion);
        const diasRestantes = Math.ceil((expiracion - new Date()) / (1000 * 60 * 60 * 24));
        
        let badgeClass = 'bg-success';
        let badgeText = 'Activa';
        
        if (diasRestantes < 0) {
            badgeClass = 'bg-danger';
            badgeText = 'Expirada';
        } else if (diasRestantes <= 3) {
            badgeClass = 'bg-warning';
            badgeText = 'Por expirar';
        }
        
        subscriptionInfo.innerHTML = `
            <div class="ig-card">
                <h6><i class="fas fa-crown me-2"></i>Tu Suscripción</h6>
                <div class="d-flex justify-content-between align-items-center mt-2">
                    <div>
                        <div class="fw-bold">Plan ${usuarioActual.plan.toUpperCase()}</div>
                        <small class="text-muted">Expira: ${expiracion.toLocaleDateString('es-ES')}</small>
                    </div>
                    <span class="badge ${badgeClass}">${badgeText}</span>
                </div>
                ${diasRestantes <= 3 ? `
                <div class="mt-3">
                    <button class="btn btn-ig btn-sm w-100" onclick="mostrarModalPago()">
                        <i class="fas fa-credit-card me-2"></i> Renovar Ahora
                    </button>
                </div>
                ` : ''}
            </div>
        `;
    }
}

// ========== LOAD INITIAL DATA ==========

async function cargarDatosIniciales() {
    if (isLoading) {
        console.log('⚠️ Ya está cargando, ignorando llamada duplicada');
        return;
    }

    console.log('🚀 Cargando datos iniciales...');
    mostrarLoading(true);

    try {
        const [cajerosData, cargasData, resumenData, estadisticasData] = await Promise.allSettled([
            cargarCajeros(),
            cargarCargas(),
            cargarResumen(),
            cargarEstadisticas()
        ]);

        if (cajerosData.status === 'fulfilled') cajeros = cajerosData.value || [];
        if (cargasData.status === 'fulfilled') cargas = cargasData.value || [];
        if (resumenData.status === 'fulfilled') resumen = resumenData.value || [];
        if (estadisticasData.status === 'fulfilled') estadisticas = estadisticasData.value || {};

        actualizarTodaLaUI();

        const ahora = new Date();
        const lastUpdateEl = document.getElementById('lastUpdate');
        if (lastUpdateEl) {
            lastUpdateEl.textContent = `Última actualización: ${ahora.toLocaleTimeString('es-ES')}`;
        }

    } catch (error) {
        console.error('❌ Error crítico cargando datos:', error);
        mostrarAlerta('Error', 'No se pudieron cargar los datos.', 'error');
    } finally {
        setTimeout(() => mostrarLoading(false), 1000);
    }
}


function actualizarTodaLaUI() {
    actualizarSelectCajeros();
    actualizarTablaResumen();
    actualizarTablaCargas();
    calcularEstadisticas();
    actualizarContadores();
}

// ========== CAJEROS MANAGEMENT ==========
async function cargarCajeros() {
    try {
        const response = await fetch(`${API_BASE}/api/cajeros`);
        const data = await response.json();
        
        if (data.success) {
            return data.data || [];
        } else {
            if (data.error && data.error.includes('No autenticado')) {
                throw new Error('No autenticado');
            }
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error cargando cajeros:', error);
        throw error;
    }
}

function renderCajerosModal() {
    const tbody = document.getElementById('modalCajerosBody');
    if (!tbody) return;

    if (!cajeros.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-muted">Sin cajeros registrados</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = cajeros.map(cajero => `
        <tr>
            <td>${cajero.nombre}</td>
            <td>${cajero.activo ? '<span class="badge bg-success">Activo</span>' : '<span class="badge bg-secondary">Inactivo</span>'}</td>
            <td>${cajero.fecha_creacion || '--'}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="editarCajero(${cajero.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-outline-warning" onclick="eliminarCajero(${cajero.id})">
                        <i class="fas fa-user-slash"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="eliminarCajeroCompleto(${cajero.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function agregarCajeroDesdeModal() {
    const input = document.getElementById('modalNombreCajero');
    if (!input) return;
    const nombre = input.value.trim();
    if (!nombre) {
        mostrarAlerta('Campo vacío', 'Ingrese un nombre para el cajero', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/cajeros`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre })
        });
        const data = await response.json();
        if (data.success) {
            input.value = '';
            cajeros = await cargarCajeros();
            actualizarSelectCajeros();
            renderCajerosModal();
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo agregar el cajero', 'error');
        }
    } catch (error) {
        console.error('Error agregando cajero:', error);
        mostrarAlerta('Error', 'No se pudo conectar con el servidor', 'error');
    }
}

async function eliminarCajeroCompleto(id) {
    const cajero = cajeros.find(c => c.id === id);
    if (!cajero) return;
    if (!confirm(`¿Eliminar completamente el cajero "${cajero.nombre}"?`)) return;

    try {
        const response = await fetch(`${API_BASE}/api/cajeros/${id}/eliminar`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            cajeros = await cargarCajeros();
            actualizarSelectCajeros();
            renderCajerosModal();
            mostrarAlerta('Eliminado', data.message || 'Cajero eliminado', 'success');
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo eliminar el cajero', 'error');
        }
    } catch (error) {
        console.error('Error eliminando cajero:', error);
        mostrarAlerta('Error', 'No se pudo conectar con el servidor', 'error');
    }
}

function actualizarSelectCajeros(seleccionarId = null) {
    const select = document.getElementById('selectCajero');
    if (!select) return;
    
    // Guardar selección actual
    const seleccionActual = seleccionarId || select.value;
    
    // Limpiar opciones
    select.innerHTML = '<option value="">Seleccione un cajero</option>';
    
    // Filtrar solo cajeros activos
    const cajerosActivos = cajeros.filter(c => c.activo);
    
    // Ordenar alfabéticamente
    cajerosActivos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    
    // Agregar opciones
    cajerosActivos.forEach(cajero => {
        const option = document.createElement('option');
        option.value = cajero.id;
        option.textContent = cajero.nombre;
        option.dataset.activo = cajero.activo;
        select.appendChild(option);
    });
    
    // Restaurar selección si existe
    if (seleccionActual && cajerosActivos.some(c => c.id == seleccionActual)) {
        select.value = seleccionActual;
    } else if (cajerosActivos.length > 0 && !seleccionActual) {
        select.value = cajerosActivos[0].id;
    }
    
    // Actualizar contadores
    actualizarContadoresCajeros();
}

function actualizarContadoresCajeros() {
    const activos = cajeros.filter(c => c.activo).length;
    
    // Navbar
    const totalCajerosEl = document.getElementById('totalCajeros');
    if (totalCajerosEl) totalCajerosEl.textContent = activos;
    
    // Card header
    const contadorCajerosEl = document.getElementById('contadorCajeros');
    if (contadorCajerosEl) {
        contadorCajerosEl.textContent = `${activos} ${activos === 1 ? 'cajero' : 'cajeros'}`;
    }
    
    // Cajeros count
    const cajerosCountEl = document.getElementById('cajerosCount');
    if (cajerosCountEl) {
        cajerosCountEl.innerHTML = `<i class="fas fa-users me-1"></i> ${activos} ${activos === 1 ? 'cajero activo' : 'cajeros activos'}`;
    }
}

async function agregarCajero() {
    const nombreInput = document.getElementById('nombreCajero');
    const nombre = nombreInput.value.trim();
    
    if (!nombre) {
        mostrarAlerta('Campo vacío', 'Ingrese un nombre para el cajero', 'warning');
        nombreInput.focus();
        return;
    }
    
    if (nombre.length < 2) {
        mostrarAlerta('Nombre muy corto', 'El nombre debe tener al menos 2 caracteres', 'warning');
        return;
    }
    
    // Verificar si ya existe un cajero con el mismo nombre
    const nombreExistente = cajeros.find(c => 
        c.nombre.toLowerCase() === nombre.toLowerCase() && c.activo
    );
    
    if (nombreExistente) {
        mostrarAlerta('Cajero duplicado', `Ya existe un cajero con el nombre "${nombreExistente.nombre}"`, 'error');
        nombreInput.focus();
        nombreInput.select();
        return;
    }
    
    console.log(`➕ Agregando cajero: "${nombre}"`);
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/cajeros`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ nombre: nombre })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlerta('¡Éxito!', `Cajero "${nombre}" agregado correctamente`, 'success');
            nombreInput.value = '';
            nombreInput.focus();
            
            // Recargar cajeros
            cajeros = await cargarCajeros();
            actualizarSelectCajeros(data.data.id);
            
            // Seleccionar automáticamente el nuevo cajero
            const selectCajero = document.getElementById('selectCajero');
            if (selectCajero) {
                selectCajero.value = data.data.id;
            }
            
            // Recargar resumen y estadísticas
            await Promise.all([
                cargarResumen(),
                cargarEstadisticas()
            ]);
            
            actualizarTablaResumen();
            calcularEstadisticas();
            
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo agregar el cajero', 'error');
        }
        
    } catch (error) {
        console.error('❌ Error agregando cajero:', error);
        mostrarAlerta('Error de conexión', 'Verifique su conexión', 'error');
        
    } finally {
        mostrarLoading(false);
    }
}

async function editarCajero(id) {
    const cajero = cajeros.find(c => c.id === id);
    if (!cajero) return;
    
    const nuevoNombre = prompt('Ingrese el nuevo nombre del cajero:', cajero.nombre);
    if (!nuevoNombre || nuevoNombre.trim() === '' || nuevoNombre === cajero.nombre) {
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/cajeros/${id}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ 
                nombre: nuevoNombre.trim(),
                activo: cajero.activo
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlerta('¡Éxito!', `Cajero actualizado a "${nuevoNombre}"`, 'success');
            
            // Recargar datos
            cajeros = await cargarCajeros();
            resumen = await cargarResumen();
            
            actualizarSelectCajeros(id);
            actualizarTablaResumen();
            calcularEstadisticas();
            renderCajerosModal();
            
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo actualizar el cajero', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error de conexión', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function eliminarCajero(id) {
    const cajero = cajeros.find(c => c.id === id);
    if (!cajero) return;
    
    const confirmacion = confirm(
        `¿Está seguro de desactivar al cajero "${cajero.nombre}"?\n\n` +
        `El cajero se marcará como inactivo y no se mostrará en las listas de selección.`
    );
    
    if (!confirmacion) {
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/cajeros/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlerta('¡Éxito!', 'Cajero desactivado correctamente', 'success');
            
            // Recargar datos
            cajeros = await cargarCajeros();
            resumen = await cargarResumen();
            
            actualizarSelectCajeros();
            actualizarTablaResumen();
            calcularEstadisticas();
            renderCajerosModal();
            
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo procesar el cajero', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// ========== CARGAS MANAGEMENT ==========
async function cargarCargas(fechaInicio = null, fechaFin = null) {
    try {
        let url = `${API_BASE}/api/cargas`;
        
        if (fechaInicio && fechaFin) {
            url += `?fecha_inicio=${encodeURIComponent(fechaInicio)}&fecha_fin=${encodeURIComponent(fechaFin)}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            return data.data || [];
        } else {
            throw new Error(data.error || 'Error desconocido');
        }
    } catch (error) {
        console.error('❌ Error cargando cargas:', error);
        throw error;
    }
}

function actualizarTablaCargas() {
    const tbody = document.getElementById('tablaCargas');
    if (!tbody) return;
    
    if (cargas.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted py-5">
                    <div class="mb-3">
                        <i class="fas fa-inbox fa-3x"></i>
                    </div>
                    <h6>No hay cargas registradas</h6>
                    <small class="text-muted">Agrega tu primera carga usando el formulario</small>
                </td>
            </tr>
        `;
        return;
    }
    
    // Limpiar tabla
    tbody.innerHTML = '';
    
    // Mostrar máximo 50 cargas por performance
    const cargasMostrar = cargas.slice(0, 50);
    
    cargasMostrar.forEach((carga, index) => {
        try {
            const fecha = new Date(carga.fecha);
            const fechaFormateada = fecha.toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).replace(/ de /g, '/');
            
            const tr = document.createElement('tr');
            
            // Clase según tipo de registro
            if (carga.plataforma === 'PAGO') {
                tr.className = 'table-success';
            } else if (carga.es_deuda) {
                tr.className = 'table-danger';
            } else if (index < 3) {
                tr.className = 'table-info';
            }
            
            // Icono según tipo
            let icono = 'fa-calendar-alt';
            if (carga.plataforma === 'PAGO') {
                icono = 'fa-money-bill-wave text-success';
            } else if (carga.es_deuda) {
                icono = 'fa-exclamation-triangle text-danger';
            } else if (carga.pagado) {
                icono = 'fa-check-circle text-warning';
            }
            
            tr.innerHTML = `
                <td>
                    <div class="d-flex align-items-center">
                        <div class="bg-dark rounded-circle d-flex align-items-center justify-content-center me-2" 
                             style="width: 32px; height: 32px;">
                            <i class="fas ${icono} fa-xs"></i>
                        </div>
                        <div>
                            <div class="fw-medium">${fechaFormateada}</div>
                            <small class="text-muted">ID: ${carga.id}</small>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="story-circle small me-2" style="width: 28px; height: 28px; font-size: 0.8rem;">
                            <i class="fas fa-user"></i>
                        </div>
                        <span>${carga.cajero || 'Sin nombre'}</span>
                    </div>
                </td>
                <td>
                    <span class="badge ${getBadgeClass(carga)}">
                        ${carga.plataforma || 'Sin plataforma'}
                    </span>
                </td>
                <td class="text-end">
                    <span class="fw-bold ${getTextColorClass(carga)}">
                        ${carga.plataforma === 'PAGO' ? '-' : carga.es_deuda ? '-' : ''}$${Math.abs(parseFloat(carga.monto || 0)).toFixed(2)}
                    </span>
                </td>
                <td class="text-center">
                    ${carga.plataforma !== 'PAGO' ? `
                    <button class="btn btn-outline-danger btn-sm hover-lift" onclick="eliminarCarga(${carga.id})" 
                            title="Eliminar carga">
                        <i class="fas fa-trash"></i>
                    </button>
                    ` : '<small class="text-muted">PAGO</small>'}
                </td>
            `;
            
            tbody.appendChild(tr);
            
        } catch (error) {
            console.error(`❌ Error procesando carga ${carga.id}:`, error);
        }
    });
    
    // Actualizar contador
    const cargasCount = document.getElementById('cargasCount');
    if (cargasCount) {
        cargasCount.innerHTML = `<i class="fas fa-list me-1"></i> ${cargas.length} ${cargas.length === 1 ? 'carga registrada' : 'cargas registradas'}`;
    }
}

function getBadgeClass(carga) {
    if (carga.es_deuda) return 'bg-danger';
    if (carga.plataforma === 'PAGO') return 'bg-success';
    
    switch(carga.plataforma) {
        case 'Zeus': return 'badge-zeus';
        case 'Gana': return 'badge-gana';
        case 'Ganamos': return 'badge-ganamos';
        default: return 'bg-secondary';
    }
}

function getTextColorClass(carga) {
    if (carga.plataforma === 'PAGO') return 'text-success';
    if (carga.es_deuda) return 'text-danger';
    if (carga.pagado) return 'text-warning';
    return 'text-gradient';
}

function actualizarContadores() {
    // Total cargas
    const totalCargasEl = document.getElementById('totalCargas');
    if (totalCargasEl) {
        totalCargasEl.textContent = cargas.length;
    }
    
    // Data status
    const dataStatusEl = document.getElementById('dataStatus');
    if (dataStatusEl) {
        const totalPendiente = resumen.reduce((sum, item) => sum + item.total, 0);
        const cargasDeuda = cargas.filter(c => c.es_deuda && !c.pagado).length;
        let statusText = `Cajeros: ${cajeros.filter(c => c.activo).length} | Cargas: ${cargas.length}`;
        
        if (cargasDeuda > 0) {
            statusText += ` | Deudas: ${cargasDeuda}`;
        }
        
        statusText += ` | Pendiente: $${totalPendiente.toFixed(2)}`;
        dataStatusEl.textContent = statusText;
    }
}

async function agregarCarga() {
    const cajeroSelect = document.getElementById('selectCajero');
    const plataformaSelect = document.getElementById('selectPlataforma');
    const montoInput = document.getElementById('montoCarga');
    
    const cajeroId = cajeroSelect.value;
    const plataforma = plataformaSelect.value;
    const monto = parseFloat(montoInput.value);
    
    // Validations
    if (!cajeroId) {
        mostrarAlerta('Seleccione cajero', 'Debe seleccionar un cajero de la lista', 'warning');
        cajeroSelect.focus();
        return;
    }
    
    if (!monto || monto === 0 || isNaN(monto)) {
        mostrarAlerta('Monto inválido', 'Ingrese un monto válido diferente de 0', 'warning');
        montoInput.focus();
        montoInput.select();
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/cargas`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                cajero_id: parseInt(cajeroId),
                plataforma: plataforma,
                monto: monto
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const cajeroNombre = cajeroSelect.options[cajeroSelect.selectedIndex].text;
            const tipo = monto < 0 ? 'Deuda' : 'Carga';
            mostrarAlerta('¡Registro exitoso!', 
                `${tipo} de $${Math.abs(monto).toFixed(2)} registrada para ${cajeroNombre} en ${plataforma}`, 
                monto < 0 ? 'warning' : 'success');
            
            // Reset form
            montoInput.value = '';
            
            // Recargar datos en paralelo
            const [nuevasCargas, nuevoResumen, nuevasEstadisticas] = await Promise.all([
                cargarCargas(),
                cargarResumen(),
                cargarEstadisticas()
            ]);
            
            cargas = nuevasCargas;
            resumen = nuevoResumen;
            estadisticas = nuevasEstadisticas;
            
            // Actualizar UI
            actualizarTablaCargas();
            actualizarTablaResumen();
            calcularEstadisticas();
            actualizarContadores();
            
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo registrar la carga', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error de conexión', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function eliminarCarga(id) {
    const carga = cargas.find(c => c.id === id);
    if (!carga) return;
    
    const tipo = carga.es_deuda ? 'deuda' : 'carga';
    if (!confirm(`¿Está seguro de eliminar esta ${tipo}?\n${carga.cajero} - ${carga.plataforma} - $${carga.monto}\n\n⚠️ Esta acción no se puede deshacer.`)) {
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/cargas/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlerta('Eliminado', `${tipo.charAt(0).toUpperCase() + tipo.slice(1)} eliminada correctamente`, 'success');
            
            // Recargar datos
            const [nuevasCargas, nuevoResumen, nuevasEstadisticas] = await Promise.all([
                cargarCargas(),
                cargarResumen(),
                cargarEstadisticas()
            ]);
            
            cargas = nuevasCargas;
            resumen = nuevoResumen;
            estadisticas = nuevasEstadisticas;
            
            // Actualizar UI
            actualizarTablaCargas();
            actualizarTablaResumen();
            calcularEstadisticas();
            actualizarContadores();
            
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo eliminar la carga', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// ========== RESUMEN ==========
async function cargarResumen() {
    try {
        const response = await fetch(`${API_BASE}/api/resumen`);
        const data = await response.json();
        
        if (data.success) {
            return data.data || [];
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error cargando resumen:', error);
        throw error;
    }
}

function actualizarTablaResumen() {
    const tbody = document.getElementById('tablaResumen');
    if (!tbody) return;
    
    if (resumen.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted py-5">
                    <div class="mb-3">
                        <i class="fas fa-chart-line fa-3x"></i>
                    </div>
                    <h6>No hay datos para mostrar</h6>
                    <small class="text-muted">Agrega cajeros y cargas para ver el resumen</small>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = '';
    
    // Sort by total descending
    const resumenOrdenado = [...resumen].sort((a, b) => b.total - a.total);
    
    resumenOrdenado.forEach((item, index) => {
        const isTop = index === 0 && item.total > 0;
        const tr = document.createElement('tr');
        
        // Color según total
        if (item.total < 0) {
            tr.className = 'table-danger';
        } else if (isTop) {
            tr.className = 'table-warning';
        }
        
        tr.innerHTML = `
            <td>
                <div class="d-flex align-items-center">
                    <div class="position-relative me-2">
                        <div class="story-circle small ${isTop && item.total > 0 ? 'pulse' : ''}" 
                             style="width: 36px; height: 36px;">
                            <i class="fas ${item.total < 0 ? 'fa-exclamation-triangle text-danger' : isTop && item.total > 0 ? 'fa-crown' : 'fa-user'}"></i>
                        </div>
                    </div>
                    <div>
                        <div class="fw-medium">${item.cajero}</div>
                        <small class="text-muted">${item.cargas} ${item.cargas === 1 ? 'carga' : 'cargas'} pendientes</small>
                    </div>
                </div>
            </td>
            <td class="text-end">
                <span class="fw-medium ${item.zeus < 0 ? 'text-danger' : ''}">$${item.zeus.toFixed(2)}</span>
            </td>
            <td class="text-end">
                <span class="fw-medium ${item.gana < 0 ? 'text-danger' : ''}">$${item.gana.toFixed(2)}</span>
            </td>
            <td class="text-end">
                <span class="fw-medium ${item.ganamos < 0 ? 'text-danger' : ''}">$${item.ganamos.toFixed(2)}</span>
            </td>
            <td class="text-end">
                <span class="fw-bold ${item.total < 0 ? 'text-danger' : item.total === 0 ? 'text-muted' : 'text-gradient'}">
                    $${item.total.toFixed(2)}
                </span>
            </td>
            <td class="text-center">
                <button class="btn ${item.total <= 0 ? 'btn-secondary' : 'btn-success'} btn-sm hover-lift" 
                        onclick="pagarCajero(${item.cajero_id}, '${item.cajero.replace(/'/g, "\\'")}')"
                        title="Marcar como pagado"
                        ${item.total <= 0 ? 'disabled' : ''}>
                    <i class="fas fa-check-circle"></i> Pagar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ========== ESTADÍSTICAS ==========
async function cargarEstadisticas() {
    try {
        const response = await fetch(`${API_BASE}/api/estadisticas`);
        const data = await response.json();
        
        if (data.success) {
            return data.data;
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
    return {};
}

function calcularEstadisticas() {
    // Total general
    const totalGeneral = resumen.reduce((sum, item) => sum + item.total, 0);
    const totalGeneralEl = document.getElementById('totalGeneral');
    if (totalGeneralEl) {
        totalGeneralEl.textContent = `$${totalGeneral.toFixed(2)}`;
        totalGeneralEl.className = totalGeneral < 0 ? 'gradient-text text-danger' : 'gradient-text';
    }
    
    // Today's total
    const hoy = new Date().toISOString().split('T')[0];
    const cargasHoy = cargas.filter(c => {
        if (!c.fecha) return false;
        return c.fecha.startsWith(hoy);
    });
    
    const totalHoy = cargasHoy.reduce((sum, c) => {
        const monto = parseFloat(c.monto || 0);
        return sum + monto;
    }, 0);
    
    const totalHoyEl = document.getElementById('totalHoy');
    if (totalHoyEl) {
        totalHoyEl.textContent = `$${Math.abs(totalHoy).toFixed(2)}`;
        totalHoyEl.className = 'stat-number';
    }
    
    const totalHoyNombreEl = document.getElementById('totalHoyNombre');
    if (totalHoyNombreEl) {
        const icono = totalHoy < 0 ? 'fa-exclamation-triangle text-danger' : 'fa-calendar-day';
        const texto = totalHoy < 0 ? 'Deuda hoy' : 'Hoy';
        totalHoyNombreEl.innerHTML = `<i class="fas ${icono} me-1"></i> ${texto}`;
    }
    
    // Top cajero
    if (resumen.length > 0) {
        const cajerosPositivos = resumen.filter(item => item.total > 0);
        if (cajerosPositivos.length > 0) {
            const top = cajerosPositivos.reduce((max, item) => item.total > max.total ? item : max, cajerosPositivos[0]);
            
            const topCajeroEl = document.getElementById('topCajero');
            if (topCajeroEl) {
                topCajeroEl.textContent = `$${top.total.toFixed(2)}`;
                topCajeroEl.className = 'stat-number';
            }
            
            const topCajeroNombreEl = document.getElementById('topCajeroNombre');
            if (topCajeroNombreEl) {
                topCajeroNombreEl.innerHTML = `<i class="fas fa-crown me-1"></i> ${top.cajero}`;
            }
        } else {
            const topCajeroEl = document.getElementById('topCajero');
            if (topCajeroEl) {
                topCajeroEl.textContent = '$0';
                topCajeroEl.className = 'stat-number';
            }
            
            const topCajeroNombreEl = document.getElementById('topCajeroNombre');
            if (topCajeroNombreEl) {
                topCajeroNombreEl.innerHTML = `<i class="fas fa-user me-1"></i> Sin datos`;
            }
        }
    }
}

// ========== PAGOS MANUALES ==========
async function mostrarModalPago() {
    if (!usuarioActual) {
        mostrarAlerta('Error', 'Debes iniciar sesión', 'error');
        return;
    }
    
    // Verificar si ya tiene un pago pendiente
    const estadoPago = await verificarEstadoPago();
    if (estadoPago && estadoPago.estado === 'pendiente') {
        mostrarInstruccionesPago(estadoPago);
        return;
    }
    
    let html = `
        <div class="pago-modal">
            <h4 class="gradient-text mb-4">Renovar Suscripción</h4>
            
            <div class="row g-3">
                <div class="col-md-6">
                    <div class="plan-card ${usuarioActual.plan === 'basic' ? 'selected' : ''}" 
                         onclick="seleccionarPlan('basic')" id="planBasic">
                        <div class="plan-header">
                            <h5>Plan Básico</h5>
                            <div class="plan-price">$9.99<span class="period">/mes</span></div>
                        </div>
                        <ul class="plan-features">
                            <li><i class="fas fa-check text-success me-2"></i>Hasta 15 cajeros</li>
                            <li><i class="fas fa-check text-success me-2"></i>Cargas ilimitadas</li>
                            <li><i class="fas fa-check text-success me-2"></i>Reportes básicos</li>
                            <li><i class="fas fa-times text-danger me-2"></i>WhatsApp API</li>
                            <li><i class="fas fa-times text-danger me-2"></i>Reportes avanzados</li>
                        </ul>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="plan-card ${usuarioActual.plan === 'premium' ? 'selected' : ''}" 
                         onclick="seleccionarPlan('premium')" id="planPremium">
                        <div class="plan-header">
                            <h5>Plan Premium</h5>
                            <div class="plan-price">$19.99<span class="period">/mes</span></div>
                        </div>
                        <ul class="plan-features">
                            <li><i class="fas fa-check text-success me-2"></i>Cajeros ilimitados</li>
                            <li><i class="fas fa-check text-success me-2"></i>Cargas ilimitadas</li>
                            <li><i class="fas fa-check text-success me-2"></i>Reportes avanzados</li>
                            <li><i class="fas fa-check text-success me-2"></i>WhatsApp API</li>
                            <li><i class="fas fa-check text-success me-2"></i>Soporte prioritario</li>
                        </ul>
                    </div>
                </div>
            </div>
            
            <div class="mt-4" id="planSeleccionadoContainer" style="display: none;">
                <div class="ig-card">
                    <h6>Plan seleccionado: <span id="planSeleccionadoNombre">Básico</span></h6>
                    <p class="mb-0">Total: $<span id="planSeleccionadoPrecio">9.99</span>/mes</p>
                </div>
                
                <div class="mt-3">
                    <button class="btn btn-ig w-100" onclick="solicitarPago()">
                        <i class="fas fa-credit-card me-2"></i> Generar Código de Pago
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'modalPago';
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content ig-card">
                <div class="modal-header ig-card-header">
                    <h5 class="modal-title gradient-text">
                        <i class="fas fa-credit-card me-2"></i>Renovar Plan
                    </h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body ig-card-body">
                    ${html}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Show modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    
    // Clean up modal on close
    modal.addEventListener('hidden.bs.modal', function () {
        document.body.removeChild(modal);
    });
    
    // Seleccionar plan actual por defecto
    seleccionarPlan(usuarioActual.plan);
}

let planSeleccionado = 'basic';

function seleccionarPlan(plan) {
    planSeleccionado = plan;
    
    // Actualizar UI
    document.querySelectorAll('.plan-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    const planCard = document.getElementById(`plan${plan.charAt(0).toUpperCase() + plan.slice(1)}`);
    if (planCard) {
        planCard.classList.add('selected');
    }
    
    // Mostrar resumen
    const container = document.getElementById('planSeleccionadoContainer');
    const nombre = document.getElementById('planSeleccionadoNombre');
    const precio = document.getElementById('planSeleccionadoPrecio');
    
    if (container && nombre && precio) {
        container.style.display = 'block';
        nombre.textContent = plan === 'basic' ? 'Básico' : 'Premium';
        precio.textContent = plan === 'basic' ? '10000' : '20000';
    }
}

async function solicitarPago() {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/pagos/solicitar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: planSeleccionado })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Cerrar modal de selección
            const modal = document.getElementById('modalPago');
            if (modal) {
                const bsModal = bootstrap.Modal.getInstance(modal);
                if (bsModal) {
                    bsModal.hide();
                }
            }
            
            // Mostrar instrucciones de pago
            mostrarInstruccionesPago(data.data);
            
        } else {
            mostrarAlerta('Error', data.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error', 'No se pudo generar el código de pago', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function mostrarInstruccionesPago(datosPago) {
    // Formatear número de WhatsApp
    const whatsappNumero = datosPago.whatsapp_admin.replace(/\D/g, '');
    const mensajeCodificado = encodeURIComponent(datosPago.mensaje_whatsapp);
    const whatsappLink = `https://wa.me/${whatsappNumero}?text=${mensajeCodificado}`;
    
    let html = `
        <div class="instrucciones-pago">
            <h4 class="gradient-text mb-4">Instrucciones de Pago</h4>
            
            <div class="alert alert-info mb-4">
                <i class="fas fa-info-circle me-2"></i>
                <strong>Importante:</strong> Conserva este código durante todo el proceso
            </div>
            
            <div class="ig-card mb-3">
                <div class="text-center">
                    <div class="codigo-pago">
                        <h2 class="gradient-text">${datosPago.codigo}</h2>
                        <small class="text-muted">CÓDIGO DE PAGO</small>
                    </div>
                </div>
            </div>
            
            <div class="row g-3">
                <div class="col-md-6">
                    <div class="ig-card h-100">
                        <h6><i class="fas fa-bank me-2"></i>Datos Bancarios</h6>
                        <table class="table table-sm table-borderless">
                            <tr><td>Banco:</td><td><strong>${datosPago.banco_nombre}</strong></td></tr>
                            <tr><td>Cuenta:</td><td><strong>${datosPago.banco_cuenta}</strong></td></tr>
                            <tr><td>Titular:</td><td><strong>${datosPago.banco_titular}</strong></td></tr>
                            <tr><td>Monto:</td><td><strong>$${datosPago.monto}</strong></td></tr>
                            <tr><td>Plan:</td><td><strong>${datosPago.plan}</strong></td></tr>
                        </table>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="ig-card h-100">
                        <h6><i class="fab fa-whatsapp me-2"></i>Envía Comprobante</h6>
                        <p class="small">Después de transferir, envía el screenshot:</p>
                        <a href="${whatsappLink}" 
                           class="btn btn-success w-100 mb-2"
                           target="_blank">
                            <i class="fab fa-whatsapp me-2"></i> Abrir WhatsApp
                        </a>
                        <p class="mt-2 small text-muted">
                            <i class="fas fa-lightbulb me-1"></i>
                            El enlace ya incluye tu código: <code>${datosPago.codigo}</code>
                        </p>
                    </div>
                </div>
            </div>
            
            <div class="mt-4">
                <div class="ig-card">
                    <h6><i class="fas fa-clock me-2"></i>Seguimiento</h6>
                    <p class="small mb-2">Puedes verificar el estado de tu pago:</p>
                    <button class="btn btn-ig-outline w-100" onclick="verificarEstadoPago(true)">
                        <i class="fas fa-sync-alt me-2"></i> Verificar Estado
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'modalInstruccionesPago';
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered modal-lg">
            <div class="modal-content ig-card">
                <div class="modal-header ig-card-header">
                    <h5 class="modal-title gradient-text">
                        <i class="fas fa-credit-card me-2"></i>Instrucciones de Pago
                    </h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body ig-card-body">
                    ${html}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                    <button type="button" class="btn btn-ig" onclick="copiarCodigo('${datosPago.codigo}')">
                        <i class="fas fa-copy me-2"></i> Copiar Código
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Show modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    
    // Clean up modal on close
    modal.addEventListener('hidden.bs.modal', function () {
        document.body.removeChild(modal);
    });
}

function copiarCodigo(codigo) {
    navigator.clipboard.writeText(codigo).then(() => {
        mostrarAlerta('Copiado', `Código ${codigo} copiado al portapapeles`, 'success');
    }).catch(err => {
        console.error('Error copiando:', err);
    });
}

async function verificarEstadoPago(mostrarAlerta = false) {
    try {
        const response = await fetch(`${API_BASE}/api/pagos/estado`);
        const data = await response.json();
        
        if (data.success) {
            if (data.data) {
                if (mostrarAlerta) {
                    let mensaje = `Estado: ${data.data.estado.toUpperCase()}\n`;
                    mensaje += `Código: ${data.data.codigo}\n`;
                    mensaje += `Monto: $${data.data.monto}\n`;
                    mensaje += `Plan: ${data.data.plan}\n`;
                    
                    if (data.data.estado === 'verificado') {
                        mensaje += `Verificado: ${new Date(data.data.fecha_verificacion).toLocaleString()}`;
                        mostrarAlerta('✅ Pago Verificado', mensaje, 'success');
                    } else {
                        mostrarAlerta('⏳ Pago Pendiente', mensaje, 'info');
                    }
                }
                return data.data;
            }
            return null;
        }
    } catch (error) {
        console.error('Error verificando estado:', error);
        if (mostrarAlerta) {
            mostrarAlerta('Error', 'No se pudo verificar el estado del pago', 'error');
        }
    }
    return null;
}

// ========== PANEL ADMIN ==========
async function mostrarPanelAdmin() {
    if (!usuarioActual || usuarioActual.email !== 'admin@redcajeros.com') {
        mostrarAlerta('Error', 'Acceso denegado', 'error');
        return;
    }
    
    window.location.href = '/admin';
}

async function cargarPagosPendientes() {
    try {
        const response = await fetch(`${API_BASE}/api/admin/pagos/pendientes`);
        const data = await response.json();
        
        if (data.success) {
            return data.data;
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error cargando pagos pendientes:', error);
        return [];
    }
}

async function verificarPagoAdmin(codigo) {
    if (!confirm(`¿Verificar pago ${codigo}?`)) return;
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/admin/pagos/verificar/${codigo}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlerta('✅ Verificado', data.message, 'success');
            // Recargar lista
            if (window.location.pathname === '/admin') {
                location.reload();
            }
        } else {
            mostrarAlerta('Error', data.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error', 'No se pudo verificar el pago', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function rechazarPagoAdmin(codigo) {
    if (!confirm(`¿Rechazar pago ${codigo}?`)) return;
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/admin/pagos/rechazar/${codigo}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlerta('Rechazado', 'Pago rechazado', 'success');
            // Recargar lista
            if (window.location.pathname === '/admin') {
                location.reload();
            }
        } else {
            mostrarAlerta('Error', data.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error', 'No se pudo rechazar el pago', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// ========== FUNCIONES EXISTENTES (MANTENIDAS) ==========
async function pagarCajero(cajeroId, cajeroNombre) {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/resumen/pendientes`);
        const data = await response.json();
        
        if (!data.success) {
            mostrarAlerta('Error', 'No se pudo obtener los pendientes', 'error');
            mostrarLoading(false);
            return;
        }
        
        const cajeroPendiente = data.data.find(c => c.cajero_id === cajeroId);
        const pendiente = cajeroPendiente ? cajeroPendiente.total : 0;
        
        mostrarLoading(false);
        
        if (pendiente <= 0) {
            mostrarAlerta('Sin pendientes', `${cajeroNombre} no tiene comisiones pendientes`, 'info');
            return;
        }
        
        const monto = prompt(
            `${cajeroNombre}\n\nPendiente: $${pendiente.toFixed(2)}\n\n¿Cuánto va a pagar?\n(Deje en blanco para pagar todo):`,
            pendiente.toFixed(2)
        );
        
        if (monto === null) return;
        
        let montoNum;
        if (monto.trim() === '') {
            montoNum = pendiente;
        } else {
            montoNum = parseFloat(monto);
        }
        
        if (isNaN(montoNum) || montoNum < 0) {
            mostrarAlerta('Error', 'Ingrese un monto válido', 'error');
            return;
        }
        
        if (montoNum > pendiente) {
            mostrarAlerta('Error', `El monto no puede superar el pendiente ($${pendiente.toFixed(2)})`, 'error');
            return;
        }
        
        mostrarLoading(true);
        
        const pagoResponse = await fetch(`${API_BASE}/api/pagos`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                cajero_id: cajeroId,
                monto_pagado: montoNum,
                notas: `Pago registrado desde la interfaz web`
            })
        });
        
        const pagoData = await pagoResponse.json();
        
        if (pagoData.success) {
            mostrarAlerta('✅ Pago Registrado', 
                `Se pagó $${montoNum.toFixed(2)} a ${cajeroNombre}`, 
                'success');
            
            // Recargar datos
            const [nuevoResumen, nuevasCargas, nuevasEstadisticas] = await Promise.all([
                cargarResumen(),
                cargarCargas(),
                cargarEstadisticas()
            ]);
            
            resumen = nuevoResumen;
            cargas = nuevasCargas;
            estadisticas = nuevasEstadisticas;
            
            actualizarTablaResumen();
            actualizarTablaCargas();
            calcularEstadisticas();
            actualizarContadores();
            
        } else {
            mostrarAlerta('Error', pagoData.error || 'No se pudo registrar el pago', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error de conexión', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function verPendientes() {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/resumen/pendientes`);
        const data = await response.json();
        
        if (!data.success) {
            mostrarAlerta('Error', data.error || 'No se pudieron cargar los pendientes', 'error');
            mostrarLoading(false);
            return;
        }
        
        const pendientes = data.data.filter(c => c.total > 0);
        
        if (pendientes.length === 0) {
            mostrarAlerta('✅ Todo al día', 'No hay comisiones pendientes de pago', 'success');
            mostrarLoading(false);
            return;
        }
        
        let html = `
            <div class="pendientes-modal">
                <h4 class="gradient-text">Comisiones Pendientes</h4>
                <div class="table-responsive mt-3">
                    <table class="table table-ig table-sm">
                        <thead>
                            <tr>
                                <th>Cajero</th>
                                <th class="text-end">Total</th>
                                <th class="text-end">Cargas</th>
                                <th class="text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        pendientes.forEach(cajero => {
            html += `
                <tr>
                    <td>${cajero.cajero}</td>
                    <td class="text-end fw-bold text-warning">$${cajero.total.toFixed(2)}</td>
                    <td class="text-end">${cajero.cargas}</td>
                    <td class="text-center">
                        <button class="btn btn-success btn-sm" onclick="pagarCajero(${cajero.cajero_id}, '${cajero.cajero.replace(/'/g, "\\'")}')">
                            <i class="fas fa-money-bill-wave"></i> Pagar
                        </button>
                    </td>
                </tr>
            `;
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'modalPendientes';
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content ig-card">
                    <div class="modal-header ig-card-header">
                        <h5 class="modal-title gradient-text">
                            <i class="fas fa-clock me-2"></i>Pendientes de Pago
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body ig-card-body">
                        ${html}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        
        modal.addEventListener('hidden.bs.modal', function () {
            document.body.removeChild(modal);
        });
        
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error', 'No se pudo cargar los pendientes', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function exportarReporte() {
    const fechaInicio = document.getElementById('fechaInicio').value;
    const fechaFin = document.getElementById('fechaFin').value;
    
    let url = `${API_BASE}/api/exportar/pdf`;
    
    if (fechaInicio && fechaFin) {
        url += `?fecha_inicio=${encodeURIComponent(fechaInicio)}&fecha_fin=${encodeURIComponent(fechaFin)}&tipo_reporte=general`;
    } else {
        url += '?tipo_reporte=general';
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(url);
        
        if (response.ok) {
            const blob = await response.blob();
            const urlBlob = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = urlBlob;
            link.download = `reporte_redcajeros_${new Date().toISOString().slice(0,10)}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(urlBlob);
            
            mostrarAlerta('Exportado', 'Reporte descargado correctamente', 'success');
        } else {
            const data = await response.json();
            mostrarAlerta('Error', data.error || 'No se pudo exportar', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error', 'No se pudo generar el reporte', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function agregarCargaDesdeModal() {
    const cajeroId = document.getElementById('modalSelectCajero')?.value;
    const plataforma = document.getElementById('modalPlataforma')?.value;
    const monto = document.getElementById('modalMonto')?.value;
    const nota = document.getElementById('modalNota')?.value || '';

    if (!cajeroId) {
        mostrarAlerta('Seleccione cajero', 'Debe seleccionar un cajero de la lista', 'warning');
        return;
    }
    if (!monto || Number(monto) <= 0) {
        mostrarAlerta('Monto inválido', 'Ingrese un monto válido', 'warning');
        return;
    }

    mostrarLoading(true);
    try {
        const response = await fetch(`${API_BASE}/api/cargas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cajero_id: parseInt(cajeroId, 10),
                plataforma,
                monto: parseFloat(monto),
                nota
            })
        });
        const data = await response.json();
        if (data.success) {
            mostrarAlerta('¡Éxito!', 'Carga registrada correctamente', 'success');
            await cargarDatosIniciales();
            const modalEl = document.getElementById('modalCarga');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo registrar la carga', 'error');
        }
    } catch (error) {
        console.error('Error registrando carga:', error);
        mostrarAlerta('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function descargarReporte(tipo) {
    const url = `${API_BASE}/api/exportar/pdf?tipo_reporte=${encodeURIComponent(tipo)}`;
    mostrarLoading(true);
    try {
        const response = await fetch(url);
        if (response.ok) {
            const blob = await response.blob();
            const urlBlob = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = urlBlob;
            link.download = `reporte_${tipo}_${new Date().toISOString().slice(0,10)}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(urlBlob);
            mostrarAlerta('Exportado', `Reporte ${tipo} descargado correctamente`, 'success');
        } else {
            const data = await response.json();
            mostrarAlerta('Error', data.error || 'No se pudo exportar', 'error');
        }
    } catch (error) {
        console.error('Error descargando reporte:', error);
        mostrarAlerta('Error', 'No se pudo generar el reporte', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function mostrarReporteDiario() {
    descargarReporte('diario');
}

function mostrarReporteSemanal() {
    descargarReporte('semanal');
}

function mostrarReporteMensual() {
    descargarReporte('mensual');
}

// ========== FUNCIONES GLOBALES ==========
window.actualizarTodo = cargarDatosIniciales;
window.agregarCajero = agregarCajero;
window.agregarCarga = agregarCarga;
window.editarCajero = editarCajero;
window.eliminarCajero = eliminarCajero;
window.eliminarCarga = eliminarCarga;
window.filtrarCargas = async function() {
    const fechaInicio = document.getElementById('fechaInicio').value;
    const fechaFin = document.getElementById('fechaFin').value;
    
    if (!fechaInicio || !fechaFin) {
        mostrarAlerta('Fechas incompletas', 'Debe seleccionar ambas fechas', 'warning');
        return;
    }
    
    mostrarLoading(true);
    
    try {
        cargas = await cargarCargas(fechaInicio, fechaFin);
        actualizarTablaCargas();
        
        const inicio = new Date(fechaInicio).toLocaleDateString('es-ES');
        const fin = new Date(fechaFin).toLocaleDateString('es-ES');
        mostrarAlerta('Filtro aplicado', 
            `Mostrando cargas desde ${inicio} hasta ${fin}`, 
            'info');
    } catch (error) {
        mostrarAlerta('Error', 'No se pudieron filtrar las cargas', 'error');
    } finally {
        mostrarLoading(false);
    }
};

window.limpiarFiltro = async function() {
    document.getElementById('fechaInicio').value = '';
    document.getElementById('fechaFin').value = '';
    
    mostrarLoading(true);
    
    try {
        cargas = await cargarCargas();
        actualizarTablaCargas();
        mostrarAlerta('Filtro limpiado', 'Mostrando todas las cargas', 'info');
    } catch (error) {
        mostrarAlerta('Error', 'No se pudieron cargar las cargas', 'error');
    } finally {
        mostrarLoading(false);
    }
};

window.exportarReporte = exportarReporte;
window.mostrarEstadisticas = function() {
    if (cargas.length === 0) {
        mostrarAlerta('Sin datos', 'No hay cargas registradas', 'warning');
        return;
    }
    
    const total = resumen.reduce((sum, item) => sum + item.total, 0);
    mostrarAlerta('Estadísticas', 
        `Total pendiente: $${total.toFixed(2)}\nCargas totales: ${cargas.length}\nCajeros activos: ${cajeros.filter(c => c.activo).length}`, 
        'info');
};

window.mostrarModalPago = mostrarModalPago;
window.pagarCajero = pagarCajero;
window.verPendientes = verPendientes;
window.diagnostico = diagnostico;
window.forzarOcultarLoading = forzarOcultarLoading;
window.cerrarAlerta = cerrarAlerta;
window.login = login;
window.register = register;
window.logout = logout;
window.mostrarPanelAdmin = mostrarPanelAdmin;
window.verificarPagoAdmin = verificarPagoAdmin;
window.rechazarPagoAdmin = rechazarPagoAdmin;
window.seleccionarPlan = seleccionarPlan;
window.solicitarPago = solicitarPago;
window.verificarEstadoPago = verificarEstadoPago;
window.copiarCodigo = copiarCodigo;
window.mostrarSeccion = mostrarSeccion;
window.mostrarModalCajeros = mostrarModalCajeros;
window.mostrarModalCarga = mostrarModalCarga;
window.mostrarModalReportes = mostrarModalReportes;
window.agregarCajeroDesdeModal = agregarCajeroDesdeModal;
window.eliminarCajeroCompleto = eliminarCajeroCompleto;
window.agregarCargaDesdeModal = agregarCargaDesdeModal;
window.mostrarReporteDiario = mostrarReporteDiario;
window.mostrarReporteSemanal = mostrarReporteSemanal;
window.mostrarReporteMensual = mostrarReporteMensual;

// Auto-hide loading after 20 seconds
setTimeout(() => {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay && overlay.classList.contains('active')) {
        console.warn('⚠️ Emergency: Hiding loading overlay after 20 seconds');
        forzarOcultarLoading();
    }
}, 20000);
