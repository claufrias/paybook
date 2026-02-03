// auth.js - Sistema de autenticación para RedCajeros

// Variables globales
let currentUser = null;
let userSubscription = null;

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
        const localUser = localStorage.getItem('redcajeros_user');
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
            el.textContent = `Plan: ${user.plan.toUpperCase()}`;
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
                <i class="fas fa-exclamation-triangle me-2"></i>
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
        planText = `Plan: ${user.plan.toUpperCase()}`;
        if (user.expiracion) {
            const expDate = new Date(user.expiracion);
            expirationText = `Expira: ${expDate.toLocaleDateString()}`;
        }
        buttonText = 'Actualizar';
    }
    
    planInfo.textContent = planText;
    expirationInfo.innerHTML = `<i class="fas fa-calendar me-1"></i> ${expirationText}`;
    upgradeButton.textContent = buttonText;
    upgradeButton.className = `btn btn-sm ${buttonClass}`;
    
    // Actualizar footer
    const footerPlan = document.getElementById('footerPlan');
    if (footerPlan) {
        footerPlan.textContent = user.plan.toUpperCase();
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
                            <i class="fas fa-money-bill-wave me-2"></i>Instrucciones de Pago
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body ig-card-body">
                        <div class="alert alert-info mb-3">
                            <i class="fas fa-info-circle me-2"></i>
                            <strong>Importante:</strong> Guarda tu código <code>${pagoData.codigo}</code>
                        </div>
                        
                        <h6 class="mb-3"><i class="fas fa-list-ol me-2"></i>Pasos a seguir:</h6>
                        <ol class="mb-4">
                            <li>Transfiere <strong>$${pagoData.monto}</strong> a la cuenta bancaria</li>
                            <li>Toma screenshot del comprobante</li>
                            <li>Envía el screenshot por WhatsApp con tu código</li>
                            <li>Tu cuenta se activará en minutos</li>
                        </ol>
                        
                        <h6 class="mb-3"><i class="fas fa-university me-2"></i>Datos Bancarios:</h6>
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
                        
                        <h6 class="mb-3"><i class="fab fa-whatsapp me-2"></i>Envía Comprobante:</h6>
                        <a href="${pagoData.whatsapp_url}" 
                           class="btn btn-success w-100 mb-2" 
                           target="_blank">
                            <i class="fab fa-whatsapp fa-lg me-2"></i>
                            Abrir WhatsApp
                        </a>
                        <p class="text-muted small mb-0">
                            <i class="fas fa-lightbulb me-1"></i>
                            Si no tienes WhatsApp en este dispositivo, envía al número: 
                            <strong>${pagoData.whatsapp_numero}</strong>
                        </p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                        <button type="button" class="btn btn-ig" onclick="copiarDatosPago()">
                            <i class="fas fa-copy me-2"></i> Copiar Datos
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
                            <i class="fas fa-history me-2"></i>Mis Solicitudes de Pago
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body ig-card-body">
    `;
    
    if (solicitudes.length === 0) {
        html += `
            <div class="text-center py-5">
                <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
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
                    <td>$${s.monto}</td>
                    <td>${s.plan}</td>
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

function mostrarModalSuscripcion() {
    const userData = localStorage.getItem('redcajeros_user');
    let currentPlan = '';
    if (userData) {
        try {
            currentPlan = JSON.parse(userData).plan || '';
        } catch (error) {
            currentPlan = '';
        }
    }

    const showUpgradeOnly = currentPlan === 'basic';
    const premiumLabel = showUpgradeOnly
        ? 'Actualizar a Premium (solo diferencia)'
        : 'Seleccionar Premium';
    const premiumPrice = showUpgradeOnly ? '$10000' : '$20000';
    const upgradeNote = showUpgradeOnly
        ? '<small class="text-info d-block mt-2">Pagas solo la diferencia: $10000</small>'
        : '';

    const modalHtml = `
        <div class="modal fade" id="modalSuscripcion" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content ig-card">
                    <div class="modal-header ig-card-header">
                        <h5 class="modal-title gradient-text">
                            <i class="fas fa-crown me-2"></i>Planes de RedCajeros
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body ig-card-body">
                        <div class="row">
                            ${showUpgradeOnly ? '' : `
                            <div class="col-md-6 mb-3">
                                <div class="plan-card">
                                    <div class="plan-header bg-primary">
                                        <h4 class="mb-0">Básico</h4>
                                        <div class="plan-price">$10000<span class="plan-period">/mes</span></div>
                                    </div>
                                    <div class="plan-body">
                                        <ul class="plan-features">
                                            <li><i class="fas fa-check text-success me-2"></i> Hasta 15 cajeros</li>
                                            <li><i class="fas fa-check text-success me-2"></i> Cargas ilimitadas</li>
                                            <li><i class="fas fa-check text-success me-2"></i> Reportes PDF</li>
                                            <li><i class="fas fa-check text-success me-2"></i> Historial completo</li>
                                            <li><i class="fas fa-check text-success me-2"></i> Soporte por email</li>
                                        </ul>
                                        <button class="btn btn-ig w-100 mt-3" onclick="solicitarPagoManual('basic')">
                                            <i class="fas fa-shopping-cart me-2"></i> Seleccionar Plan
                                        </button>
                                    </div>
                                </div>
                            </div>
                            `}
                            <div class="col-md-6 mb-3">
                                <div class="plan-card">
                                    <div class="plan-header bg-gradient">
                                        <h4 class="mb-0">Premium</h4>
                                        <div class="plan-price">${premiumPrice}<span class="plan-period">/mes</span></div>
                                        <span class="plan-badge">Recomendado</span>
                                    </div>
                                    <div class="plan-body">
                                        <ul class="plan-features">
                                            <li><i class="fas fa-check text-success me-2"></i> Cajeros ilimitados</li>
                                            <li><i class="fas fa-check text-success me-2"></i> Reportes avanzados</li>
                                            <li><i class="fas fa-check text-success me-2"></i> WhatsApp automático</li>
                                            <li><i class="fas fa-check text-success me-2"></i> API de integración</li>
                                            <li><i class="fas fa-check text-success me-2"></i> Soporte prioritario</li>
                                            <li><i class="fas fa-check text-success me-2"></i> Backup automático</li>
                                        </ul>
                                        ${upgradeNote}
                                        <button class="btn btn-gradient w-100 mt-3" onclick="solicitarPagoManual('premium')">
                                            <i class="fas fa-rocket me-2"></i> ${premiumLabel}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="mt-4">
                            <h6><i class="fas fa-question-circle me-2"></i>Preguntas Frecuentes</h6>
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
                            <i class="fas fa-history me-2"></i> Ver Mis Solicitudes
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
            <i class="fas ${tipo === 'success' ? 'fa-check-circle' : tipo === 'error' ? 'fa-exclamation-circle' : tipo === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'} fa-lg me-3"></i>
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

function verMiPerfil() {
    if (!currentUser) return;
    
    // Cargar datos actualizados del usuario
    cargarDatosUsuario().then(user => {
        if (!user) return;
        
        const modalHtml = `
            <div class="modal fade" id="modalPerfil" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content ig-card">
                        <div class="modal-header ig-card-header">
                            <h5 class="modal-title gradient-text">
                                <i class="fas fa-user me-2"></i>Mi Perfil
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body ig-card-body">
                            <div class="text-center mb-4">
                                <div class="story-circle mx-auto mb-3" style="width: 80px; height: 80px;">
                                    <i class="fas fa-user fa-2x"></i>
                                </div>
                                <h5 class="gradient-text">${user.nombre || 'Usuario'}</h5>
                                <p class="text-muted">${user.email}</p>
                            </div>
                            
                            <div class="ig-card mb-3">
                                <div class="p-3">
                                    <div class="row">
                                        <div class="col-6">
                                            <small class="text-muted d-block">Plan</small>
                                            <strong class="d-block">${user.plan.toUpperCase()}</strong>
                                        </div>
                                        <div class="col-6">
                                            <small class="text-muted d-block">Expiración</small>
                                            <strong class="d-block">${user.expiracion ? new Date(user.expiracion).toLocaleDateString() : '--'}</strong>
                                        </div>
                                    </div>
                                </div>
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
                                <i class="fas fa-save me-2"></i> Guardar Cambios
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
    });
}

async function guardarPerfil() {
    const telefono = document.getElementById('profileTelefono').value.trim();
    const password = document.getElementById('profilePassword').value;
    const passwordConfirm = document.getElementById('profilePasswordConfirm').value;
    
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
        const updateData = { telefono };
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
window.mostrarModalSuscripcion = mostrarModalSuscripcion;
window.verMiPerfil = verMiPerfil;
