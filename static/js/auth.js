// auth.js - Sistema de autenticación para RedCajeros

// Variables globales
let currentUser = null;
let userSubscription = null;
const AVATAR_OPCIONES = ['😎', '😊', '🧑', '👩‍💼', '🧔', '👩‍🎨', '🤓', '🚀', '🍳', '🧑‍', '🦊', '🐼', '🐸','🧙‍♂️', '🧙‍♀️', '🐲', '🧛','🧟', '🧝‍♂️', '🦄','⚔️','🕹️','👾','🛸', '🤖',];
let planesPublicos = null;

function buildFallbackPlanesConfig() {
    return {
        lite: {
            nombre: 'Lite',
            precio: 10000,
            features: [
                { text: 'Hasta 15 cajeros', included: true },
                { text: 'Cargas ilimitadas', included: true },
                { text: 'Reportes básicos', included: true },
                { text: 'WhatsApp API', included: false },
                { text: 'Reportes avanzados', included: false }
            ]
        },
        pro: {
            nombre: 'Pro',
            precio: 20000,
            features: [
                { text: 'Cajeros ilimitados', included: true },
                { text: 'Cargas ilimitadas', included: true },
                { text: 'Reportes avanzados', included: true },
                { text: 'WhatsApp API', included: true },
                { text: 'Soporte prioritario', included: true }
            ]
        }
    };
}

async function obtenerPlanesPublicos(forceRefresh = false) {
    if (planesPublicos && !forceRefresh) return planesPublicos;
    try {
        const response = await fetch('/api/planes');
        const data = await response.json();
        if (data.success) {
            planesPublicos = data.data;
            return planesPublicos;
        }
    } catch (error) {
        console.error('Error cargando planes:', error);
    }
    planesPublicos = buildFallbackPlanesConfig();
    return planesPublicos;
}

function formatPrice(value) {
    const parsed = parseFloat(value);
    if (!Number.isFinite(parsed)) return value;
    return parsed.toFixed(2);
}

function renderPlanFeatures(features) {
    return (features || []).map(feature => {
        const iconClass = feature.included ? 'fa-check text-success' : 'fa-times text-danger';
        return `<li><i class="fas ${iconClass} me-2"></i> ${feature.text}</li>`;
    }).join('');
}

function getPlanLabel(plan) {
    if (!plan) return '';
    if (plan === 'basic') return 'Lite';
    if (plan === 'premium') return 'Pro';
    if (plan === 'trial') return 'Prueba';
    if (plan === 'expired') return 'Expirado';
    if (plan === 'admin') return 'Admin';
    return plan.toUpperCase();
}

window.obtenerPlanesPublicos = obtenerPlanesPublicos;

// ========== FUNCIONES DE AUTENTICACIÓN ==========

