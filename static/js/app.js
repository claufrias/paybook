// app.js - VERSIÓN COMPLETA Y FUNCIONAL

// Base URL for API
const API_BASE = '';

// Global state
let cargas = [];
let cajeros = [];
let resumen = [];
let estadisticas = {};
let configuracion = {};
let isLoading = false;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    console.log('💰 CashFlow v3.0 - Sistema en Tiempo Real');
    
    // Set default dates
    const ahora = new Date();
    const inicioDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0);
    const finDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59);
    
    document.getElementById('fechaInicio').value = inicioDia.toISOString().slice(0, 16);
    document.getElementById('fechaFin').value = finDia.toISOString().slice(0, 16);
    
    // Setup event listeners
    setupEventListeners();
    
    // Load initial data
    cargarDatosIniciales();
});

// ========== SETUP EVENT LISTENERS ==========
function setupEventListeners() {
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Form submissions
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
}

function handleKeyboardShortcuts(event) {
    // Ctrl + R or Cmd + R to refresh
    if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
        event.preventDefault();
        cargarDatosIniciales();
        mostrarAlerta('Actualizando', 'Recargando todos los datos...', 'info');
    }
    
    // Ctrl + N or Cmd + N to focus new cashier
    if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
        event.preventDefault();
        const input = document.getElementById('nombreCajero');
        if (input) input.focus();
    }
    
    // Ctrl + G or Cmd + G to focus new charge
    if ((event.ctrlKey || event.metaKey) && event.key === 'g') {
        event.preventDefault();
        const input = document.getElementById('montoCarga');
        if (input) input.focus();
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
    
    // F5 to force refresh
    if (event.key === 'F5') {
        event.preventDefault();
        cargarDatosIniciales();
        mostrarAlerta('Actualizando', 'Recargando datos...', 'info');
    }
}

