// admin.js - Funciones del panel de administración

// Variables globales del admin
let adminStats = null;
let pagosPendientes = [];
let usuariosList = [];
let usuariosChartInstance = null;
let ingresosChartInstance = null;

// ========== FUNCIONES DEL DASHBOARD ==========

async function cargarEstadisticasAdmin() {
    mostrarLoading(true);
    
    try {
        // Cargar múltiples datos en paralelo
        const [estadisticasRes, pagosRes, usuariosRes] = await Promise.all([
            fetch('/api/estadisticas/admin'),
            fetch('/api/admin/pagos/pendientes'),
            fetch('/api/admin/usuarios')
        ]);
        
        const estadisticasData = await estadisticasRes.json();
        const pagosData = await pagosRes.json();
        const usuariosData = await usuariosRes.json();
        
        if (estadisticasData.success) {
            adminStats = estadisticasData.data;
            actualizarDashboardAdmin();
            actualizarTablaEstadisticas(adminStats);
            inicializarGraficos(adminStats);
            inicializarGraficos();
        }
        
        if (pagosData.success) {
            pagosPendientes = pagosData.data;
            actualizarContadorPagos(pagosData.data.length);
        }
        
        if (usuariosData.success) {
            usuariosList = usuariosData.data;
            actualizarContadorUsuarios(usuariosData.data.length);
            actualizarEstadisticasUsuarios(usuariosData.data);
        }
        
    } catch (error) {
        console.error('Error cargando estadísticas admin:', error);
        mostrarAlertaAdmin('Error', 'No se pudieron cargar las estadísticas', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function actualizarDashboardAdmin() {
    if (!adminStats) return;
    
    // Actualizar tarjetas
    document.getElementById('adminTotalUsuarios').textContent = adminStats.total_usuarios || 0;
    document.getElementById('adminPagosHoy').textContent = `$${adminStats.ingresos_hoy || 0}`;
    document.getElementById('adminPagosPendientes').textContent = adminStats.pagos_pendientes || 0;
    document.getElementById('adminIngresosMes').textContent = `$${adminStats.ingresos_mes || 0}`;
    document.getElementById('adminUsuariosActivos').textContent = adminStats.usuarios_activos || 0;
    document.getElementById('adminDBSize').textContent = adminStats.db_size || '0 MB';
    document.getElementById('adminLastBackup').textContent = adminStats.ultimo_backup || '--';
    
    // Actualizar contadores en sidebar
    actualizarContadorPagos(adminStats.pagos_pendientes || 0);
    actualizarContadorUsuarios(adminStats.total_usuarios || 0);
}

function actualizarContadorPagos(count) {
    const badge = document.getElementById('pagosPendientesCount');
    if (badge) {
        badge.textContent = count;
        if (count > 0) {
            badge.classList.add('bg-danger');
            badge.classList.remove('bg-secondary');
        } else {
            badge.classList.remove('bg-danger');
            badge.classList.add('bg-secondary');
        }
    }
}

function actualizarContadorUsuarios(count) {
    const badge = document.getElementById('totalUsuariosCount');
    if (badge) {
        badge.textContent = count;
    }
}

function actualizarEstadisticasUsuarios(usuarios) {
    if (!Array.isArray(usuarios)) return;

    const total = usuarios.length;
    const activos = usuarios.filter(usuario => usuario.activo).length;

    const totalEl = document.getElementById('adminTotalUsuarios');
    if (totalEl) {
        totalEl.textContent = total;
    }

    const activosEl = document.getElementById('adminUsuariosActivos');
    if (activosEl) {
        activosEl.textContent = activos;
    }

    actualizarContadorUsuarios(total);
}

function actualizarTablaEstadisticas(stats) {
    const tbody = document.getElementById('estadisticasTable');
    if (!tbody) return;
    if (!stats) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted">Sin datos disponibles</td>
            </tr>
        `;
        return;
    }

    const totalUsuarios = stats.total_usuarios || 0;
    const usuariosActivos = stats.usuarios_activos || 0;
    const conversion = totalUsuarios ? Math.round((usuariosActivos / totalUsuarios) * 100) : 0;

    tbody.innerHTML = `
        <tr>
            <td>Hoy</td>
            <td>${usuariosActivos}</td>
            <td>$${stats.ingresos_hoy || 0}</td>
            <td>${stats.pagos_pendientes || 0}</td>
            <td>${conversion}%</td>
        </tr>
        <tr>
            <td>Mes</td>
            <td>${totalUsuarios}</td>
            <td>$${stats.ingresos_mes || 0}</td>
            <td>${stats.pagos_pendientes || 0}</td>
            <td>${conversion}%</td>
        </tr>
    `;
}

// ========== GESTIÓN DE PAGOS PENDIENTES ==========

async function cargarPagosPendientes() {
    mostrarLoading(true);
    
    try {
        const response = await fetch('/api/admin/pagos/pendientes');
        const data = await response.json();
        
        if (data.success) {
            pagosPendientes = data.data;
            actualizarTablaPagosPendientes(data.data);
            actualizarContadorPagos(data.data.length);
        } else {
            mostrarAlertaAdmin('Error', data.error || 'No se pudieron cargar los pagos', 'error');
        }
    } catch (error) {
        console.error('Error cargando pagos pendientes:', error);
        mostrarAlertaAdmin('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function actualizarTablaPagosPendientes(pagos) {
    const tbody = document.getElementById('adminPagosTable');
    if (!tbody) return;
    
    if (pagos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted py-5">
                    <div class="mb-3">
                        <i class="fas fa-check-circle fa-2x text-success"></i>
                    </div>
                    <h6>¡Todo al día!</h6>
                    <small class="text-muted">No hay pagos pendientes por verificar</small>
                </td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    
    pagos.forEach(pago => {
        const fechaSolicitud = new Date(pago.fecha_solicitud);
        const fechaFormateada = fechaSolicitud.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Generar enlace de WhatsApp
        const mensaje = `Hola ${pago.usuario_nombre}! Confirmo que recibí tu pago de $${pago.monto} con código ${pago.codigo}. ¡Gracias!`;
        const whatsappUrl = `https://wa.me/${pago.usuario_telefono || '584121234567'}?text=${encodeURIComponent(mensaje)}`;
        
        html += `
            <tr>
                <td>
                    <code class="text-warning">${pago.codigo}</code>
                </td>
                <td>
                    <div>
                        <strong>${pago.usuario_nombre || 'Sin nombre'}</strong>
                        <div class="text-muted small">${pago.usuario_email}</div>
                    </div>
                </td>
                <td class="fw-bold">$${pago.monto}</td>
                <td>
                    <span class="badge bg-info">${pago.plan}</span>
                </td>
                <td>
                    <small>${fechaFormateada}</small>
                    <div class="text-muted smaller">
                        ${tiempoTranscurrido(fechaSolicitud)}
                    </div>
                </td>
                <td>
                    ${pago.usuario_telefono ? `
                        <a href="${whatsappUrl}" target="_blank" class="btn btn-sm btn-success">
                            <i class="fab fa-whatsapp"></i> Contactar
                        </a>
                    ` : '<span class="text-muted">Sin teléfono</span>'}
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-success" onclick="verificarPagoAdmin('${pago.codigo}')" title="Verificar pago">
                            <i class="fas fa-check"></i> Verificar
                        </button>
                        <button class="btn btn-danger" onclick="rechazarPagoAdmin('${pago.codigo}')" title="Rechazar pago">
                            <i class="fas fa-times"></i>
                        </button>
                        <button class="btn btn-info" onclick="verDetallesPago('${pago.codigo}')" title="Ver detalles">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

async function verificarPagoAdmin(codigo) {
    if (!confirm(`¿Estás seguro de verificar el pago con código ${codigo}?`)) {
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`/api/admin/pagos/verificar/${codigo}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlertaAdmin('¡Éxito!', data.message, 'success');
            // Recargar pagos pendientes
            await cargarPagosPendientes();
            // Recargar estadísticas
            await cargarEstadisticasAdmin();
        } else {
            mostrarAlertaAdmin('Error', data.error || 'No se pudo verificar el pago', 'error');
        }
    } catch (error) {
        console.error('Error verificando pago:', error);
        mostrarAlertaAdmin('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function rechazarPagoAdmin(codigo) {
    const razon = prompt('Ingresa la razón por la que rechazas este pago:');
    if (!razon) return;
    
    if (!confirm(`¿Rechazar el pago ${codigo}?\nRazón: ${razon}`)) {
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`/api/admin/pagos/rechazar/${codigo}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ razon })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlertaAdmin('Pago rechazado', 'El pago ha sido rechazado', 'warning');
            // Recargar pagos pendientes
            await cargarPagosPendientes();
        } else {
            mostrarAlertaAdmin('Error', data.error || 'No se pudo rechazar el pago', 'error');
        }
    } catch (error) {
        console.error('Error rechazando pago:', error);
        mostrarAlertaAdmin('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function verDetallesPago(codigo) {
    const pago = pagosPendientes.find(p => p.codigo === codigo);
    if (!pago) return;
    
    const modalHtml = `
        <div class="modal fade" id="modalDetallesPago" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content ig-card">
                    <div class="modal-header ig-card-header">
                        <h5 class="modal-title gradient-text">
                            <i class="fas fa-search me-2"></i>Detalles del Pago
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body ig-card-body">
                        <div class="mb-4">
                            <h6 class="text-muted mb-2">Código de Pago</h6>
                            <div class="display-6 text-center text-warning fw-bold">${pago.codigo}</div>
                        </div>
                        
                        <div class="row mb-3">
                            <div class="col-6">
                                <small class="text-muted d-block">Usuario</small>
                                <strong>${pago.usuario_nombre || 'Sin nombre'}</strong>
                                <div class="text-muted small">${pago.usuario_email}</div>
                            </div>
                            <div class="col-6">
                                <small class="text-muted d-block">Teléfono</small>
                                <strong>${pago.usuario_telefono || 'No registrado'}</strong>
                            </div>
                        </div>
                        
                        <div class="row mb-3">
                            <div class="col-6">
                                <small class="text-muted d-block">Monto</small>
                                <strong class="fs-4">$${pago.monto}</strong>
                            </div>
                            <div class="col-6">
                                <small class="text-muted d-block">Plan</small>
                                <span class="badge bg-info fs-6">${pago.plan}</span>
                            </div>
                        </div>
                        
                        <div class="mb-3">
                            <small class="text-muted d-block">Fecha de Solicitud</small>
                            <strong>${new Date(pago.fecha_solicitud).toLocaleString('es-ES')}</strong>
                            <div class="text-muted small">
                                Hace ${tiempoTranscurrido(new Date(pago.fecha_solicitud))}
                            </div>
                        </div>
                        
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle me-2"></i>
                            <strong>Instrucciones:</strong>
                            <ol class="mt-2 mb-0">
                                <li>Verifica que recibiste la transferencia</li>
                                <li>Confirma que el monto coincide</li>
                                <li>Contacta al usuario si hay dudas</li>
                                <li>Click en "Verificar" para activar la cuenta</li>
                            </ol>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                        ${pago.usuario_telefono ? `
                            <a href="https://wa.me/${pago.usuario_telefono}" target="_blank" class="btn btn-success">
                                <i class="fab fa-whatsapp me-2"></i> Contactar
                            </a>
                        ` : ''}
                        <button type="button" class="btn btn-ig" onclick="verificarPagoAdmin('${pago.codigo}')">
                            <i class="fas fa-check me-2"></i> Verificar Pago
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
    const modal = new bootstrap.Modal(document.getElementById('modalDetallesPago'));
    modal.show();
    
    // Limpiar al cerrar
    modalContainer.querySelector('#modalDetallesPago').addEventListener('hidden.bs.modal', function () {
        document.body.removeChild(modalContainer);
    });
}

// ========== GESTIÓN DE USUARIOS ==========

async function cargarUsuarios() {
    mostrarLoading(true);
    
    try {
        const response = await fetch('/api/admin/usuarios');
        const data = await response.json();
        
        if (data.success) {
            usuariosList = data.data;
            actualizarTablaUsuarios(data.data);
            actualizarContadorUsuarios(data.data.length);
        } else {
            mostrarAlertaAdmin('Error', data.error || 'No se pudieron cargar los usuarios', 'error');
        }
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        mostrarAlertaAdmin('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function actualizarTablaUsuarios(usuarios) {
    const tbody = document.getElementById('adminUsuariosTable');
    if (!tbody) return;
    
    if (usuarios.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-muted py-5">
                    <div class="mb-3">
                        <i class="fas fa-users fa-2x text-muted"></i>
                    </div>
                    <h6>No hay usuarios registrados</h6>
                </td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    
    usuarios.forEach(usuario => {
        const fechaRegistro = new Date(usuario.fecha_registro);
        const fechaExpiracion = usuario.fecha_expiracion ? new Date(usuario.fecha_expiracion) : null;
        
        // Determinar estado
        let estadoBadge = '';
        if (!usuario.activo) {
            estadoBadge = '<span class="badge bg-secondary">Inactivo</span>';
        } else if (usuario.plan === 'expired') {
            estadoBadge = '<span class="badge bg-danger">Expirado</span>';
        } else if (usuario.plan === 'trial') {
            estadoBadge = '<span class="badge bg-warning">Prueba</span>';
        } else if (usuario.plan === 'admin') {
            estadoBadge = '<span class="badge bg-gradient">Admin</span>';
        } else {
            estadoBadge = '<span class="badge bg-success">Activo</span>';
        }
        
        // Determinar color de plan
        let planClass = 'text-muted';
        if (usuario.plan === 'premium') planClass = 'text-warning';
        if (usuario.plan === 'admin') planClass = 'text-danger';
        
        html += `
            <tr>
                <td>${usuario.id}</td>
                <td>
                    <div>
                        <strong>${usuario.email}</strong>
                        ${usuario.nombre ? `<div class="text-muted small">${usuario.nombre}</div>` : ''}
                    </div>
                </td>
                <td>${usuario.nombre || '--'}</td>
                <td>
                    <span class="${planClass} fw-bold">${usuario.plan.toUpperCase()}</span>
                </td>
                <td>
                    ${fechaExpiracion ? `
                        <div>${fechaExpiracion.toLocaleDateString()}</div>
                        <div class="text-muted smaller">
                            ${diasRestantes(fechaExpiracion)} días
                        </div>
                    ` : '--'}
                </td>
                <td>
                    <small>${fechaRegistro.toLocaleDateString()}</small>
                </td>
                <td>${estadoBadge}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="editarUsuario(${usuario.id})" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-outline-${usuario.activo ? 'warning' : 'success'}" 
                                onclick="${usuario.activo ? 'desactivarUsuario' : 'activarUsuario'}(${usuario.id})"
                                title="${usuario.activo ? 'Desactivar' : 'Activar'}">
                            <i class="fas fa-${usuario.activo ? 'user-slash' : 'user-check'}"></i>
                        </button>
                        <button class="btn btn-outline-info" onclick="verUsuario(${usuario.id})" title="Ver detalles">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

function buscarUsuarios(termino) {
    if (!termino.trim()) {
        actualizarTablaUsuarios(usuariosList);
        return;
    }
    
    termino = termino.toLowerCase();
    const usuariosFiltrados = usuariosList.filter(usuario => 
        usuario.email.toLowerCase().includes(termino) ||
        (usuario.nombre && usuario.nombre.toLowerCase().includes(termino)) ||
        usuario.plan.toLowerCase().includes(termino)
    );
    
    actualizarTablaUsuarios(usuariosFiltrados);
}

async function verUsuario(id) {
    const usuario = usuariosList.find(u => u.id === id);
    if (!usuario) return;
    
    // Cargar estadísticas específicas del usuario
    mostrarLoading(true);
    
    try {
        const response = await fetch(`/api/admin/usuarios/${id}/estadisticas`);
        const data = await response.json();
        
        let estadisticasHtml = '';
        if (data.success) {
            const stats = data.data;
            estadisticasHtml = `
                <div class="row mt-3">
                    <div class="col-6">
                        <small class="text-muted d-block">Cajeros activos</small>
                        <strong class="fs-5">${stats.cajeros_activos || 0}</strong>
                    </div>
                    <div class="col-6">
                        <small class="text-muted d-block">Total cargas</small>
                        <strong class="fs-5">${stats.total_cargas || 0}</strong>
                    </div>
                    <div class="col-6">
                        <small class="text-muted d-block">Total pendiente</small>
                        <strong class="fs-5">$${stats.total_pendiente || 0}</strong>
                    </div>
                    <div class="col-6">
                        <small class="text-muted d-block">Última actividad</small>
                        <strong class="fs-5">${stats.ultima_actividad || '--'}</strong>
                    </div>
                </div>
            `;
        }
        
        const modalHtml = `
            <div class="modal fade" id="modalVerUsuario" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered modal-lg">
                    <div class="modal-content ig-card">
                        <div class="modal-header ig-card-header">
                            <h5 class="modal-title gradient-text">
                                <i class="fas fa-user me-2"></i>Detalles del Usuario
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body ig-card-body">
                            <div class="row">
                                <div class="col-md-3 text-center mb-3">
                                    <div class="story-circle mx-auto mb-2" style="width: 80px; height: 80px;">
                                        <i class="fas fa-user fa-2x"></i>
                                    </div>
                                    <div class="fw-bold">${usuario.nombre || 'Usuario'}</div>
                                    <div class="text-muted small">ID: ${usuario.id}</div>
                                </div>
                                <div class="col-md-9">
                                    <div class="row">
                                        <div class="col-6 mb-2">
                                            <small class="text-muted d-block">Email</small>
                                            <strong>${usuario.email}</strong>
                                        </div>
                                        <div class="col-6 mb-2">
                                            <small class="text-muted d-block">Teléfono</small>
                                            <strong>${usuario.telefono || 'No registrado'}</strong>
                                        </div>
                                        <div class="col-6 mb-2">
                                            <small class="text-muted d-block">Plan</small>
                                            <span class="badge bg-${usuario.plan === 'premium' ? 'warning' : usuario.plan === 'admin' ? 'danger' : 'info'}">
                                                ${usuario.plan.toUpperCase()}
                                            </span>
                                        </div>
                                        <div class="col-6 mb-2">
                                            <small class="text-muted d-block">Rol</small>
                                            <span class="badge bg-${usuario.rol === 'admin' ? 'gradient' : 'secondary'}">
                                                ${usuario.rol}
                                            </span>
                                        </div>
                                        <div class="col-6 mb-2">
                                            <small class="text-muted d-block">Fecha Registro</small>
                                            <strong>${new Date(usuario.fecha_registro).toLocaleDateString()}</strong>
                                        </div>
                                        <div class="col-6 mb-2">
                                            <small class="text-muted d-block">Expiración</small>
                                            <strong class="${usuario.fecha_expiracion && new Date(usuario.fecha_expiracion) < new Date() ? 'text-danger' : ''}">
                                                ${usuario.fecha_expiracion ? new Date(usuario.fecha_expiracion).toLocaleDateString() : '--'}
                                            </strong>
                                        </div>
                                    </div>
                                    ${estadisticasHtml}
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                            <button type="button" class="btn btn-ig" onclick="editarUsuario(${usuario.id})">
                                <i class="fas fa-edit me-2"></i> Editar Usuario
                            </button>
                            <button type="button" class="btn btn-${usuario.activo ? 'warning' : 'success'}" 
                                    onclick="${usuario.activo ? 'desactivarUsuario' : 'activarUsuario'}(${usuario.id})">
                                <i class="fas fa-${usuario.activo ? 'ban' : 'check'} me-2"></i>
                                ${usuario.activo ? 'Desactivar' : 'Activar'}
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
        const modal = new bootstrap.Modal(document.getElementById('modalVerUsuario'));
        modal.show();
        
        // Limpiar al cerrar
        modalContainer.querySelector('#modalVerUsuario').addEventListener('hidden.bs.modal', function () {
            document.body.removeChild(modalContainer);
        });
        
    } catch (error) {
        console.error('Error cargando estadísticas del usuario:', error);
        mostrarAlertaAdmin('Error', 'No se pudieron cargar las estadísticas', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function editarUsuario(id) {
    const usuario = usuariosList.find(u => u.id === id);
    if (!usuario) return;
    
    const modalHtml = `
        <div class="modal fade" id="modalEditarUsuario" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content ig-card">
                    <div class="modal-header ig-card-header">
                        <h5 class="modal-title gradient-text">
                            <i class="fas fa-edit me-2"></i>Editar Usuario
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body ig-card-body">
                        <div class="mb-3">
                            <label class="form-label">Email</label>
                            <input type="email" id="editUsuarioEmail" class="form-control form-control-ig" 
                                   value="${usuario.email}" required>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Nombre</label>
                            <input type="text" id="editUsuarioNombre" class="form-control form-control-ig" 
                                   value="${usuario.nombre || ''}">
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Teléfono</label>
                            <input type="text" id="editUsuarioTelefono" class="form-control form-control-ig" 
                                   value="${usuario.telefono || ''}">
                        </div>
                        <div class="row mb-3">
                            <div class="col-6">
                                <label class="form-label">Plan</label>
                                <select id="editUsuarioPlan" class="form-select form-select-ig">
                                    <option value="trial" ${usuario.plan === 'trial' ? 'selected' : ''}>Prueba</option>
                                    <option value="basic" ${usuario.plan === 'basic' ? 'selected' : ''}>Básico</option>
                                    <option value="premium" ${usuario.plan === 'premium' ? 'selected' : ''}>Premium</option>
                                    <option value="admin" ${usuario.plan === 'admin' ? 'selected' : ''}>Admin</option>
                                </select>
                            </div>
                            <div class="col-6">
                                <label class="form-label">Rol</label>
                                <select id="editUsuarioRol" class="form-select form-select-ig">
                                    <option value="user" ${usuario.rol === 'user' ? 'selected' : ''}>Usuario</option>
                                    <option value="admin" ${usuario.rol === 'admin' ? 'selected' : ''}>Administrador</option>
                                </select>
                            </div>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Fecha de Expiración</label>
                            <input type="date" id="editUsuarioExpiracion" class="form-control form-control-ig" 
                                   value="${usuario.fecha_expiracion ? usuario.fecha_expiracion.split(' ')[0] : ''}">
                            <small class="text-muted">Dejar vacío para no expirar</small>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Nueva Contraseña</label>
                            <input type="password" id="editUsuarioPassword" class="form-control form-control-ig" 
                                   placeholder="Dejar vacío para no cambiar">
                        </div>
                        <div class="form-check mb-3">
                            <input class="form-check-input" type="checkbox" id="editUsuarioActivo" ${usuario.activo ? 'checked' : ''}>
                            <label class="form-check-label" for="editUsuarioActivo">
                                Usuario activo
                            </label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-ig" onclick="guardarUsuario(${usuario.id})">
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
    const modal = new bootstrap.Modal(document.getElementById('modalEditarUsuario'));
    modal.show();
    
    // Limpiar al cerrar
    modalContainer.querySelector('#modalEditarUsuario').addEventListener('hidden.bs.modal', function () {
        document.body.removeChild(modalContainer);
    });
}

async function guardarUsuario(id) {
    const email = document.getElementById('editUsuarioEmail').value.trim();
    const nombre = document.getElementById('editUsuarioNombre').value.trim();
    const telefono = document.getElementById('editUsuarioTelefono').value.trim();
    const plan = document.getElementById('editUsuarioPlan').value;
    const rol = document.getElementById('editUsuarioRol').value;
    const expiracion = document.getElementById('editUsuarioExpiracion').value;
    const password = document.getElementById('editUsuarioPassword').value;
    const activo = document.getElementById('editUsuarioActivo').checked;
    
    if (!email) {
        mostrarAlertaAdmin('Error', 'El email es obligatorio', 'error');
        return;
    }
    
    const updateData = {
        email,
        nombre,
        telefono,
        plan,
        rol,
        activo,
        fecha_expiracion: expiracion ? `${expiracion} 23:59:59` : null
    };
    
    if (password) {
        updateData.password = password;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`/api/admin/usuarios/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlertaAdmin('¡Éxito!', 'Usuario actualizado correctamente', 'success');
            
            // Recargar usuarios
            await cargarUsuarios();
            
            // Cerrar modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('modalEditarUsuario'));
            if (modal) modal.hide();
        } else {
            mostrarAlertaAdmin('Error', data.error || 'No se pudo actualizar el usuario', 'error');
        }
    } catch (error) {
        console.error('Error actualizando usuario:', error);
        mostrarAlertaAdmin('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function activarUsuario(id) {
    if (!confirm('¿Activar este usuario?')) return;
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`/api/admin/usuarios/${id}/activar`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlertaAdmin('¡Éxito!', 'Usuario activado', 'success');
            await cargarUsuarios();
        } else {
            mostrarAlertaAdmin('Error', data.error || 'No se pudo activar el usuario', 'error');
        }
    } catch (error) {
        console.error('Error activando usuario:', error);
        mostrarAlertaAdmin('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function desactivarUsuario(id) {
    if (!confirm('¿Desactivar este usuario?')) return;
    
    mostrarLoading(true);
    
    try {
        const response = await fetch(`/api/admin/usuarios/${id}/desactivar`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlertaAdmin('¡Éxito!', 'Usuario desactivado', 'warning');
            await cargarUsuarios();
        } else {
            mostrarAlertaAdmin('Error', data.error || 'No se pudo desactivar el usuario', 'error');
        }
    } catch (error) {
        console.error('Error desactivando usuario:', error);
        mostrarAlertaAdmin('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// ========== CONFIGURACIÓN ==========

async function cargarConfiguracion() {
    try {
        const response = await fetch('/api/configuracion');
        const data = await response.json();
        
        if (data.success) {
            const config = data.data;
            
            // Rellenar formulario
            document.getElementById('configWhatsapp').value = config.whatsapp_admin || '';
            document.getElementById('configBancoNombre').value = config.banco_nombre || '';
            document.getElementById('configBancoCuenta').value = config.banco_cuenta || '';
            document.getElementById('configBancoTitular').value = config.banco_titular || '';
            document.getElementById('configPrecioBasico').value = config.precio_basico || '10000';
            document.getElementById('configPrecioPremium').value = config.precio_premium || '20000';
            document.getElementById('configMensajeBienvenida').value = config.mensaje_bienvenida || '';
        }
    } catch (error) {
        console.error('Error cargando configuración:', error);
    }
}

async function guardarConfiguracion() {
    const configData = {
        whatsapp_admin: document.getElementById('configWhatsapp').value.trim(),
        banco_nombre: document.getElementById('configBancoNombre').value.trim(),
        banco_cuenta: document.getElementById('configBancoCuenta').value.trim(),
        banco_titular: document.getElementById('configBancoTitular').value.trim(),
        precio_basico: document.getElementById('configPrecioBasico').value,
        precio_premium: document.getElementById('configPrecioPremium').value,
        mensaje_bienvenida: document.getElementById('configMensajeBienvenida').value.trim()
    };
    
    // Validaciones básicas
    if (!configData.whatsapp_admin) {
        mostrarAlertaAdmin('Error', 'El WhatsApp admin es obligatorio', 'error');
        return;
    }
    
    if (!configData.banco_cuenta) {
        mostrarAlertaAdmin('Error', 'El número de cuenta es obligatorio', 'error');
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch('/api/configuracion', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlertaAdmin('¡Éxito!', 'Configuración guardada correctamente', 'success');
        } else {
            mostrarAlertaAdmin('Error', data.error || 'No se pudo guardar la configuración', 'error');
        }
    } catch (error) {
        console.error('Error guardando configuración:', error);
        mostrarAlertaAdmin('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// ========== FUNCIONES UTILITARIAS ==========

function tiempoTranscurrido(fecha) {
    const ahora = new Date();
    const segundos = Math.floor((ahora - fecha) / 1000);
    
    if (segundos < 60) return 'hace unos segundos';
    if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} minutos`;
    if (segundos < 86400) return `hace ${Math.floor(segundos / 3600)} horas`;
    return `hace ${Math.floor(segundos / 86400)} días`;
}

function diasRestantes(fecha) {
    const hoy = new Date();
    const diffTime = fecha - hoy;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

function mostrarAlertaAdmin(titulo, mensaje, tipo = 'info') {
    const container = document.getElementById('adminAlertContainer');
    if (!container) {
        console.log(`${tipo}: ${titulo} - ${mensaje}`);
        return;
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
    
    container.prepend(alerta);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alerta.parentNode) {
            alerta.remove();
        }
    }, 5000);
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

// ========== FUNCIONES DE ACCIÓN RÁPIDA ==========

function crearUsuarioAdmin() {
    // Redirigir a formulario de creación o mostrar modal
    alert('Función en desarrollo: Crear usuario desde admin');
}

function generarReporteAdmin() {
    // Generar reporte administrativo
    window.open('/api/exportar/pdf?tipo_reporte=admin', '_blank');
}

async function enviarRecordatorios() {
    if (!confirm('¿Enviar recordatorios a usuarios con suscripción próxima a expirar?')) {
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch('/api/admin/recordatorios/enviar', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlertaAdmin('¡Éxito!', data.message || 'Recordatorios enviados', 'success');
        } else {
            mostrarAlertaAdmin('Error', data.error || 'No se pudieron enviar recordatorios', 'error');
        }
    } catch (error) {
        console.error('Error enviando recordatorios:', error);
        mostrarAlertaAdmin('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// ========== FUNCIONES DE BACKUP ==========

async function crearBackup() {
    if (!confirm('¿Crear backup de la base de datos? Esto puede tomar unos momentos.')) {
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch('/api/admin/backup/crear', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlertaAdmin('¡Éxito!', 'Backup creado correctamente', 'success');
            await cargarHistorialBackups();
            await cargarEstadisticasAdmin();

            // Ofrecer descarga si hay URL
            if (data.data && data.data.download_url) {
                if (confirm('¿Descargar el backup ahora?')) {
                    window.open(data.data.download_url, '_blank');
                }
            }
        } else {
            mostrarAlertaAdmin('Error', data.error || 'No se pudo crear el backup', 'error');
        }
    } catch (error) {
        console.error('Error creando backup:', error);
        mostrarAlertaAdmin('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function restaurarBackup() {
    await cargarHistorialBackups(true);
}

async function cargarHistorialBackups(abrirModal = false) {
    try {
        const response = await fetch('/api/admin/backup/listar');
        const data = await response.json();
        if (data.success) {
            actualizarTablaBackups(data.data);
            if (abrirModal) {
                mostrarModalRestaurarBackup(data.data);
            }
        } else {
            mostrarAlertaAdmin('Error', data.error || 'No se pudieron cargar los backups', 'error');
        }
    } catch (error) {
        console.error('Error cargando backups:', error);
        mostrarAlertaAdmin('Error', 'No se pudo conectar con el servidor', 'error');
    }
}

function actualizarTablaBackups(backups) {
    const tbody = document.getElementById('backupHistoryTable');
    if (!tbody) return;
    if (!Array.isArray(backups) || backups.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted">No hay backups creados</td>
            </tr>
        `;
        return;
    }

    const rows = backups.map(backup => {
        const sizeMb = backup.size ? `${(backup.size / (1024 * 1024)).toFixed(2)} MB` : '--';
        const statusBadge = backup.status === 'ok'
            ? '<span class="badge bg-success">OK</span>'
            : '<span class="badge bg-warning">Aviso</span>';
        const downloadUrl = `/api/admin/backup/descargar/${encodeURIComponent(backup.filename)}`;

        return `
            <tr>
                <td>${backup.created_at}</td>
                <td>${sizeMb}</td>
                <td>Manual</td>
                <td>${statusBadge}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <a class="btn btn-outline-info" href="${downloadUrl}" target="_blank">
                            <i class="fas fa-download"></i>
                        </a>
                        <button class="btn btn-outline-warning" onclick="confirmarRestauracionBackup('${backup.filename}')">
                            <i class="fas fa-undo"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = rows.join('');
}

function mostrarModalRestaurarBackup(backups) {
    if (!Array.isArray(backups) || backups.length === 0) {
        mostrarAlertaAdmin('Aviso', 'No hay backups disponibles para restaurar', 'warning');
        return;
    }

    const options = backups
        .map(backup => `<option value="${backup.filename}">${backup.created_at} - ${backup.filename}</option>`)
        .join('');

    const modalHtml = `
        <div class="modal fade" id="modalRestaurarBackup" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content ig-card">
                    <div class="modal-header ig-card-header">
                        <h5 class="modal-title gradient-text">
                            <i class="fas fa-upload me-2"></i>Restaurar Backup
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body ig-card-body">
                        <p class="text-muted">Selecciona un backup para restaurar la base de datos.</p>
                        <div class="mb-3">
                            <label class="form-label">Backup disponible</label>
                            <select id="restoreBackupSelect" class="form-select form-select-ig">
                                ${options}
                            </select>
                        </div>
                        <div class="alert alert-warning">
                            <i class="fas fa-exclamation-triangle me-2"></i>
                            Esta acción sobrescribirá la base de datos actual.
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-danger" onclick="ejecutarRestauracionSeleccionada()">
                            <i class="fas fa-undo me-2"></i> Restaurar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);

    const modal = new bootstrap.Modal(document.getElementById('modalRestaurarBackup'));
    modal.show();

    modalContainer.querySelector('#modalRestaurarBackup').addEventListener('hidden.bs.modal', function () {
        document.body.removeChild(modalContainer);
    });
}

function confirmarRestauracionBackup(filename) {
    if (!confirm('¿Restaurar este backup? Se sobrescribirán los datos actuales.')) {
        return;
    }
    restaurarBackupPorNombre(filename);
}

async function ejecutarRestauracionSeleccionada() {
    const select = document.getElementById('restoreBackupSelect');
    if (!select) return;
    const filename = select.value;
    if (!filename) return;

    const modal = bootstrap.Modal.getInstance(document.getElementById('modalRestaurarBackup'));
    if (modal) modal.hide();

    restaurarBackupPorNombre(filename);
}

async function restaurarBackupPorNombre(filename) {
    if (!filename) return;
    mostrarLoading(true);

    try {
        const response = await fetch('/api/admin/backup/restaurar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        });

        const data = await response.json();

        if (data.success) {
            mostrarAlertaAdmin('¡Éxito!', data.message || 'Backup restaurado correctamente', 'success');
            await cargarHistorialBackups();
            await cargarEstadisticasAdmin();
        } else {
            mostrarAlertaAdmin('Error', data.error || 'No se pudo restaurar el backup', 'error');
        }
    } catch (error) {
        console.error('Error restaurando backup:', error);
        mostrarAlertaAdmin('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function optimizarBD() {
    if (!confirm('¿Optimizar base de datos? Esto mejorará el rendimiento.')) {
        return;
    }
    
    mostrarLoading(true);
    
    try {
        const response = await fetch('/api/admin/db/optimizar', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlertaAdmin('¡Éxito!', 'Base de datos optimizada', 'success');
        } else {
            mostrarAlertaAdmin('Error', data.error || 'No se pudo optimizar la BD', 'error');
        }
    } catch (error) {
        console.error('Error optimizando BD:', error);
        mostrarAlertaAdmin('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function limpiarCache() {
    if (!confirm('¿Limpiar cache del sistema? Esto borrará datos temporales.')) {
        return;
    }
    
    mostrarLoading(true);

    fetch('/api/admin/cache/limpiar', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                mostrarAlertaAdmin('¡Éxito!', data.message || 'Cache limpiado correctamente', 'success');
            } else {
                mostrarAlertaAdmin('Error', data.error || 'No se pudo limpiar el cache', 'error');
            }
        })
        .catch(() => {
            mostrarAlertaAdmin('Error', 'No se pudo conectar con el servidor', 'error');
        })
        .finally(() => {
            mostrarLoading(false);
        });
}

function reiniciarSistema() {
    if (!confirm('⚠️ ADVERTENCIA: ¿Reiniciar sistema?\n\nEsto cerrará todas las sesiones activas y reiniciará servicios.')) {
        return;
    }
    
    if (!confirm('¿ESTÁS ABSOLUTAMENTE SEGURO? Esta acción no se puede deshacer.')) {
        return;
    }
    
    mostrarLoading(true);

    fetch('/api/admin/sistema/reiniciar', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                mostrarAlertaAdmin('Sistema reiniciado', data.message || 'El sistema se ha reiniciado. Recarga la página.', 'warning');
            } else {
                mostrarAlertaAdmin('Error', data.error || 'No se pudo reiniciar el sistema', 'error');
            }
        })
        .catch(() => {
            mostrarAlertaAdmin('Error', 'No se pudo conectar con el servidor', 'error');
        })
        .finally(() => {
            mostrarLoading(false);
        });
}

// ========== INICIALIZACIÓN ==========

// Configurar Chart.js si está disponible
function inicializarGraficos(stats) {
    const usuariosChart = document.getElementById('usuariosChart');
    const ingresosChart = document.getElementById('ingresosChart');

    if (!stats || !window.Chart) {
        return;
    }

    if (usuariosChartInstance) {
        usuariosChartInstance.destroy();
        usuariosChartInstance = null;
    }

    if (ingresosChartInstance) {
        ingresosChartInstance.destroy();
        ingresosChartInstance = null;
    }

    if (usuariosChart) {
        usuariosChartInstance = new Chart(usuariosChart, {
            type: 'line',
            data: {
                labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
                datasets: [{
                    label: 'Usuarios Nuevos',
                    data: Array(6).fill(stats.usuarios_activos || 0),
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                    }
                }
            }
        });
    }
    
    if (ingresosChart) {
        ingresosChartInstance = new Chart(ingresosChart, {
            type: 'bar',
            data: {
                labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
                datasets: [{
                    label: 'Ingresos ($)',
                    data: Array(6).fill(stats.ingresos_mes || 0),
                    backgroundColor: 'rgba(16, 185, 129, 0.5)',
                    borderColor: 'rgb(16, 185, 129)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                    }
                }
            }
        });
    }
}

// Exportar funciones globalmente
window.cargarEstadisticasAdmin = cargarEstadisticasAdmin;
window.cargarPagosPendientes = cargarPagosPendientes;
window.cargarUsuarios = cargarUsuarios;
window.verificarPagoAdmin = verificarPagoAdmin;
window.rechazarPagoAdmin = rechazarPagoAdmin;
window.verDetallesPago = verDetallesPago;
window.buscarUsuarios = buscarUsuarios;
window.verUsuario = verUsuario;
window.editarUsuario = editarUsuario;
window.activarUsuario = activarUsuario;
window.desactivarUsuario = desactivarUsuario;
window.guardarConfiguracion = guardarConfiguracion;
window.crearBackup = crearBackup;
window.cargarHistorialBackups = cargarHistorialBackups;
window.optimizarBD = optimizarBD;
window.limpiarCache = limpiarCache;
window.reiniciarSistema = reiniciarSistema;
window.enviarRecordatorios = enviarRecordatorios;