async function login(event = null) {
    if (event) event.preventDefault();
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        mostrarAlertaAuth('Error', 'Por favor completa todos los campos', 'error');
        return false;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Guardar usuario en localStorage
            localStorage.setItem('redcajeros_user', JSON.stringify(data.user));
            currentUser = data.user;
            
            // Redirigir según rol
            if (data.user.rol === 'admin') {
                window.location.href = '/admin';
            } else {
                window.location.href = '/dashboard';
            }
        } else {
            if (data.code === 'SUBSCRIPTION_EXPIRED') {
                // Suscripción expirada, permitir login pero mostrar advertencia
                localStorage.setItem('redcajeros_user', JSON.stringify(data.user));
                currentUser = data.user;
                window.location.href = '/dashboard';
            } else {
                mostrarAlertaAuth('Error', data.error || 'Credenciales incorrectas', 'error');
            }
        }
    } catch (error) {
        console.error('Error en login:', error);
        mostrarAlertaAuth('Error de conexión', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
    
    return false;
}

async function register(event = null) {
    if (event) event.preventDefault();
    
    const nombre = document.getElementById('registerNombre').value.trim();
    const email = document.getElementById('registerEmail').value.trim().toLowerCase();
    const password = document.getElementById('registerPassword').value;
    const telefono = document.getElementById('registerTelefono').value.trim();
    
    // Validaciones
    if (!nombre || !email || !password) {
        mostrarAlertaAuth('Error', 'Por favor completa los campos obligatorios', 'error');
        return false;
    }
    
    if (password.length < 6) {
        mostrarAlertaAuth('Error', 'La contraseña debe tener al menos 6 caracteres', 'error');
        return false;
    }
    
    if (!validateEmail(email)) {
        mostrarAlertaAuth('Error', 'Por favor ingresa un email válido', 'error');
        return false;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, email, password, telefono })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlertaAuth('¡Éxito!', 'Cuenta creada correctamente. Redirigiendo...', 'success');
            
            // Guardar usuario y redirigir
            localStorage.setItem('redcajeros_user', JSON.stringify(data.user));
            currentUser = data.user;
            
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 2000);
        } else {
            mostrarAlertaAuth('Error', data.error || 'No se pudo crear la cuenta', 'error');
        }
    } catch (error) {
        console.error('Error en registro:', error);
        mostrarAlertaAuth('Error de conexión', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
    
    return false;
}

// Reemplaza la función logout en static/js/auth.js
async function logout() {
    try {
        await fetch('/api/auth/logout');
    } catch (error) {
        console.error('Error cerrando sesión:', error);
    } finally {
        // Limpiamos todas las posibles claves usadas
        localStorage.removeItem('redcajeros_user');
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        
        // Redirigir al inicio
        window.location.href = '/login';
    }
}

// ========== FUNCIONES DE USUARIO ==========

async function checkAuth() {
    const userData = localStorage.getItem('redcajeros_user');

    if (!userData) {
        try {
            const response = await fetch('/api/auth/me', { credentials: 'include' });
            const data = await response.json();

            if (data.success) {
                localStorage.setItem('redcajeros_user', JSON.stringify(data.user));
                currentUser = data.user;
                return currentUser;
            }
        } catch (error) {
            console.warn('No se pudo verificar con servidor, usando datos locales');
        }

        // No hay usuario, redirigir a login
        if (!window.location.pathname.includes('/login') && 
            !window.location.pathname.includes('/register')) {
            window.location.href = '/login';
        }
        return null;
    }
    
    try {
        currentUser = JSON.parse(userData);
        
        // VERIFICAR CON EL SERVIDOR que el usuario aún es válido
        try {
            const response = await fetch('/api/auth/me', { credentials: 'include' });
            const data = await response.json();
            
            if (data.success) {
                // Usuario válido, actualizar datos
                localStorage.setItem('redcajeros_user', JSON.stringify(data.user));
                currentUser = data.user;
                return currentUser;
            } else {
                // Token inválido, forzar logout (marcar origen para evitar loop login↔dashboard)
                localStorage.removeItem('redcajeros_user');
                sessionStorage.setItem('auth_redirect_from_dashboard', '1');
                window.location.href = '/login';
                return null;
            }
        } catch (error) {
            // Si hay error de conexión, usar datos locales
            console.warn('No se pudo verificar con servidor, usando datos locales');
            return currentUser;
        }
        
    } catch (error) {
        console.error('Error parsing user data:', error);
        localStorage.removeItem('redcajeros_user');
        sessionStorage.setItem('auth_redirect_from_dashboard', '1');
        window.location.href = '/login';
        return null;
    }
}

// AGREGAR esta nueva función para verificar autenticación asíncrona
async function verifyAuth() {
    try {
        const response = await fetch('/api/auth/me', { credentials: 'include' });
        const data = await response.json();
        
        if (data.success) {
            // Actualizar localStorage con datos frescos
            localStorage.setItem('redcajeros_user', JSON.stringify(data.user));
            currentUser = data.user;
            return data.user;
        } else {
            // Token inválido, forzar logout (marcar para evitar loop)
            localStorage.removeItem('redcajeros_user');
            if (!window.location.pathname.includes('/login') && 
                !window.location.pathname.includes('/register')) {
                sessionStorage.setItem('auth_redirect_from_dashboard', '1');
                window.location.href = '/login';
            }
            return null;
        }
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        return null;
    }
}


async function cargarDatosUsuario() {
    try {
        const response = await fetch('/api/auth/me', { credentials: 'include' });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Actualizar localStorage con datos frescos
            localStorage.setItem('redcajeros_user', JSON.stringify(data.user));
            currentUser = data.user;
            
            // Actualizar UI
            actualizarUIUsuario(data.user);
            
            return data.user;
        } else {
            // Token inválido, forzar logout COMPLETO
            console.warn('⚠️ Sesión inválida, forzando logout');
            localStorage.removeItem('redcajeros_user');
            localStorage.removeItem('user'); // Por si acaso usaste esta clave antes
            currentUser = null;
            
            // Solo redirigir si NO estamos ya en login
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
            return null;
        }
    } catch (error) {
        console.error('Error cargando datos de usuario:', error);
        
        // No redirigir en error de red, solo mostrar warning
        console.warn('⚠️ No se pudo verificar sesión, usando datos locales');
        
        // Intentar usar datos locales
        const localUser = localStorage.getItem('redcajeros_user') || localStorage.getItem('user');
        if (localUser) {
            try {
                currentUser = JSON.parse(localUser);
                actualizarUIUsuario(currentUser);
                return currentUser;
            } catch (e) {
                console.error('Error parseando usuario local:', e);
            }
        }
        
        return null;
    }
}