// ========== ALERT SYSTEM ==========
function mostrarAlerta(titulo, mensaje, tipo = 'info') {
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
            <button type="button" class="btn-close btn-close-white ms-2" onclick="cerrarAlerta(this)"></button>
        </div>
    `;
    
    const container = document.getElementById('alertContainer');
    if (container) {
        container.prepend(alerta);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (alerta.parentNode) {
                alerta.classList.add('hiding');
                setTimeout(() => {
                    if (alerta.parentNode) alerta.remove();
                }, 300);
            }
        }, 5000);
    }
}

function cerrarAlerta(btn) {
    const alerta = btn.closest('.alert-ig');
    if (alerta) {
        alerta.classList.add('hiding');
        setTimeout(() => {
            if (alerta.parentNode) alerta.remove();
        }, 300);
    }
}

// ========== LOADING OVERLAY ==========
function mostrarLoading(mostrar = true) {
    isLoading = mostrar;
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    
    if (mostrar) {
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Safety timeout (10 seconds max)
        if (window.loadingTimeout) {
            clearTimeout(window.loadingTimeout);
        }
        window.loadingTimeout = setTimeout(() => {
            if (isLoading) {
                console.warn('⚠️ Loading timeout - forcing hide');
                mostrarLoading(false);
                mostrarAlerta('Timeout', 'La operación tardó demasiado', 'warning');
            }
        }, 10000);
        
    } else {
        overlay.classList.remove('active');
        document.body.style.overflow = 'auto';
        
        // Clear timeout
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

// ========== SECTION NAVIGATION ==========
function mostrarSeccion(seccion) {
    // Remove pulse from all stories
    document.querySelectorAll('.story-circle').forEach(circle => {
        circle.classList.remove('pulse');
    });
    
    // Add pulse to selected
    const storyItems = document.querySelectorAll('.story-item');
    const sections = ['resumen', 'cajeros', 'cargas', 'historial', 'reportes'];
    const index = sections.indexOf(seccion);
    if (index !== -1 && storyItems[index]) {
        storyItems[index].querySelector('.story-circle').classList.add('pulse');
    }
    
    // Scroll to section with animation
    const elemento = document.getElementById(`seccion${seccion.charAt(0).toUpperCase() + seccion.slice(1)}`) ||
                     document.getElementById(`form${seccion.charAt(0).toUpperCase() + seccion.slice(1)}`);
    
    if (elemento) {
        elemento.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
        });
        
        // Add highlight effect
        elemento.classList.add('border-gradient');
        setTimeout(() => elemento.classList.remove('border-gradient'), 2000);
    }
}

// ========== CONFIGURATION ==========
async function cargarConfiguracion() {
    try {
        const response = await fetch(`${API_BASE}/api/configuracion`);
        const data = await response.json();
        
        if (data.success) {
            configuracion = data.data;
            console.log('✅ Configuración cargada');
        }
    } catch (error) {
        console.error('Error cargando configuración:', error);
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
        // Cargar configuración primero
        await cargarConfiguracion();
        
        // Cargar datos en paralelo para mejor rendimiento
        const [cajerosData, cargasData, resumenData, estadisticasData] = await Promise.allSettled([
            cargarCajeros(),
            cargarCargas(),
            cargarResumen(),
            cargarEstadisticas()
        ]);
        
        // Procesar resultados
        if (cajerosData.status === 'fulfilled') {
            cajeros = cajerosData.value || [];
            console.log(`✅ ${cajeros.length} cajeros cargados`);
        }
        
        if (cargasData.status === 'fulfilled') {
            cargas = cargasData.value || [];
            console.log(`✅ ${cargas.length} cargas cargadas`);
        }
        
        if (resumenData.status === 'fulfilled') {
            resumen = resumenData.value || [];
            console.log(`✅ Resumen de ${resumen.length} cajeros cargado`);
        }
        
        if (estadisticasData.status === 'fulfilled') {
            estadisticas = estadisticasData.value || {};
            console.log('✅ Estadísticas cargadas');
        }
        
        // Actualizar UI
        actualizarTodaLaUI();
        
        // Actualizar timestamp
        const ahora = new Date();
        const lastUpdateEl = document.getElementById('lastUpdate');
        if (lastUpdateEl) {
            lastUpdateEl.textContent = `Última actualización: ${ahora.toLocaleTimeString('es-ES')}`;
        }
        
        // Mostrar mensaje de bienvenida
        setTimeout(() => {
            mostrarAlerta('¡Sistema listo!', 'Todos los cambios se actualizan en tiempo real', 'success');
        }, 1000);
        
    } catch (error) {
        console.error('❌ Error crítico cargando datos:', error);
        mostrarAlerta('Error', 'No se pudieron cargar los datos. Verifica la consola.', 'error');
    } finally {
        // Siempre ocultar loading después de 1 segundo mínimo
        setTimeout(() => {
            mostrarLoading(false);
        }, 1000);
    }
}

function actualizarTodaLaUI() {
    actualizarSelectCajeros();
    actualizarTablaResumen();
    actualizarTablaCargas();
    calcularEstadisticas();
    actualizarContadores();
}

// ========== CASHIERS MANAGEMENT ==========
async function cargarCajeros() {
    try {
        const response = await fetch(`${API_BASE}/api/cajeros`);
        const data = await response.json();
        
        if (data.success) {
            return data.data || [];
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error cargando cajeros:', error);
        throw error;
    }
}

async function actualizarListaCajeros() {
    try {
        await cargarCajeros();
        actualizarSelectCajeros();
        mostrarAlerta('Actualizado', 'Lista de cajeros actualizada', 'success');
    } catch (error) {
        console.error('Error actualizando cajeros:', error);
        mostrarAlerta('Error', 'No se pudo actualizar la lista de cajeros', 'error');
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
        // Si no hay selección, seleccionar el primero
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
            
            // Animar el formulario
            const form = document.getElementById('formCajero');
            if (form) {
                form.classList.add('border-gradient');
                setTimeout(() => form.classList.remove('border-gradient'), 1000);
            }
            
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
            
            // Mostrar confirmación
            mostrarAlerta('Cajero seleccionado', `"${nombre}" ya está seleccionado para nueva carga`, 'info');
            
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo agregar el cajero', 'error');
        }
        
    } catch (error) {
        console.error('❌ Error agregando cajero:', error);
        mostrarAlerta('Error de conexión', 'Verifique su conexión a internet', 'error');
        
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
    
    const confirmacion = cajero.activo ? 
        `¿Está seguro de desactivar al cajero "${cajero.nombre}"?\nSe mantendrán sus cargas registradas.` :
        `¿Está seguro de eliminar permanentemente al cajero "${cajero.nombre}"?\nEsta acción no se puede deshacer.`;
    
    if (!confirm(confirmacion)) {
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/cajeros/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlerta('¡Éxito!', data.message || 'Cajero procesado correctamente', 'success');
            
            // Recargar datos
            cajeros = await cargarCajeros();
            resumen = await cargarResumen();
            
            actualizarSelectCajeros();
            actualizarTablaResumen();
            calcularEstadisticas();
            
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

// ========== CHARGES MANAGEMENT ==========
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
                    <div class="mt-3">
                        <button class="btn btn-ig btn-sm" onclick="mostrarSeccion('cargas')">
                            <i class="fas fa-plus me-2"></i> Agregar Carga
                        </button>
                    </div>
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
            
            // Destacar las 3 más recientes
            if (index < 3) {
                tr.className = 'table-info';
            }
            
            tr.innerHTML = `
                <td>
                    <div class="d-flex align-items-center">
                        <div class="bg-dark rounded-circle d-flex align-items-center justify-content-center me-2" 
                             style="width: 32px; height: 32px;">
                            <i class="fas fa-calendar-alt fa-xs"></i>
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
                    <span class="badge ${getBadgeClass(carga.plataforma)}">
                        ${carga.plataforma || 'Sin plataforma'}
                    </span>
                </td>
                <td class="text-end">
                    <span class="fw-bold text-gradient">$${parseFloat(carga.monto || 0).toFixed(2)}</span>
                </td>
                <td class="text-center">
                    <button class="btn btn-outline-danger btn-sm hover-lift" onclick="eliminarCarga(${carga.id})" 
                            title="Eliminar carga">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            
            tbody.appendChild(tr);
            
        } catch (error) {
            console.error(`❌ Error procesando carga ${carga.id}:`, error);
        }
    });
    
    // Actualizar contador
    const historialCount = document.getElementById('historialCount');
    if (historialCount) {
        historialCount.innerHTML = `<i class="fas fa-list me-1"></i> ${cargas.length} ${cargas.length === 1 ? 'carga' : 'cargas'}`;
    }
    
    const cargasCount = document.getElementById('cargasCount');
    if (cargasCount) {
        cargasCount.innerHTML = `<i class="fas fa-list me-1"></i> ${cargas.length} ${cargas.length === 1 ? 'carga registrada' : 'cargas registradas'}`;
    }
}

