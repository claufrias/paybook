// auth.js - Sistema de autenticación para RedCajeros

// ========== FUNCIONES DE AUTH ==========
async function login() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        mostrarAlerta('Error', 'Completa todos los campos', 'error');
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Redirigir al dashboard
            window.location.href = '/dashboard';
        } else {
            if (data.code === 'SUBSCRIPTION_EXPIRED') {
                // Mostrar modal de suscripción expirada
                mostrarAlerta('Suscripción Expirada', 
                    'Tu período de prueba ha terminado. Por favor renueva tu suscripción para continuar.', 
                    'error');
                
                // Opcional: redirigir a página de pago
                setTimeout(() => {
                    window.location.href = '/?expired=true';
                }, 3000);
            } else {
                mostrarAlerta('Error', data.error || 'Credenciales incorrectas', 'error');
            }
        }
    } catch (error) {
        mostrarAlerta('Error de conexión', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function register() {
    const nombre = document.getElementById('registerNombre').value.trim();
    const email = document.getElementById('registerEmail').value.trim().toLowerCase();
    const telefono = document.getElementById('registerTelefono').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirm').value;
    const terms = document.getElementById('registerTerms').checked;
    
    // Validaciones
    if (!nombre || !email || !password || !confirmPassword) {
        mostrarAlerta('Error', 'Completa todos los campos obligatorios', 'error');
        return;
    }
    
    if (!terms) {
        mostrarAlerta('Error', 'Debes aceptar los términos y condiciones', 'error');
        return;
    }
    
    if (password.length < 6) {
        mostrarAlerta('Error', 'La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        mostrarAlerta('Error', 'Las contraseñas no coinciden', 'error');
        return;
    }
    
    if (!validateEmail(email)) {
        mostrarAlerta('Error', 'Ingresa un email válido', 'error');
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                nombre, 
                email, 
                password, 
                telefono 
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlerta('¡Cuenta creada!', 
                'Tu cuenta ha sido creada exitosamente. Tienes 7 días de prueba gratis.', 
                'success');
            
            // Redirigir después de 2 segundos
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 2000);
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo crear la cuenta', 'error');
        }
    } catch (error) {
        mostrarAlerta('Error de conexión', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function recuperarContrasena() {
    const email = document.getElementById('forgotEmail').value.trim();
    
    if (!email || !validateEmail(email)) {
        mostrarAlerta('Error', 'Ingresa un email válido', 'error');
        return;
    }
    
    mostrarLoading(true);
    
    try {
        // Simular recuperación (en producción conectarías con tu backend)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        mostrarAlerta('Instrucciones enviadas', 
            `Si el email ${email} está registrado, recibirás instrucciones para recuperar tu contraseña.`, 
            'success');
        
        // Volver al login
        setTimeout(() => {
            mostrarLogin();
        }, 3000);
        
    } catch (error) {
        mostrarAlerta('Error', 'No se pudo procesar la solicitud', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function logout() {
    try {
        const response = await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        window.location.href = '/';
    }
}

// ========== FUNCIONES DE UTILIDAD ==========
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function mostrarAlerta(titulo, mensaje, tipo = 'info') {
    // Crear alerta si no existe el contenedor en login page
    if (!document.getElementById('alertContainer')) {
        // Crear alerta temporal
        const alerta = document.createElement('div');
        alerta.className = `alert alert-${tipo === 'error' ? 'danger' : tipo === 'success' ? 'success' : 'info'} position-fixed`;
        alerta.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        alerta.innerHTML = `
            <div class="d-flex align-items-center">
                <i class="fas ${tipo === 'success' ? 'fa-check-circle' : tipo === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'} fa-lg me-3"></i>
                <div class="flex-grow-1">
                    <h6 class="mb-1 fw-bold">${titulo}</h6>
                    <small>${mensaje}</small>
                </div>
                <button type="button" class="btn-close" onclick="this.parentElement.parentElement.remove()"></button>
            </div>
        `;
        
        document.body.appendChild(alerta);
        
        setTimeout(() => {
            if (alerta.parentNode) alerta.remove();
        }, 5000);
        
        return;
    }
    
    // Usar el sistema de alertas existente si está disponible
    const tipos = {
        'success': 'alert-ig-success',
        'error': 'alert-ig-error',
        'warning': 'alert-ig-warning',
        'info': 'alert-ig-info'
    };
    
    const iconos = {
        'success': 'fa-check-circle',
        'error': 'fa-exclamation-circle',
        'warning': 'fa-exclamation-triangle',
        'info': 'fa-info-circle'
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
            <button type="button" class="btn-close btn-close-white ms-2" onclick="this.parentElement.parentElement.remove()"></button>
        </div>
    `;
    
    const container = document.getElementById('alertContainer');
    if (container) {
        container.prepend(alerta);
        
        setTimeout(() => {
            if (alerta.parentNode) alerta.remove();
        }, 5000);
    }
}

function mostrarLoading(mostrar = true) {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
        // Si no existe el overlay en login page, crear uno temporal
        if (mostrar) {
            const tempOverlay = document.createElement('div');
            tempOverlay.id = 'tempLoadingOverlay';
            tempOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(10, 10, 10, 0.95);
                backdrop-filter: blur(10px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
            `;
            tempOverlay.innerHTML = `
                <div class="text-center">
                    <div class="spinner-border text-danger" role="status">
                        <span class="visually-hidden">Cargando...</span>
                    </div>
                    <p class="mt-3 text-muted">Cargando...</p>
                </div>
            `;
            document.body.appendChild(tempOverlay);
            document.body.style.overflow = 'hidden';
        } else {
            const tempOverlay = document.getElementById('tempLoadingOverlay');
            if (tempOverlay) {
                tempOverlay.remove();
                document.body.style.overflow = 'auto';
            }
        }
        return;
    }
    
    if (mostrar) {
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    } else {
        overlay.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

// ========== FUNCIONES PARA MOSTRAR/OCULTAR FORMULARIOS ==========
function mostrarLogin() {
    if (document.getElementById('loginForm')) {
        document.getElementById('loginForm').classList.remove('d-none');
        document.getElementById('registerForm').classList.add('d-none');
        document.getElementById('forgotForm').classList.add('d-none');
        document.getElementById('loginSwitch').classList.add('d-none');
        document.getElementById('registerSwitch').classList.remove('d-none');
    }
}

function mostrarRegistro() {
    if (document.getElementById('registerForm')) {
        document.getElementById('loginForm').classList.add('d-none');
        document.getElementById('registerForm').classList.remove('d-none');
        document.getElementById('forgotForm').classList.add('d-none');
        document.getElementById('loginSwitch').classList.remove('d-none');
        document.getElementById('registerSwitch').classList.add('d-none');
    }
}

function mostrarRecuperar() {
    if (document.getElementById('forgotForm')) {
        document.getElementById('loginForm').classList.add('d-none');
        document.getElementById('registerForm').classList.add('d-none');
        document.getElementById('forgotForm').classList.remove('d-none');
        document.getElementById('loginSwitch').classList.remove('d-none');
        document.getElementById('registerSwitch').classList.add('d-none');
    }
}

// ========== TOGGLE PASSWORD VISIBILITY ==========
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.parentElement.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// ========== CHECK AUTH STATUS ==========
async function checkAuth() {
    try {
        const response = await fetch('/api/user/info');
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                // Si ya está autenticado y está en login page, redirigir
                if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
                    window.location.href = '/dashboard';
                }
                return data.user;
            }
        }
    } catch (error) {
        // No autenticado
    }
    return null;
}

// ========== INITIALIZE ==========
document.addEventListener('DOMContentLoaded', function() {
    // Verificar autenticación
    checkAuth();
    
    // Set default dates in filters (if exists)
    if (document.getElementById('fechaInicio')) {
        const ahora = new Date();
        const inicioDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0);
        const finDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59);
        
        document.getElementById('fechaInicio').value = inicioDia.toISOString().slice(0, 16);
        document.getElementById('fechaFin').value = finDia.toISOString().slice(0, 16);
    }
    
    // Setup event listeners for Enter key
    if (document.getElementById('loginPassword')) {
        document.getElementById('loginPassword').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') login();
        });
    }
    
    if (document.getElementById('registerConfirm')) {
        document.getElementById('registerConfirm').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') register();
        });
    }
    
    if (document.getElementById('forgotEmail')) {
        document.getElementById('forgotEmail').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') recuperarContrasena();
        });
    }
    
    // Emergency loading hide after 30 seconds
    setTimeout(() => {
        mostrarLoading(false);
    }, 30000);
});

// ========== GLOBAL FUNCTIONS ==========
window.login = login;
window.register = register;
window.logout = logout;
window.recuperarContrasena = recuperarContrasena;
window.mostrarLogin = mostrarLogin;
window.mostrarRegistro = mostrarRegistro;
window.mostrarRecuperar = mostrarRecuperar;
window.togglePassword = togglePassword;