function actualizarUIUsuario(user) {
    if (!user) {
        console.warn('⚠️ actualizarUIUsuario: user es undefined');
        return;
    }
    
    // Actualizar elementos de UI si existen - CON VERIFICACIÓN
    const userNameElements = document.querySelectorAll('#userName, .user-name');
    const userEmailElements = document.querySelectorAll('#userEmail, .user-email');
    const userPlanElements = document.querySelectorAll('#userPlan, .user-plan');
    const userAvatarElements = document.querySelectorAll('#userAvatar, .user-avatar');
    
    userNameElements.forEach(el => {
        if (el && user.nombre) {
            el.textContent = user.nombre;
        } else if (el && user.email) {
            el.textContent = user.email.split('@')[0];
        }
    });
    
    userEmailElements.forEach(el => {
        if (el && user.email) {
            el.textContent = user.email;
        }
    });
    
    userPlanElements.forEach(el => {
        if (el && user.plan) {
            el.textContent = `Plan: ${getPlanLabel(user.plan)}`;
        }
    });

    userAvatarElements.forEach(el => {
        if (el) {
            el.textContent = user.avatar || AVATAR_OPCIONES[0];
        }
    });
    
    // Actualizar estado de suscripción si existe
    if (document.getElementById('planInfo')) {
        actualizarEstadoSuscripcionUI(user);
    }
}

function actualizarEstadoSuscripcionUI(user) {
    const planInfo = document.getElementById('planInfo');
    const expirationInfo = document.getElementById('expirationInfo');
    const upgradeButton = document.getElementById('upgradeButton');
    
    if (!planInfo || !expirationInfo || !upgradeButton) return;
    
    let planText = '';
    let expirationText = '';
    let buttonText = '';
    let buttonClass = 'btn-ig';
    
    if (user.plan === 'trial') {
        planText = `Prueba gratuita (${user.plan})`;
        if (user.expiracion) {
            const expDate = new Date(user.expiracion);
            const hoy = new Date();
            const diasRestantes = Math.ceil((expDate - hoy) / (1000 * 60 * 60 * 24));
            expirationText = `${diasRestantes} días restantes`;
            
            if (diasRestantes <= 3) {
                expirationText = `⚠️ ${diasRestantes} días restantes`;
            }
        }
        buttonText = 'Actualizar Plan';
    } else if (user.plan === 'expired') {
        planText = 'Suscripción expirada';
        expirationText = '¡Renueva para continuar!';
        buttonText = 'Renovar Ahora';
        buttonClass = 'btn btn-danger';
        
        // Mostrar advertencia
        if (!document.querySelector('.subscription-expired-alert')) {
            const alertDiv = document.createElement('div');
            alertDiv.className = 'alert alert-danger subscription-expired-alert';
            alertDiv.innerHTML = `
                <i class="hugeicons hugeicons-exclamation-triangle me-2"></i>
                <strong>Tu suscripción ha expirado.</strong> 
                Renueva para continuar usando RedCajeros.
            `;
            
            const alertContainer = document.getElementById('alertContainer');
            if (alertContainer) {
                alertContainer.prepend(alertDiv);
            }
        }
    } else if (user.plan === 'admin') {
        planText = 'Administrador';
        expirationText = 'Acceso completo';
        buttonText = 'Panel Admin';
        buttonClass = 'btn btn-warning';
    } else {
        planText = `Plan: ${getPlanLabel(user.plan)}`;
        if (user.expiracion) {
            const expDate = new Date(user.expiracion);
            expirationText = `Expira: ${expDate.toLocaleDateString()}`;
        }
        buttonText = 'Actualizar';
    }
    
    planInfo.textContent = planText;
    expirationInfo.innerHTML = `<i class="hugeicons hugeicons-calendar me-1"></i> ${expirationText}`;
    upgradeButton.textContent = buttonText;
    upgradeButton.className = `btn btn-sm ${buttonClass}`;
    
    // Actualizar footer
    const footerPlan = document.getElementById('footerPlan');
    if (footerPlan) {
        footerPlan.textContent = getPlanLabel(user.plan);
    }
}

// ========== SISTEMA DE PAGOS MANUALES ==========

