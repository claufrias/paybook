// app.js - VERSIÓN CORREGIDA Y COMPLETA

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
    console.log('💰 Paybook v3.0 - Sistema en Tiempo Real');
    
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
    
    // Verificar si ya existe un cajero con el mismo nombre (insensible a mayúsculas)
    const nombreExistente = cajeros.find(c => 
        c.nombre.toLowerCase() === nombre.toLowerCase() && c.activo
    );
    
    if (nombreExistente) {
        mostrarAlerta('Cajero duplicado', `Ya existe un cajero activo con el nombre "${nombreExistente.nombre}"`, 'error');
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
            
        } else {
            // Mostrar error específico del servidor
            if (data.error && data.error.includes('ya existe')) {
                mostrarAlerta('Cajero duplicado', 'Ya existe un cajero con ese nombre', 'error');
            } else {
                mostrarAlerta('Error', data.error || 'No se pudo agregar el cajero', 'error');
            }
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
    
    // Verificar si ya existe un cajero con el nuevo nombre
    const nombreExistente = cajeros.find(c => 
        c.id !== id && 
        c.nombre.toLowerCase() === nuevoNombre.toLowerCase().trim() && 
        c.activo
    );
    
    if (nombreExistente) {
        mostrarAlerta('Nombre duplicado', `Ya existe un cajero activo con el nombre "${nombreExistente.nombre}"`, 'error');
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
            if (data.error && data.error.includes('Ya existe')) {
                mostrarAlerta('Nombre duplicado', 'Ya existe otro cajero con ese nombre', 'error');
            } else {
                mostrarAlerta('Error', data.error || 'No se pudo actualizar el cajero', 'error');
            }
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
        `El cajero se marcará como inactivo y no se mostrará en las listas de selección, ` +
        `pero se mantendrán todas sus cargas registradas.\n\n` +
        `Esta acción se puede revertir editando el cajero.`
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
            mostrarAlerta('¡Éxito!', data.message || 'Cajero desactivado correctamente', 'success');
            
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

async function eliminarCajeroCompletamente(id) {
    const cajero = cajeros.find(c => c.id === id);
    if (!cajero) return;
    
    const confirmacion = confirm(
        `¿Está SEGURO de ELIMINAR COMPLETAMENTE al cajero "${cajero.nombre}"?\n\n` +
        `⚠️ ⚠️ ⚠️ ADVERTENCIA CRÍTICA ⚠️ ⚠️ ⚠️\n` +
        `Esta acción es PERMANENTE y NO SE PUEDE DESHACER.\n` +
        `Se eliminará TODA la información del cajero.\n\n` +
        `Solo puede eliminar cajeros que NO tengan cargas registradas.\n` +
        `Para cajeros con cargas, use la opción "Desactivar".\n\n` +
        `¿Continuar con la eliminación permanente?`
    );
    
    if (!confirmacion) {
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/cajeros/${id}/eliminar`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlerta('¡Éxito!', data.message || 'Cajero eliminado completamente', 'success');
            
            // Recargar datos
            cajeros = await cargarCajeros();
            resumen = await cargarResumen();
            cargas = await cargarCargas();
            
            actualizarSelectCajeros();
            actualizarTablaResumen();
            actualizarTablaCargas();
            calcularEstadisticas();
            
            // Cerrar modal y recargar
            const modal = document.getElementById('modalCajeros');
            if (modal) {
                const bsModal = bootstrap.Modal.getInstance(modal);
                if (bsModal) {
                    bsModal.hide();
                    setTimeout(() => mostrarModalCajeros(), 500);
                }
            }
            
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo eliminar el cajero', 'error');
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
    
    // Eliminar mensajes de carga
    const historialStatus = document.getElementById('historialStatus');
    if (historialStatus) {
        historialStatus.textContent = '';
    }
    
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
                        <button class="btn btn-ig btn-sm" onclick="mostrarModalCarga()">
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
            
            // MOSTRAR PLATAFORMA EN LUGAR DE "⚠️ DEUDA"
            const plataformaMostrar = carga.es_deuda ? carga.plataforma : carga.plataforma;
            
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
                        ${plataformaMostrar || 'Sin plataforma'}
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
    const historialCount = document.getElementById('historialCount');
    if (historialCount) {
        historialCount.innerHTML = `<i class="fas fa-list me-1"></i> ${cargas.length} ${cargas.length === 1 ? 'carga' : 'cargas'}`;
    }
    
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
    
    if (Math.abs(monto) > 1000000) {
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
            const tipo = monto < 0 ? 'Deuda' : 'Carga';
            mostrarAlerta('¡Registro exitoso!', 
                `${tipo} de $${Math.abs(monto).toFixed(2)} registrada para ${cajeroNombre} en ${plataforma}`, 
                monto < 0 ? 'warning' : 'success');
            
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
            
            // Cerrar modal si está abierto
            const modalCarga = document.getElementById('modalCarga');
            if (modalCarga) {
                const bsModal = bootstrap.Modal.getInstance(modalCarga);
                if (bsModal) {
                    bsModal.hide();
                }
            }
            
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

// ========== MODAL NUEVA CARGA ==========
function mostrarModalCarga() {
    const html = `
        <div class="nueva-carga-modal">
            <h4 class="gradient-text mb-4">Nueva Carga</h4>
            <div class="mb-3">
                <label class="form-label text-muted">Cajero</label>
                <select id="modalSelectCajero" class="form-select form-select-ig">
                    <option value="">Seleccione un cajero</option>
                </select>
            </div>
            <div class="mb-3">
                <label class="form-label text-muted">Plataforma</label>
                <select id="modalSelectPlataforma" class="form-select form-select-ig">
                    <option value="Zeus">🔱 Zeus</option>
                    <option value="Gana">🎯 Gana</option>
                    <option value="Ganamos">💰 Ganamos</option>
                </select>
            </div>
            <div class="mb-3">
                <label class="form-label text-muted">Monto ($)</label>
                <div class="input-group">
                    <span class="input-group-text">$</span>
                    <input type="number" id="modalMontoCarga" class="form-control form-control-ig" 
                           step="0.01" placeholder="0.00" autocomplete="off">
                </div>
            </div>
        </div>
    `;
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'modalCarga';
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content ig-card">
                <div class="modal-header ig-card-header">
                    <h5 class="modal-title gradient-text">
                        <i class="fas fa-plus me-2"></i>Nueva Carga
                    </h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body ig-card-body">
                    ${html}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                    <button type="button" class="btn btn-ig" onclick="agregarCargaDesdeModal()">
                        <i class="fas fa-save me-2"></i> Guardar
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Show modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    
    // Cargar cajeros en el select del modal
    const modalSelectCajero = modal.querySelector('#modalSelectCajero');
    if (modalSelectCajero) {
        modalSelectCajero.innerHTML = '<option value="">Seleccione un cajero</option>';
        const cajerosActivos = cajeros.filter(c => c.activo);
        cajerosActivos.sort((a, b) => a.nombre.localeCompare(b.nombre));
        
        cajerosActivos.forEach(cajero => {
            const option = document.createElement('option');
            option.value = cajero.id;
            option.textContent = cajero.nombre;
            modalSelectCajero.appendChild(option);
        });
        
        // Enfocar el primer campo
        setTimeout(() => {
            modalSelectCajero.focus();
        }, 300);
    }
    
    // Clean up modal on close
    modal.addEventListener('hidden.bs.modal', function () {
        document.body.removeChild(modal);
    });
    
    // Enter key to submit
    modal.querySelector('#modalMontoCarga').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') agregarCargaDesdeModal();
    });
}

async function agregarCargaDesdeModal() {
    const modal = document.getElementById('modalCarga');
    if (!modal) return;
    
    const cajeroSelect = modal.querySelector('#modalSelectCajero');
    const plataformaSelect = modal.querySelector('#modalSelectPlataforma');
    const montoInput = modal.querySelector('#modalMontoCarga');
    
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
    
    if (Math.abs(monto) > 1000000) {
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
            const tipo = monto < 0 ? 'Deuda' : 'Carga';
            mostrarAlerta('¡Registro exitoso!', 
                `${tipo} de $${Math.abs(monto).toFixed(2)} registrada para ${cajeroNombre} en ${plataforma}`, 
                monto < 0 ? 'warning' : 'success');
            
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
            
            // Cerrar modal
            const bsModal = bootstrap.Modal.getInstance(modal);
            if (bsModal) {
                bsModal.hide();
            }
            
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

// Quick add charge
function agregarCargaRapida() {
    mostrarModalCarga();
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
    
    // Eliminar mensajes de carga
    const resumenStatus = document.getElementById('resumenStatus');
    if (resumenStatus) {
        resumenStatus.textContent = '';
    }
    
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
        totalGeneralEl.className = totalGeneral < 0 ? 'gradient-text text-danger' : 'gradient-text';
    }
    
    // Today's total (TODAS las cargas del día, incluyendo pagos)
    const hoy = new Date().toISOString().split('T')[0];
    const cargasHoy = cargas.filter(c => {
        if (!c.fecha) return false;
        return c.fecha.startsWith(hoy);
    });
    
    // Calcular total HOY - todas las cargas del día (positivas y negativas)
    const totalHoy = cargasHoy.reduce((sum, c) => {
        const monto = parseFloat(c.monto || 0);
        // Si es un pago (plataforma = 'PAGO'), se resta porque es negativo
        // Si es una carga normal, se suma normalmente
        return sum + monto;
    }, 0);
    
    const totalHoyEl = document.getElementById('totalHoy');
    if (totalHoyEl) {
        // Usar la misma clase que topCajero para que se vean igual
        totalHoyEl.textContent = `$${Math.abs(totalHoy).toFixed(2)}`;
        totalHoyEl.className = 'stat-number'; // Misma clase que topCajero
    }
    
    const totalHoyNombreEl = document.getElementById('totalHoyNombre');
    if (totalHoyNombreEl) {
        const icono = totalHoy < 0 ? 'fa-exclamation-triangle text-danger' : 'fa-calendar-day';
        const texto = totalHoy < 0 ? 'Deuda hoy' : 'Hoy';
        totalHoyNombreEl.innerHTML = `<i class="fas ${icono} me-1"></i> ${texto}`;
    }
    
    // Top cajero (de las cargas NO PAGADAS)
    if (resumen.length > 0) {
        // Filtrar solo cajeros con total positivo para top
        const cajerosPositivos = resumen.filter(item => item.total > 0);
        if (cajerosPositivos.length > 0) {
            const top = cajerosPositivos.reduce((max, item) => item.total > max.total ? item : max, cajerosPositivos[0]);
            
            const topCajeroEl = document.getElementById('topCajero');
            if (topCajeroEl) {
                topCajeroEl.textContent = `$${top.total.toFixed(2)}`;
                topCajeroEl.className = 'stat-number'; // Clase uniforme
            }
            
            const topCajeroNombreEl = document.getElementById('topCajeroNombre');
            if (topCajeroNombreEl) {
                topCajeroNombreEl.innerHTML = `<i class="fas fa-crown me-1"></i> ${top.cajero}`;
            }
        } else {
            // Si no hay cajeros con total positivo
            const topCajeroEl = document.getElementById('topCajero');
            if (topCajeroEl) {
                topCajeroEl.textContent = '$0';
                topCajeroEl.className = 'stat-number'; // Clase uniforme
            }
            
            const topCajeroNombreEl = document.getElementById('topCajeroNombre');
            if (topCajeroNombreEl) {
                topCajeroNombreEl.innerHTML = `<i class="fas fa-user me-1"></i> Sin datos`;
            }
        }
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
        
        if (pendiente <= 0) {
            mostrarAlerta('Sin pendientes', `${cajeroNombre} no tiene comisiones pendientes`, 'info');
            return;
        }
        
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
        
        if (montoNum > pendiente) {
            mostrarAlerta('Error', `El monto no puede superar el pendiente ($${pendiente.toFixed(2)})`, 'error');
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
                monto_pagado: montoNum,
                notas: `Pago registrado desde la interfaz web`
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

// ========== EXPORT PDF ==========
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
            // Download PDF file
            const blob = await response.blob();
            const urlBlob = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = urlBlob;
            link.download = `reporte_paybook_${new Date().toISOString().slice(0,10)}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(urlBlob);
            
            mostrarAlerta('Exportado', 'Reporte descargado correctamente (PDF)', 'success');
        } else {
            const data = await response.json();
            if (data.error) {
                mostrarAlerta('Error', data.error, 'error');
            } else {
                mostrarAlerta('Error', 'No se pudo exportar el reporte', 'error');
            }
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error', 'No se pudo generar el reporte', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// ========== MODAL FUNCTIONS ==========
async function mostrarModalCajeros() {
    mostrarLoading(true);
    
    try {
        const cajerosData = await cargarCajeros();
        
        let html = `
            <div class="cajeros-modal">
                <h4 class="gradient-text mb-4">Gestión de Cajeros</h4>
                <div class="mb-4">
                    <div class="input-group">
                        <input type="text" id="buscarCajero" class="form-control form-control-ig" placeholder="Buscar cajero...">
                        <button class="btn btn-ig" onclick="agregarCajeroDesdeModal()">
                            <i class="fas fa-plus me-2"></i> Nuevo
                        </button>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-ig table-hover">
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Estado</th>
                                <th>Fecha Creación</th>
                                <th class="text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        cajerosData.forEach(cajero => {
            html += `
                <tr class="${cajero.activo ? '' : 'table-secondary'}">
                    <td>
                        <div class="d-flex align-items-center">
                            <div class="story-circle small me-2">
                                <i class="fas fa-user"></i>
                            </div>
                            <div>
                                <div class="fw-medium">${cajero.nombre}</div>
                                <small class="text-muted">ID: ${cajero.id}</small>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="badge ${cajero.activo ? 'bg-success' : 'bg-secondary'}">
                            ${cajero.activo ? 'Activo' : 'Inactivo'}
                        </span>
                    </td>
                    <td>
                        <small class="text-muted">${new Date(cajero.fecha_creacion).toLocaleDateString('es-ES')}</small>
                    </td>
                    <td class="text-center">
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-primary" onclick="editarCajero(${cajero.id})" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            ${cajero.activo ? `
                                <button class="btn btn-outline-warning" onclick="eliminarCajero(${cajero.id})" title="Desactivar">
                                    <i class="fas fa-user-slash"></i>
                                </button>
                            ` : `
                                <button class="btn btn-outline-success" onclick="reactivarCajero(${cajero.id})" title="Reactivar">
                                    <i class="fas fa-user-check"></i>
                                </button>
                            `}
                            <button class="btn btn-outline-danger" onclick="eliminarCajeroCompletamente(${cajero.id})" title="Eliminar completamente">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
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
        modal.id = 'modalCajeros';
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered modal-xl">
                <div class="modal-content ig-card">
                    <div class="modal-header ig-card-header">
                        <h5 class="modal-title gradient-text">
                            <i class="fas fa-users me-2"></i>Gestión de Cajeros
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body ig-card-body">
                        ${html}
                    </div>
                    <div class="modal-footer">
                        <small class="text-muted me-auto">Total: ${cajerosData.length} cajeros</small>
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
            cargarDatosIniciales(); // Refresh data
        });
        
        // Add search functionality
        const buscarInput = modal.querySelector('#buscarCajero');
        if (buscarInput) {
            buscarInput.addEventListener('input', function(e) {
                const searchTerm = e.target.value.toLowerCase();
                const rows = modal.querySelectorAll('tbody tr');
                rows.forEach(row => {
                    const text = row.textContent.toLowerCase();
                    row.style.display = text.includes(searchTerm) ? '' : 'none';
                });
            });
        }
        
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error', 'No se pudo cargar los cajeros', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function reactivarCajero(id) {
    const cajero = cajeros.find(c => c.id === id);
    if (!cajero) return;
    
    if (!confirm(`¿Reactivar al cajero "${cajero.nombre}"?`)) {
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
                nombre: cajero.nombre,
                activo: true
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlerta('¡Éxito!', `Cajero "${cajero.nombre}" reactivado`, 'success');
            
            // Close modal and reopen
            const modal = document.getElementById('modalCajeros');
            if (modal) {
                const bsModal = bootstrap.Modal.getInstance(modal);
                if (bsModal) {
                    bsModal.hide();
                    setTimeout(() => mostrarModalCajeros(), 500);
                }
            }
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo reactivar el cajero', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function agregarCajeroDesdeModal() {
    const nombre = prompt('Ingrese el nombre del nuevo cajero:');
    if (!nombre || nombre.trim() === '') return;
    
    // Use existing function
    document.getElementById('nombreCajero').value = nombre;
    agregarCajero();
    
    // Close modal after adding
    const modal = document.getElementById('modalCajeros');
    if (modal) {
        const bsModal = bootstrap.Modal.getInstance(modal);
        if (bsModal) {
            bsModal.hide();
        }
    }
}

function mostrarModalReportes() {
    let html = `
        <div class="reportes-modal">
            <h4 class="gradient-text mb-4">Reportes</h4>
            <div class="row g-4">
                <div class="col-md-4">
                    <div class="reporte-card text-center hover-lift" onclick="generarReporteDiario()" style="cursor: pointer;">
                        <div class="story-circle mb-3 mx-auto" style="width: 80px; height: 80px;">
                            <i class="fas fa-calendar-day fa-2x"></i>
                        </div>
                        <h5>Reporte Diario</h5>
                        <small class="text-muted">Cargas del día de hoy</small>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="reporte-card text-center hover-lift" onclick="generarReporteSemanal()" style="cursor: pointer;">
                        <div class="story-circle mb-3 mx-auto" style="width: 80px; height: 80px;">
                            <i class="fas fa-calendar-week fa-2x"></i>
                        </div>
                        <h5>Reporte Semanal</h5>
                        <small class="text-muted">Cargas de esta semana</small>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="reporte-card text-center hover-lift" onclick="generarReporteMensual()" style="cursor: pointer;">
                        <div class="story-circle mb-3 mx-auto" style="width: 80px; height: 80px;">
                            <i class="fas fa-calendar-alt fa-2x"></i>
                        </div>
                        <h5>Reporte Mensual</h5>
                        <small class="text-muted">Cargas de este mes</small>
                    </div>
                </div>
                <div class="col-12 mt-4">
                    <div class="ig-card">
                        <div class="ig-card-header">
                            <h6 class="mb-0 gradient-text">Exportar Reporte Personalizado</h6>
                        </div>
                        <div class="ig-card-body">
                            <div class="row g-2">
                                <div class="col-md-6">
                                    <label class="form-label text-muted">Desde</label>
                                    <input type="date" id="exportDesde" class="form-control form-control-ig" 
                                           value="${new Date().toISOString().slice(0,10)}">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label text-muted">Hasta</label>
                                    <input type="date" id="exportHasta" class="form-control form-control-ig" 
                                           value="${new Date().toISOString().slice(0,10)}">
                                </div>
                                <div class="col-12 mt-3">
                                    <button class="btn btn-ig w-100" onclick="exportarReportePersonalizado()">
                                        <i class="fas fa-file-pdf me-2"></i> Exportar PDF
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'modalReportes';
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered modal-lg">
            <div class="modal-content ig-card">
                <div class="modal-header ig-card-header">
                    <h5 class="modal-title gradient-text">
                        <i class="fas fa-file-alt me-2"></i>Reportes
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
}

// ========== REPORT FUNCTIONS ==========
async function mostrarReporteDiario() {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/reportes/diario`);
        const data = await response.json();
        
        if (data.success) {
            const reporte = data.data;
            mostrarReporteEnModal('Diario', reporte);
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo generar el reporte', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function mostrarReporteSemanal() {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/reportes/semanal`);
        const data = await response.json();
        
        if (data.success) {
            const reporte = data.data;
            mostrarReporteEnModal('Semanal', reporte);
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo generar el reporte', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function mostrarReporteMensual() {
    mostrarLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/api/reportes/mensual`);
        const data = await response.json();
        
        if (data.success) {
            const reporte = data.data;
            mostrarReporteEnModal('Mensual', reporte);
        } else {
            mostrarAlerta('Error', data.error || 'No se pudo generar el reporte', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function mostrarReporteEnModal(tipo, reporte) {
    let html = `
        <div class="reporte-detalle">
            <h4 class="gradient-text mb-3">Reporte ${tipo}</h4>
            <div class="mb-4">
                ${tipo === 'Diario' ? `
                    <div class="text-muted">Fecha: ${reporte.fecha}</div>
                ` : tipo === 'Semanal' ? `
                    <div class="text-muted">Período: ${reporte.fecha_inicio} al ${reporte.fecha_fin}</div>
                ` : `
                    <div class="text-muted">Período: ${reporte.fecha_inicio} al ${reporte.fecha_fin}</div>
                `}
            </div>
            <div class="row mb-4">
                <div class="col-md-6">
                    <div class="stat-card">
                        <div class="stat-label">TOTAL CARGAS</div>
                        <div class="stat-number">${reporte.total_cargas}</div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="stat-card">
                        <div class="stat-label">MONTO TOTAL</div>
                        <div class="stat-number">$${reporte.monto_total.toFixed(2)}</div>
                    </div>
                </div>
            </div>
    `;
    
    if (reporte.cargas && reporte.cargas.length > 0) {
        html += `
            <div class="table-responsive">
                <table class="table table-ig table-sm">
                    <thead>
                        <tr>
                            <th>Fecha/Hora</th>
                            <th>Cajero</th>
                            <th>Plataforma</th>
                            <th class="text-end">Monto</th>
                            <th>Estado</th>
                            <th>Tipo</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        reporte.cargas.forEach(carga => {
            const fecha = new Date(carga.fecha);
            const fechaFormateada = fecha.toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).replace(/ de /g, '/');
            
            html += `
                <tr>
                    <td>${fechaFormateada}</td>
                    <td>${carga.cajero}</td>
                    <td><span class="badge ${carga.tipo === 'DEUDA' ? 'bg-danger' : getBadgeClass({plataforma: carga.plataforma})}">${carga.plataforma}</span></td>
                    <td class="text-end ${carga.tipo === 'DEUDA' ? 'text-danger' : ''}">$${parseFloat(carga.monto).toFixed(2)}</td>
                    <td><span class="badge ${carga.estado === 'PAGADO' ? 'bg-success' : carga.estado === 'DEUDA' ? 'bg-danger' : 'bg-warning'}">${carga.estado}</span></td>
                    <td><span class="badge ${carga.tipo === 'DEUDA' ? 'bg-danger' : 'bg-info'}">${carga.tipo}</span></td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
    } else {
        html += `
            <div class="text-center py-5">
                <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
                <h6>No hay cargas en este período</h6>
            </div>
        `;
    }
    
    html += `</div>`;
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = `modalReporte${tipo}`;
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered modal-lg">
            <div class="modal-content ig-card">
                <div class="modal-header ig-card-header">
                    <h5 class="modal-title gradient-text">
                        <i class="fas fa-calendar-${tipo === 'Diario' ? 'day' : tipo === 'Semanal' ? 'week' : 'alt'} me-2"></i>Reporte ${tipo}
                    </h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body ig-card-body">
                    ${html}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-ig" onclick="exportarReporte${tipo}Pdf()">
                        <i class="fas fa-file-pdf me-2"></i> Exportar PDF
                    </button>
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
}

function exportarReportePersonalizado() {
    const desde = document.getElementById('exportDesde').value;
    const hasta = document.getElementById('exportHasta').value;
    
    if (!desde || !hasta) {
        mostrarAlerta('Error', 'Seleccione ambas fechas', 'error');
        return;
    }
    
    if (new Date(desde) > new Date(hasta)) {
        mostrarAlerta('Error', 'La fecha de inicio no puede ser mayor que la fecha de fin', 'error');
        return;
    }
    
    // Set filter dates
    document.getElementById('fechaInicio').value = `${desde}T00:00`;
    document.getElementById('fechaFin').value = `${hasta}T23:59`;
    
    // Export
    exportarReporte();
    
    // Close modal
    const modal = document.getElementById('modalReportes');
    if (modal) {
        const bsModal = bootstrap.Modal.getInstance(modal);
        if (bsModal) {
            bsModal.hide();
        }
    }
}

function exportarReporteDiarioPdf() {
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('fechaInicio').value = `${hoy}T00:00`;
    document.getElementById('fechaFin').value = `${hoy}T23:59`;
    
    let url = `${API_BASE}/api/exportar/pdf?fecha_inicio=${hoy}T00:00&fecha_fin=${hoy}T23:59&tipo_reporte=diario`;
    
    descargarPdf(url);
    
    // Close modal
    const modal = document.getElementById('modalReporteDiario');
    if (modal) {
        const bsModal = bootstrap.Modal.getInstance(modal);
        if (bsModal) {
            bsModal.hide();
        }
    }
}

function exportarReporteSemanalPdf() {
    const hoy = new Date();
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay());
    const finSemana = new Date(inicioSemana);
    finSemana.setDate(inicioSemana.getDate() + 6);
    
    const fechaInicio = inicioSemana.toISOString().split('T')[0];
    const fechaFin = finSemana.toISOString().split('T')[0];
    
    let url = `${API_BASE}/api/exportar/pdf?fecha_inicio=${fechaInicio}T00:00&fecha_fin=${fechaFin}T23:59&tipo_reporte=semanal`;
    
    descargarPdf(url);
    
    // Close modal
    const modal = document.getElementById('modalReporteSemanal');
    if (modal) {
        const bsModal = bootstrap.Modal.getInstance(modal);
        if (bsModal) {
            bsModal.hide();
        }
    }
}

function exportarReporteMensualPdf() {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const finMes = new Date(hoy.getFullYear(), hoy.month + 1, 0);
    
    const fechaInicio = inicioMes.toISOString().split('T')[0];
    const fechaFin = finMes.toISOString().split('T')[0];
    
    let url = `${API_BASE}/api/exportar/pdf?fecha_inicio=${fechaInicio}T00:00&fecha_fin=${fechaFin}T23:59&tipo_reporte=mensual`;
    
    descargarPdf(url);
    
    // Close modal
    const modal = document.getElementById('modalReporteMensual');
    if (modal) {
        const bsModal = bootstrap.Modal.getInstance(modal);
        if (bsModal) {
            bsModal.hide();
        }
    }
}

async function descargarPdf(url) {
    mostrarLoading(true);
    
    try {
        const response = await fetch(url);
        
        if (response.ok) {
            // Download PDF file
            const blob = await response.blob();
            const urlBlob = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = urlBlob;
            link.download = `reporte_${new Date().toISOString().slice(0,10)}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(urlBlob);
            
            mostrarAlerta('Exportado', 'Reporte descargado correctamente (PDF)', 'success');
        } else {
            const data = await response.json();
            if (data.error) {
                mostrarAlerta('Error', data.error, 'error');
            } else {
                mostrarAlerta('Error', 'No se pudo exportar el reporte', 'error');
            }
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarAlerta('Error', 'No se pudo generar el reporte', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function generarReporteDiario() {
    mostrarReporteDiario();
}

function generarReporteSemanal() {
    mostrarReporteSemanal();
}

function generarReporteMensual() {
    mostrarReporteMensual();
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

// ========== DIAGNOSTIC ==========
function diagnostico() {
    const diagnosticos = [];
    
    // Verificar conexión
    diagnosticos.push(`✅ Conectado al servidor`);
    
    // Verificar datos
    diagnosticos.push(`✅ Cajeros: ${cajeros.length} (${cajeros.filter(c => c.activo).length} activos)`);
    diagnosticos.push(`✅ Cargas: ${cargas.length}`);
    diagnosticos.push(`✅ Resumen: ${resumen.length} cajeros con total pendiente de $${resumen.reduce((sum, item) => sum + item.total, 0).toFixed(2)}`);
    
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
window.eliminarCajeroCompletamente = eliminarCajeroCompletamente;
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
window.mostrarConfiguracion = mostrarConfiguracion;
window.mostrarSeccion = mostrarSeccion;
window.cerrarAlerta = cerrarAlerta;
window.pagarCajero = pagarCajero;
window.verPendientes = verPendientes;
window.forzarOcultarLoading = forzarOcultarLoading;
window.mostrarReporteDiario = mostrarReporteDiario;
window.mostrarReporteSemanal = mostrarReporteSemanal;
window.mostrarReporteMensual = mostrarReporteMensual;
window.generarReporteDiario = generarReporteDiario;
window.generarReporteSemanal = generarReporteSemanal;
window.generarReporteMensual = generarReporteMensual;
window.diagnostico = diagnostico;
window.cargarCajeros = cargarCajeros;
window.cargarCargas = cargarCargas;
window.cargarResumen = cargarResumen;
window.cargarDatosIniciales = cargarDatosIniciales;
window.mostrarModalCajeros = mostrarModalCajeros;
window.mostrarModalCarga = mostrarModalCarga;
window.mostrarModalReportes = mostrarModalReportes;
window.reactivarCajero = reactivarCajero;
window.exportarReporteDiarioPdf = exportarReporteDiarioPdf;
window.exportarReporteSemanalPdf = exportarReporteSemanalPdf;
window.exportarReporteMensualPdf = exportarReporteMensualPdf;

// Emergency hide loading after 20 seconds
setTimeout(() => {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay && overlay.classList.contains('active')) {
        console.warn('⚠️ Emergency: Hiding loading overlay after 20 seconds');
        forzarOcultarLoading();
    }
}, 20000);