function getBadgeClass(plataforma) {
    switch(plataforma) {
        case 'Zeus': return 'badge-zeus';
        case 'Gana': return 'badge-gana';
        case 'Ganamos': return 'badge-ganamos';
        default: return 'bg-secondary';
    }
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
        dataStatusEl.textContent = `Cajeros: ${cajeros.filter(c => c.activo).length} | Cargas: ${cargas.length} | Total: $${resumen.reduce((sum, item) => sum + item.total, 0).toFixed(2)}`;
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
    
    if (!monto || monto <= 0 || isNaN(monto)) {
        mostrarAlerta('Monto inválido', 'Ingrese un monto válido mayor a 0', 'warning');
        montoInput.focus();
        montoInput.select();
        return;
    }
    
    if (monto > 1000000) {
        mostrarAlerta('Monto muy alto', 'El monto no puede superar $1,000,000', 'warning');
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
            mostrarAlerta('¡Registro exitoso!', 
                `Carga de $${monto.toFixed(2)} registrada para ${cajeroNombre} en ${plataforma}`, 
                'success');
            
            // Reset form
            montoInput.value = '';
            
            // Animate success
            const form = document.getElementById('formCarga');
            if (form) {
                form.classList.add('border-gradient');
                setTimeout(() => form.classList.remove('border-gradient'), 1000);
            }
            
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
            
            // Mostrar sección de historial
            mostrarSeccion('historial');
            
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
    
    if (!confirm(`¿Está seguro de eliminar esta carga?\n${carga.cajero} - ${carga.plataforma} - $${carga.monto}\n\n⚠️ Esta acción no se puede deshacer.`)) {
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/cargas/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlerta('Eliminado', 'Carga eliminada correctamente', 'success');
            
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
            mostrarAlerta('Error', data.error || 'No se pudo eliminar la carga', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// Quick add charge
function agregarCargaRapida() {
    mostrarSeccion('cargas');
    const montoInput = document.getElementById('montoCarga');
    if (montoInput) montoInput.focus();
    
    // If no cajero selected, show alert
    const selectCajero = document.getElementById('selectCajero');
    if (selectCajero && !selectCajero.value) {
        mostrarAlerta('Seleccione cajero', 'Primero seleccione un cajero para cargar rápido', 'info');
    }
}

// ========== FILTERS ==========
async function filtrarCargas() {
    const fechaInicio = document.getElementById('fechaInicio').value;
    const fechaFin = document.getElementById('fechaFin').value;
    
    if (!fechaInicio || !fechaFin) {
        mostrarAlerta('Fechas incompletas', 'Debe seleccionar ambas fechas', 'warning');
        return;
    }
    
    if (new Date(fechaInicio) > new Date(fechaFin)) {
        mostrarAlerta('Fechas inválidas', 'La fecha de inicio no puede ser mayor que la fecha de fin', 'error');
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
}

async function limpiarFiltro() {
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
}

// ========== SUMMARY ==========
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
        tr.className = isTop ? 'table-warning' : '';
        tr.innerHTML = `
            <td>
                <div class="d-flex align-items-center">
                    <div class="position-relative me-2">
                        <div class="story-circle small ${isTop ? 'pulse' : ''}" 
                             style="width: 36px; height: 36px;">
                            <i class="fas ${isTop ? 'fa-crown' : 'fa-user'}"></i>
                        </div>
                    </div>
                    <div>
                        <div class="fw-medium">${item.cajero}</div>
                        <small class="text-muted">${item.cargas} cargas</small>
                    </div>
                </div>
            </td>
            <td class="text-end">
                <span class="fw-medium">$${item.zeus.toFixed(2)}</span>
            </td>
            <td class="text-end">
                <span class="fw-medium">$${item.gana.toFixed(2)}</span>
            </td>
            <td class="text-end">
                <span class="fw-medium">$${item.ganamos.toFixed(2)}</span>
            </td>
            <td class="text-end">
                <span class="fw-bold text-gradient">$${item.total.toFixed(2)}</span>
            </td>
            <td class="text-center">
                <button class="btn btn-success btn-sm hover-lift" 
                        onclick="pagarCajero(${item.cajero_id}, '${item.cajero.replace(/'/g, "\\'")}')"
                        title="Marcar como pagado">
                    <i class="fas fa-check-circle"></i> Pagar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ========== STATISTICS ==========
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
    // Total general (SOLO NO PAGADAS)
    const totalGeneral = resumen.reduce((sum, item) => sum + item.total, 0);
    const totalGeneralEl = document.getElementById('totalGeneral');
    if (totalGeneralEl) {
        totalGeneralEl.textContent = `$${totalGeneral.toFixed(2)}`;
    }
    
    // Today's total (TODAS las cargas)
    const hoy = new Date().toISOString().split('T')[0];
    const cargasHoy = cargas.filter(c => c.fecha && c.fecha.startsWith(hoy));
    const totalHoy = cargasHoy.reduce((sum, c) => sum + parseFloat(c.monto || 0), 0);
    
    const totalHoyEl = document.getElementById('totalHoy');
    if (totalHoyEl) {
        totalHoyEl.textContent = `$${totalHoy.toFixed(2)}`;
    }
    
    // Top cashier
    if (resumen.length > 0) {
        const top = resumen.reduce((max, item) => item.total > max.total ? item : max, resumen[0]);
        
        const topCajeroEl = document.getElementById('topCajero');
        if (topCajeroEl) {
            topCajeroEl.textContent = `$${top.total.toFixed(2)}`;
        }
        
        const topCajeroNombreEl = document.getElementById('topCajeroNombre');
        if (topCajeroNombreEl) {
            topCajeroNombreEl.innerHTML = `<i class="fas fa-crown me-1"></i> ${top.cajero}`;
        }
    }
    
    // Average per charge
    const todasLasCargas = cargas.length > 0 ? 
        cargas.reduce((sum, c) => sum + parseFloat(c.monto || 0), 0) : 0;
    const promedio = cargas.length > 0 ? todasLasCargas / cargas.length : 0;
    
    const promedioCargaEl = document.getElementById('promedioCarga');
    if (promedioCargaEl) {
        promedioCargaEl.textContent = `$${promedio.toFixed(2)}`;
    }
}

// ========== PAYMENTS ==========
async function pagarCajero(cajeroId, cajeroNombre) {
    // First, get how much is pending
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/resumen/pendientes`);
        const data = await response.json();
        
        if (!data.success) {
            mostrarAlerta('Error', 'No se pudo obtener los pendientes', 'error');
            mostrarLoading(false);
            return;
        }
        
        // Find this cashier in pending
        const cajeroPendiente = data.data.find(c => c.cajero_id === cajeroId);
        const pendiente = cajeroPendiente ? cajeroPendiente.total : 0;
        
        mostrarLoading(false);
        
        // Ask how much to pay
        const monto = prompt(
            `${cajeroNombre}\n\nPendiente: $${pendiente.toFixed(2)}\n\n¿Cuánto va a pagar?\n(Deje en blanco para pagar todo):`,
            pendiente.toFixed(2)
        );
        
        if (monto === null) return; // User cancelled
        
        let montoNum;
        if (monto.trim() === '') {
            montoNum = pendiente; // Pay all
        } else {
            montoNum = parseFloat(monto);
        }
        
        if (isNaN(montoNum) || montoNum < 0) {
            mostrarAlerta('Error', 'Ingrese un monto válido', 'error');
            return;
        }
        
        mostrarLoading(true);
        
        // Send payment
        const pagoResponse = await fetch(`${API_BASE}/api/pagos`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                cajero_id: cajeroId,
                monto_pagado: montoNum
            })
        });
        
        const pagoData = await pagoResponse.json();
        
        if (pagoData.success) {
            mostrarAlerta('✅ Pago Registrado', 
                `Se pagó $${montoNum.toFixed(2)} a ${cajeroNombre}\n\nPendiente anterior: $${pendiente.toFixed(2)}\nNuevo pendiente: $${(pendiente - montoNum).toFixed(2)}`, 
                'success');
            
            // Recargar datos en paralelo
            const [nuevoResumen, nuevasCargas, nuevasEstadisticas] = await Promise.all([
                cargarResumen(),
                cargarCargas(),
                cargarEstadisticas()
            ]);
            
            resumen = nuevoResumen;
            cargas = nuevasCargas;
            estadisticas = nuevasEstadisticas;
            
            // Actualizar UI
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

// ========== PENDING VIEW ==========
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
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'modalPendientes';
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
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
        
        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        
        // Clean up modal on close
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

// ========== EXPORT ==========
async function exportarReporte() {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/exportar/excel`);
        const data = await response.json();
        
        if (data.success) {
            // Create download link
            const link = document.createElement('a');
            link.href = data.url;
            link.download = data.filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            mostrarAlerta('Exportado', 'Reporte descargado correctamente', 'success');
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo exportar el reporte', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error', 'No se pudo generar el reporte', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// ========== TOOLS ==========
async function calcularComisiones() {
    const porcentaje = prompt('Ingrese el porcentaje de comisión (%):', configuracion.porcentaje_comision || '10');
    if (!porcentaje || isNaN(parseFloat(porcentaje))) {
        mostrarAlerta('Error', 'Porcentaje inválido', 'error');
        return;
    }
    
    const montoTotal = resumen.reduce((sum, item) => sum + item.total, 0);
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/herramientas/calcular-comisiones`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                porcentaje: parseFloat(porcentaje),
                monto_total: montoTotal
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const comision = data.data.comision;
            mostrarAlerta('Cálculo de Comisiones', 
                `Porcentaje: ${porcentaje}%\nMonto Total: $${montoTotal.toFixed(2)}\nComisión: $${comision.toFixed(2)}`, 
                'info');
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo calcular las comisiones', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// ========== CONFIGURATION MANAGEMENT ==========
async function mostrarConfiguracion() {
    await cargarConfiguracion();
    
    let html = `
        <div class="configuracion-modal">
            <h4 class="gradient-text">Configuración del Sistema</h4>
            <div class="table-responsive mt-3">
                <table class="table table-ig">
                    <thead>
                        <tr>
                            <th>Configuración</th>
                            <th>Valor Actual</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    for (const [clave, valor] of Object.entries(configuracion)) {
        html += `
            <tr>
                <td>${clave.replace(/_/g, ' ').toUpperCase()}</td>
                <td>${valor}</td>
                <td>
                    <button class="btn btn-sm btn-ig-outline" onclick="editarConfiguracion('${clave}', '${valor}')">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>
        `;
    }
    
    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'modalConfiguracion';
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content ig-card">
                <div class="modal-header ig-card-header">
                    <h5 class="modal-title gradient-text">
                        <i class="fas fa-cog me-2"></i>Configuración
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
    
    // Show modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    
    // Remove modal after close
    modal.addEventListener('hidden.bs.modal', function () {
        document.body.removeChild(modal);
    });
}

async function editarConfiguracion(clave, valorActual) {
    const nuevoValor = prompt(`Nuevo valor para ${clave.replace(/_/g, ' ').toLowerCase()}:`, valorActual);
    if (nuevoValor === null || nuevoValor === valorActual) {
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/configuracion`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                [clave]: nuevoValor
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlerta('Configuración actualizada', `${clave} actualizado a: ${nuevoValor}`, 'success');
            await cargarConfiguracion();
            
            // Close modal and reopen
            const modal = document.getElementById('modalConfiguracion');
            if (modal) {
                const bsModal = bootstrap.Modal.getInstance(modal);
                if (bsModal) {
                    bsModal.hide();
                    setTimeout(() => mostrarConfiguracion(), 500);
                }
            }
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo actualizar la configuración', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// ========== UTILITY FUNCTIONS ==========
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(amount);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ========== REPORT FUNCTIONS ==========
function generarReporteDiario() {
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('fechaInicio').value = `${hoy}T00:00`;
    document.getElementById('fechaFin').value = `${hoy}T23:59`;
    filtrarCargas();
    mostrarAlerta('Reporte Diario', 'Filtro aplicado para hoy', 'info');
}

function generarReporteSemanal() {
    const hoy = new Date();
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay());
    const finSemana = new Date(inicioSemana);
    finSemana.setDate(inicioSemana.getDate() + 6);
    
    document.getElementById('fechaInicio').value = inicioSemana.toISOString().slice(0, 16);
    document.getElementById('fechaFin').value = finSemana.toISOString().slice(0, 16);
    filtrarCargas();
    mostrarAlerta('Reporte Semanal', 'Filtro aplicado para esta semana', 'info');
}

function generarReporteMensual() {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    
    document.getElementById('fechaInicio').value = inicioMes.toISOString().slice(0, 16);
    document.getElementById('fechaFin').value = finMes.toISOString().slice(0, 16);
    filtrarCargas();
    mostrarAlerta('Reporte Mensual', 'Filtro aplicado para este mes', 'info');
}

function diagnostico() {
    const diagnosticos = [];
    
    // Verificar conexión
    diagnosticos.push(`✅ Conectado al servidor`);
    
    // Verificar datos
    diagnosticos.push(`✅ Cajeros: ${cajeros.length} (${cajeros.filter(c => c.activo).length} activos)`);
    diagnosticos.push(`✅ Cargas: ${cargas.length}`);
    diagnosticos.push(`✅ Resumen: ${resumen.length} cajeros con total de $${resumen.reduce((sum, item) => sum + item.total, 0).toFixed(2)}`);
    
    // Verificar localStorage
    if (typeof(Storage) !== "undefined") {
        diagnosticos.push(`✅ localStorage disponible`);
    } else {
        diagnosticos.push(`❌ localStorage no disponible`);
    }
    
    // Verificar fetch API
    if (window.fetch) {
        diagnosticos.push(`✅ Fetch API disponible`);
    } else {
        diagnosticos.push(`❌ Fetch API no disponible`);
    }
    
    mostrarAlerta('Diagnóstico del Sistema', diagnosticos.join('\n'), 'info');
}

// ========== GLOBAL FUNCTIONS ==========
window.actualizarTodo = cargarDatosIniciales;
window.agregarCajero = agregarCajero;
window.agregarCarga = agregarCarga;
window.agregarCargaRapida = agregarCargaRapida;
window.editarCajero = editarCajero;
window.eliminarCajero = eliminarCajero;
window.eliminarCarga = eliminarCarga;
window.filtrarCargas = filtrarCargas;
window.limpiarFiltro = limpiarFiltro;
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
window.calcularComisiones = calcularComisiones;
window.mostrarConfiguracion = mostrarConfiguracion;
window.mostrarSeccion = mostrarSeccion;
window.cerrarAlerta = cerrarAlerta;
window.pagarCajero = pagarCajero;
window.verPendientes = verPendientes;
window.forzarOcultarLoading = forzarOcultarLoading;
window.generarReporteDiario = generarReporteDiario;
window.generarReporteSemanal = generarReporteSemanal;
window.generarReporteMensual = generarReporteMensual;
window.diagnostico = diagnostico;
window.actualizarListaCajeros = actualizarListaCajeros;
window.cargarCajeros = cargarCajeros;
window.cargarCargas = cargarCargas;
window.actualizarResumen = cargarResumen;
window.cargarDatosIniciales = cargarDatosIniciales;

// Emergency hide loading after 20 seconds
setTimeout(() => {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay && overlay.classList.contains('active')) {
        console.warn('⚠️ Emergency: Hiding loading overlay after 20 seconds');
        forzarOcultarLoading();
        mostrarAlerta('Timeout', 'La carga inicial tardó demasiado. Verifica tu conexión.', 'warning');
    }
}, 20000);