async function solicitarPagoManual(plan = 'basic') {
    if (!currentUser) {
        mostrarAlerta('Error', 'Debes iniciar sesión primero', 'error');
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch('/api/pagos/solicitar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarModalPagoManual(data.data);
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo generar la solicitud de pago', 'error');
        }
    } catch (error) {
        console.error('Error solicitando pago:', error);
        mostrarAlerta('Error de conexión', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function mostrarModalPagoManual(pagoData) {
    const modalHtml = `
        <div class="modal fade" id="modalPagoManual" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content ig-card">
                    <div class="modal-header ig-card-header">
                        <h5 class="modal-title gradient-text">
                            <i class="hugeicons hugeicons-money-bill-wave me-2"></i>Instrucciones de Pago
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body ig-card-body">
                        <div class="alert alert-info mb-3">
                            <i class="hugeicons hugeicons-info-circle me-2"></i>
                            <strong>Importante:</strong> Guarda tu código <code>${pagoData.codigo}</code>
                        </div>
                        
                        <h6 class="mb-3"><i class="hugeicons hugeicons-list-ol me-2"></i>Pasos a seguir:</h6>
                        <ol class="mb-4">
                            <li>Transfiere <strong>$${pagoData.monto}</strong> a la cuenta bancaria</li>
                            <li>Toma screenshot del comprobante</li>
                            <li>Envía el screenshot por WhatsApp con tu código</li>
                            <li>Tu cuenta se activará en minutos</li>
                        </ol>
                        
                        <h6 class="mb-3"><i class="hugeicons hugeicons-university me-2"></i>Datos Bancarios:</h6>
                        <div class="ig-card mb-3">
                            <div class="p-3">
                                <div class="mb-2">
                                    <small class="text-muted">Banco:</small>
                                    <div class="fw-bold">${pagoData.banco_nombre}</div>
                                </div>
                                <div class="mb-2">
                                    <small class="text-muted">Cuenta:</small>
                                    <div class="fw-bold">${pagoData.banco_cuenta}</div>
                                </div>
                                <div class="mb-2">
                                    <small class="text-muted">Titular:</small>
                                    <div class="fw-bold">${pagoData.banco_titular}</div>
                                </div>
                                <div>
                                    <small class="text-muted">Código de pago:</small>
                                    <div class="fw-bold text-warning">${pagoData.codigo}</div>
                                </div>
                            </div>
                        </div>
                        
                        <h6 class="mb-3"><i class="hugeicons hugeicons-whatsapp me-2"></i>Envía Comprobante:</h6>
                        <a href="${pagoData.whatsapp_url}" 
                           class="btn btn-success w-100 mb-2" 
                           target="_blank">
                            <i class="hugeicons hugeicons-whatsapp hugeicons-lg me-2"></i>
                            Abrir WhatsApp
                        </a>
                        <p class="text-muted small mb-0">
                            <i class="hugeicons hugeicons-lightbulb me-1"></i>
                            Si no tienes WhatsApp en este dispositivo, envía al número: 
                            <strong>${pagoData.whatsapp_numero}</strong>
                        </p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                        <button type="button" class="btn btn-ig" onclick="copiarDatosPago()">
                            <i class="hugeicons hugeicons-copy me-2"></i> Copiar Datos
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Crear modal dinámico
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('modalPagoManual'));
    modal.show();
    
    // Limpiar al cerrar
    modalContainer.querySelector('#modalPagoManual').addEventListener('hidden.bs.modal', function () {
        document.body.removeChild(modalContainer);
    });
}

function copiarDatosPago() {
    const modal = document.getElementById('modalPagoManual');
    if (!modal) return;
    
    const datos = `Datos para pago RedCajeros:
    
Banco: ${modal.querySelector('.fw-bold:nth-child(1)').textContent}
Cuenta: ${modal.querySelector('.fw-bold:nth-child(2)').textContent}
Titular: ${modal.querySelector('.fw-bold:nth-child(3)').textContent}
Código: ${modal.querySelector('.text-warning').textContent}

Envía comprobante por WhatsApp.`;
    
    navigator.clipboard.writeText(datos)
        .then(() => {
            mostrarAlerta('¡Copiado!', 'Los datos se copiaron al portapapeles', 'success');
        })
        .catch(() => {
            // Fallback para navegadores antiguos
            const textarea = document.createElement('textarea');
            textarea.value = datos;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            mostrarAlerta('¡Copiado!', 'Los datos se copiaron al portapapeles', 'success');
        });
}

async function verMisSolicitudesPago() {
    if (!currentUser) return;
    
    mostrarLoading(true);
    
    try {
        const response = await fetch('/api/pagos/mis-solicitudes');
        const data = await response.json();
        
        if (data.success) {
            mostrarModalMisSolicitudes(data.data);
        } else {
            mostrarAlerta('Error', data.error || 'No se pudieron cargar las solicitudes', 'error');
        }
    } catch (error) {
        console.error('Error cargando solicitudes:', error);
        mostrarAlerta('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function mostrarModalMisSolicitudes(solicitudes) {
    let html = `
        <div class="modal fade" id="modalMisSolicitudes" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content ig-card">
                    <div class="modal-header ig-card-header">
                        <h5 class="modal-title gradient-text">
                            <i class="hugeicons hugeicons-history me-2"></i>Mis Solicitudes de Pago
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body ig-card-body">
    `;
    
    if (solicitudes.length === 0) {
        html += `
            <div class="text-center py-5">
                <i class="hugeicons hugeicons-inbox hugeicons-3x text-muted mb-3"></i>
                <h6>No tienes solicitudes de pago</h6>
                <p class="text-muted">Cuando solicites un pago, aparecerá aquí.</p>
            </div>
        `;
    } else {
        html += `
            <div class="table-responsive">
                <table class="table table-ig table-sm">
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>Monto</th>
                            <th>Plan</th>
                            <th>Estado</th>
                            <th>Fecha Solicitud</th>
                            <th>Fecha Verificación</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        solicitudes.forEach(s => {
            let estadoBadge = '';
            if (s.estado === 'verificado') {
                estadoBadge = '<span class="badge bg-success">Verificado</span>';
            } else if (s.estado === 'pendiente') {
                estadoBadge = '<span class="badge bg-warning">Pendiente</span>';
            } else {
                estadoBadge = '<span class="badge bg-danger">Rechazado</span>';
            }
            
            html += `
                <tr>
                    <td><code>${s.codigo}</code></td>
                    <td>$${formatPrice(s.monto)}</td>
                    <td>${getPlanLabel(s.plan)}</td>
                    <td>${estadoBadge}</td>
                    <td>${new Date(s.fecha_solicitud).toLocaleDateString()}</td>
                    <td>${s.fecha_verificacion ? new Date(s.fecha_verificacion).toLocaleDateString() : '--'}</td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
    }
    
    html += `
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Crear modal dinámico
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = html;
    document.body.appendChild(modalContainer);
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('modalMisSolicitudes'));
    modal.show();
    
    // Limpiar al cerrar
    modalContainer.querySelector('#modalMisSolicitudes').addEventListener('hidden.bs.modal', function () {
        document.body.removeChild(modalContainer);
    });
}

function verMisSuscripciones() {
    mostrarModalSuscripcion();
}

async function mostrarModalSuscripcion() {
    const userData = localStorage.getItem('redcajeros_user');
    let currentPlan = '';
    if (userData) {
        try {
            currentPlan = JSON.parse(userData).plan || '';
        } catch (error) {
            currentPlan = '';
        }
    }

    const planes = await obtenerPlanesPublicos(true);
    const litePlan = planes.lite || buildFallbackPlanesConfig().lite;
    const proPlan = planes.pro || buildFallbackPlanesConfig().pro;

    const showUpgradeOnly = currentPlan === 'basic';
    const diferencia = Math.max(parseFloat(proPlan.precio) - parseFloat(litePlan.precio), 0);
    const premiumLabel = showUpgradeOnly
        ? `Actualizar a ${proPlan.nombre} (solo diferencia)`
        : `Seleccionar ${proPlan.nombre}`;
    const premiumPrice = showUpgradeOnly ? `$${formatPrice(diferencia)}` : `$${formatPrice(proPlan.precio)}`;
    const upgradeNote = showUpgradeOnly
        ? `<small class="text-info d-block mt-2">Pagas solo la diferencia: $${formatPrice(diferencia)}</small>`
        : '';

    const excluirTexto = ['whatsapp api', 'reportes avanzados', 'reportes básicos', 'soporte prioritario'];
    const filtrarFeatures = (features) => (features || []).filter(feature => {
        const texto = (feature.text || '').toLowerCase();
        return !excluirTexto.some(excluir => texto.includes(excluir));
    });
    const liteFeatures = filtrarFeatures(litePlan.features);
    const proFeatures = filtrarFeatures(proPlan.features);

    const modalHtml = `
        <div class="modal fade" id="modalSuscripcion" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content ig-card">
                    <div class="modal-header ig-card-header">
                        <h5 class="modal-title gradient-text">
                            <i class="hugeicons hugeicons-crown me-2"></i>Planes de RedCajeros
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body ig-card-body">
                        <div class="row">
                            ${showUpgradeOnly ? '' : `
                            <div class="col-md-6 mb-3">
                                <div class="plan-card h-100 border border-light border-opacity-10 shadow-sm">
                                    <div class="plan-header bg-primary text-center py-3">
                                        <div class="plan-icon mb-2 d-inline-flex align-items-center justify-content-center rounded-circle bg-dark bg-opacity-25" style="width: 48px; height: 48px;">
                                            <i class="fas fa-leaf fa-lg"></i>
                                        </div>
                                        <h4 class="mb-0">${litePlan.nombre}</h4>
                                        <small class="text-white-50">Ideal para empezar</small>
                                        <div class="plan-price">$${formatPrice(litePlan.precio)}<span class="plan-period">/mes</span></div>
                                    </div>
                                    <div class="plan-body pt-3 d-flex flex-column">
                                        <ul class="plan-features mb-3" style="min-height: 180px;">
                                            ${renderPlanFeatures(liteFeatures)}
                                        </ul>
                                        <div class="pt-2">
                                            <button class="btn btn-ig w-100 d-flex align-items-center justify-content-center gap-2" onclick="solicitarPagoManual('basic')">
                                                <i class="fas fa-check-circle"></i>
                                                <span>Seleccionar ${litePlan.nombre}</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            `}
                            <div class="col-md-6 mb-3">
                                <div class="plan-card h-100 border border-light border-opacity-10 shadow-sm">
                                    <div class="plan-header bg-gradient text-center py-3">
                                        <div class="plan-icon mb-2 d-inline-flex align-items-center justify-content-center rounded-circle bg-dark bg-opacity-25" style="width: 48px; height: 48px;">
                                            <i class="fas fa-rocket fa-lg"></i>
                                        </div>
                                        <h4 class="mb-0">${proPlan.nombre}</h4>
                                        <small class="text-white-50">Más crecimiento y soporte</small>
                                        <div class="plan-price">${premiumPrice}<span class="plan-period">/mes</span></div>
                                        <span class="plan-badge">Recomendado</span>
                                    </div>
                                    <div class="plan-body pt-3 d-flex flex-column">
                                        <ul class="plan-features mb-3" style="min-height: 180px;">
                                            ${renderPlanFeatures(proFeatures)}
                                        </ul>
                                        <div class="pt-2">
                                            ${upgradeNote}
                                            <button class="btn btn-ig w-100 d-flex align-items-center justify-content-center gap-2" style="background: linear-gradient(135deg, #f7d774, #e9b949); color: #1b1b1b; border: none;" onclick="solicitarPagoManual('premium')">
                                                <i class="fas fa-star"></i>
                                                <span>${premiumLabel}</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="mt-4">
                            <h6><i class="hugeicons hugeicons-question-circle me-2"></i>Preguntas Frecuentes</h6>
                            <div class="accordion" id="faqAccordion">
                                <div class="accordion-item">
                                    <h2 class="accordion-header">
                                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faq1">
                                            ¿Cómo funciona el pago manual?
                                        </button>
                                    </h2>
                                    <div id="faq1" class="accordion-collapse collapse" data-bs-parent="#faqAccordion">
                                        <div class="accordion-body">
                                            <p>1. Selecciona tu plan y genera un código único</p>
                                            <p>2. Transfiere el monto a nuestra cuenta bancaria</p>
                                            <p>3. Envía el comprobante por WhatsApp con tu código</p>
                                            <p>4. Verificamos el pago y activamos tu cuenta en minutos</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="accordion-item">
                                    <h2 class="accordion-header">
                                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faq2">
                                            ¿Puedo cancelar en cualquier momento?
                                        </button>
                                    </h2>
                                    <div id="faq2" class="accordion-collapse collapse" data-bs-parent="#faqAccordion">
                                        <div class="accordion-body">
                                            Sí, puedes cancelar cuando quieras. No hay contratos de permanencia.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                        <button type="button" class="btn btn-ig-outline" onclick="verMisSolicitudesPago()">
                            <i class="hugeicons hugeicons-history me-2"></i> Ver Mis Solicitudes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Crear modal dinámico
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('modalSuscripcion'));
    modal.show();
    
    // Limpiar al cerrar
    modalContainer.querySelector('#modalSuscripcion').addEventListener('hidden.bs.modal', function () {
        document.body.removeChild(modalContainer);
    });
}

// ========== FUNCIONES UTILITARIAS ==========

function mostrarAlertaAuth(titulo, mensaje, tipo = 'info') {
    let container = document.getElementById('authAlertContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'authAlertContainer';
        const card = document.querySelector('.auth-card');
        if (card) {
            card.insertBefore(container, card.firstChild);
        } else {
            document.body.insertBefore(container, document.body.firstChild);
        }
    }
    
    const tipos = {
        'success': 'alert-ig-success',
        'error': 'alert-ig-error',
        'warning': 'alert-ig-warning',
        'info': 'alert-ig-info'
    };
    
    const alerta = document.createElement('div');
    alerta.className = `alert-ig ${tipos[tipo]} fade-in`;
    alerta.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="hugeicons ${tipo === 'success' ? 'hugeicons-check-circle' : tipo === 'error' ? 'hugeicons-exclamation-circle' : tipo === 'warning' ? 'hugeicons-exclamation-triangle' : 'hugeicons-info-circle'} hugeicons-lg me-3"></i>
            <div class="flex-grow-1">
                <h6 class="mb-1 fw-bold">${titulo}</h6>
                <small>${mensaje}</small>
            </div>
            <button type="button" class="btn-close btn-close-white ms-2" onclick="this.parentElement.parentElement.remove()"></button>
        </div>
    `;
    
    container.innerHTML = ''; // Limpiar alertas anteriores
    container.appendChild(alerta);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alerta.parentNode) {
            alerta.remove();
        }
    }, 5000);
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function mostrarLoading(mostrar = true) {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    
    if (mostrar) {
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    } else {
        overlay.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

// ========== FUNCIONES DE PERFIL ==========

function obtenerUsuarioLocal() {
    const localUser = localStorage.getItem('redcajeros_user') || localStorage.getItem('user');
    if (!localUser) return null;
    try {
        return JSON.parse(localUser);
    } catch (error) {
        console.error('Error parseando usuario local:', error);
        return null;
    }
}

function actualizarPerfilModal(user) {
    const modal = document.getElementById('modalPerfil');
    if (!modal || !user) return;

    const avatarDisplay = modal.querySelector('#avatarDisplay');
    const nombre = modal.querySelector('[data-profile="nombre"]');
    const email = modal.querySelector('[data-profile="email"]');
    const plan = modal.querySelector('[data-profile="plan"]');
    const expiracion = modal.querySelector('[data-profile="expiracion"]');
    const expiracionLabel = modal.querySelector('[data-profile-label="expiracion"]');
    const rol = modal.querySelector('[data-profile="rol"]');
    const telefono = modal.querySelector('#profileTelefono');
    const avatarInput = modal.querySelector('#profileAvatar');
    const planNormalizado = (user.plan || '').toLowerCase();
    const diasRestantes = planNormalizado === 'free'
        ? calcularDiasRestantes(user.fecha_registro)
        : null;

    if (avatarDisplay) avatarDisplay.textContent = user.avatar || AVATAR_OPCIONES[0];
    if (nombre) nombre.textContent = user.nombre || 'Usuario';
    if (email) email.textContent = user.email || '';
    if (plan) plan.textContent = user.plan ? getPlanLabel(user.plan) : '--';
    if (expiracion) {
        if (planNormalizado === 'free') {
            expiracion.textContent = `${diasRestantes} día(s)`;
        } else {
            expiracion.textContent = user.expiracion ? new Date(user.expiracion).toLocaleDateString() : '--';
        }
    }
    if (expiracionLabel) {
        expiracionLabel.textContent = planNormalizado === 'free' ? 'Días restantes' : 'Expiración';
    }
    if (rol) rol.textContent = (user.rol || 'user').toUpperCase();
    if (telefono) telefono.value = user.telefono || '';
    if (avatarInput) avatarInput.value = user.avatar || AVATAR_OPCIONES[0];
}

function calcularDiasRestantes(fechaRegistro) {
    if (!fechaRegistro) return 7;
    const inicio = new Date(fechaRegistro);
    if (Number.isNaN(inicio.getTime())) return 7;
    const ahora = new Date();
    const diferenciaMs = ahora - inicio;
    const diasTranscurridos = Math.floor(diferenciaMs / (1000 * 60 * 60 * 24));
    return Math.max(0, 7 - diasTranscurridos);
}

async function verMiPerfil() {
    let user = obtenerUsuarioLocal();
    if (!user) {
        user = await cargarDatosUsuario();
    }
    if (!user) {
        mostrarAlerta('Error', 'No se pudo cargar la información del perfil', 'error');
        return;
    }
    currentUser = user;
    const avatarActual = user.avatar || AVATAR_OPCIONES[0];
    const avatarsHtml = AVATAR_OPCIONES.map(opcion => `
        <button type="button"
                class="btn btn-sm ${opcion === avatarActual ? 'btn-ig' : 'btn-ig-outline'} me-2 mb-2"
                onclick="seleccionarAvatar('${opcion}')"
                data-avatar="${opcion}">
            <span style="font-size: 1.2rem;">${opcion}</span>
        </button>
    `).join('');

    const modalHtml = `
        <div class="modal fade" id="modalPerfil" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content ig-card">
                    <div class="modal-header ig-card-header">
                        <h5 class="modal-title gradient-text">
                            <i class="hugeicons hugeicons-user me-2"></i>Mi Perfil
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body ig-card-body">
                        <div class="text-center mb-4">
                            <div class="story-circle mx-auto mb-3" style="width: 80px; height: 80px;">
                                <span id="avatarDisplay" style="font-size: 2rem;">${avatarActual}</span>
                            </div>
                            <h5 class="gradient-text" data-profile="nombre">${user.nombre || 'Usuario'}</h5>
                            <p class="text-muted" data-profile="email">${user.email}</p>
                        </div>
                        
                        <div class="ig-card mb-3">
                            <div class="p-3">
                                <div class="row">
                                    <div class="col-6">
                                        <small class="text-muted d-block">Plan</small>
                                        <strong class="d-block" data-profile="plan">${user.plan ? getPlanLabel(user.plan) : '--'}</strong>
                                    </div>
                                    <div class="col-6">
                                        <small class="text-muted d-block" data-profile-label="expiracion">
                                            ${user.plan === 'free' ? 'Días restantes' : 'Expiración'}
                                        </small>
                                        <strong class="d-block" data-profile="expiracion">
                                            ${user.plan === 'free'
                                                ? `${calcularDiasRestantes(user.fecha_registro)} día(s)`
                                                : (user.expiracion ? new Date(user.expiracion).toLocaleDateString() : '--')}
                                        </strong>
                                    </div>
                                    <div class="col-6 mt-3">
                                        <small class="text-muted d-block">Rol</small>
                                        <strong class="d-block" data-profile="rol">${(user.rol || 'user').toUpperCase()}</strong>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="mb-3">
                            <label class="form-label text-muted">Avatar</label>
                            <div id="avatarSelector">
                                ${avatarsHtml}
                            </div>
                            <input type="hidden" id="profileAvatar" value="${avatarActual}">
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label text-muted">Teléfono (WhatsApp)</label>
                            <input type="text" id="profileTelefono" class="form-control form-control-ig" 
                                   value="${user.telefono || ''}" placeholder="0412-1234567">
                            <small class="text-muted">Para notificaciones y soporte</small>
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label text-muted">Nueva Contraseña</label>
                            <input type="password" id="profilePassword" class="form-control form-control-ig" 
                                   placeholder="Dejar vacío para no cambiar">
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label text-muted">Confirmar Contraseña</label>
                            <input type="password" id="profilePasswordConfirm" class="form-control form-control-ig">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-ig" onclick="guardarPerfil()">
                            <i class="hugeicons hugeicons-save me-2"></i> Guardar Cambios
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Crear modal dinámico
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('modalPerfil'));
    modal.show();
    
    // Limpiar al cerrar
    modalContainer.querySelector('#modalPerfil').addEventListener('hidden.bs.modal', function () {
        document.body.removeChild(modalContainer);
    });

    if (obtenerUsuarioLocal()) {
        cargarDatosUsuario().then(actualizado => {
            if (actualizado) {
                actualizarPerfilModal(actualizado);
            }
        });
    }
}

async function guardarPerfil() {
    const telefono = document.getElementById('profileTelefono').value.trim();
    const password = document.getElementById('profilePassword').value;
    const passwordConfirm = document.getElementById('profilePasswordConfirm').value;
    const avatar = document.getElementById('profileAvatar')?.value || '';
    
    // Validar contraseñas si se están cambiando
    if (password && password !== passwordConfirm) {
        mostrarAlerta('Error', 'Las contraseñas no coinciden', 'error');
        return;
    }
    
    if (password && password.length < 6) {
        mostrarAlerta('Error', 'La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const updateData = { telefono, avatar };
        if (password) {
            updateData.password = password;
        }
        
        const response = await fetch('/api/auth/update', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlerta('¡Éxito!', 'Perfil actualizado correctamente', 'success');
            
            // Actualizar datos del usuario
            await cargarDatosUsuario();
            
            // Cerrar modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('modalPerfil'));
            if (modal) modal.hide();
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo actualizar el perfil', 'error');
        }
    } catch (error) {
        console.error('Error actualizando perfil:', error);
        mostrarAlerta('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function seleccionarAvatar(avatar) {
    const input = document.getElementById('profileAvatar');
    const display = document.getElementById('avatarDisplay');
    const selector = document.getElementById('avatarSelector');
    if (input) input.value = avatar;
    if (display) display.textContent = avatar;
    if (selector) {
        selector.querySelectorAll('button[data-avatar]').forEach(button => {
            if (button.dataset.avatar === avatar) {
                button.classList.remove('btn-ig-outline');
                button.classList.add('btn-ig');
            } else {
                button.classList.remove('btn-ig');
                button.classList.add('btn-ig-outline');
            }
        });
    }
}

// ========== INICIALIZACIÓN ==========

// Verificar autenticación al cargar
document.addEventListener('DOMContentLoaded', async function() {
    // SOLO verificar autenticación en páginas específicas
    const path = window.location.pathname;
    
    if (path === '/login' || path === '/register') {
        // En páginas de auth, si hay usuario, redirigir
        const user = await checkAuth();
        if (user) {
            window.location.href = user.rol === 'admin' ? '/admin' : '/dashboard';
        }
    }
    // En otras páginas, Flask ya maneja la redirección
});

// Exportar funciones globalmente
window.login = login;
window.register = register;
window.logout = logout;
window.solicitarPagoManual = solicitarPagoManual;
window.verMisSolicitudesPago = verMisSolicitudesPago;
window.verMisSuscripciones = verMisSuscripciones;
window.mostrarModalSuscripcion = mostrarModalSuscripcion;
window.verMiPerfil = verMiPerfil;
window.seleccionarAvatar = seleccionarAvatar;
