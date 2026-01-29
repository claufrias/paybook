# app.py - RedCajeros - Sistema Multi-Usuario con Pagos Manuales
from flask import Flask, render_template, request, jsonify, send_file, session, redirect, url_for
import sqlite3
import os
import json
from datetime import datetime, timedelta
import traceback
from threading import Lock
from flask_cors import CORS
import csv
import io
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
import tempfile
import hashlib
import secrets
from functools import wraps

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)
app.secret_key = os.environ.get('SECRET_KEY', 'redcajeros-secreto-2026')

# Ruta de la base de datos
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'redcajeros.db')

# Lock para operaciones de base de datos
db_lock = Lock()

# Configuración
ADMIN_EMAIL = "admin@redcajeros.com"  # Cambia esto a tu email
TU_WHATSAPP = "584121234567"  # Cambia esto a TU número
TU_BANCO = "0102-1234-5678-9012"  # Cambia esto a TU cuenta
TU_BANCO_NOMBRE = "Tu Banco"  # Cambia esto
TU_NOMBRE = "Administrador RedCajeros"  # Cambia esto

def init_db():
    """Crear base de datos y tablas"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Tabla usuarios (NUEVA)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            nombre TEXT,
            telefono TEXT,
            plan TEXT DEFAULT 'trial',
            fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            fecha_expiracion TIMESTAMP,
            activo BOOLEAN DEFAULT 1,
            es_admin BOOLEAN DEFAULT 0,
            api_key TEXT UNIQUE
        )
    ''')
    
    # Tabla cajeros (MODIFICADA: agregar usuario_id)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cajeros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            nombre TEXT NOT NULL,
            activo BOOLEAN DEFAULT 1,
            fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
        )
    ''')
    
    # Tabla cargas (MODIFICADA: agregar usuario_id)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cargas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            cajero_id INTEGER,
            plataforma TEXT,
            monto REAL,
            fecha TEXT,
            nota TEXT,
            pagado BOOLEAN DEFAULT 0,
            es_deuda BOOLEAN DEFAULT 0,
            FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
            FOREIGN KEY(cajero_id) REFERENCES cajeros(id)
        )
    ''')
    
    # Tabla pagos (MODIFICADA: agregar usuario_id)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pagos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            cajero_id INTEGER,
            monto_pagado REAL,
            total_comisiones REAL,
            fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            notas TEXT,
            FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
            FOREIGN KEY(cajero_id) REFERENCES cajeros(id)
        )
    ''')
    
    # Tabla configuraciones
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS configuraciones (
            clave TEXT PRIMARY KEY,
            valor TEXT
        )
    ''')
    
    # Tabla pagos_manuales (NUEVA)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pagos_manuales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            codigo TEXT UNIQUE NOT NULL,
            monto DECIMAL(10,2) NOT NULL,
            plan TEXT NOT NULL,
            estado TEXT DEFAULT 'pendiente',
            fecha_solicitud TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            fecha_verificacion TIMESTAMP,
            comprobante_url TEXT,
            notas TEXT,
            FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
        )
    ''')
    
    # Insertar configuraciones por defecto
    cursor.execute('''
        INSERT OR IGNORE INTO configuraciones (clave, valor) 
        VALUES ('porcentaje_comision', '10'),
               ('moneda', '$'),
               ('plataformas', 'Zeus,Gana,Ganamos'),
               ('permitir_deudas', '1'),
               ('precio_basico', '9.99'),
               ('precio_premium', '19.99'),
               ('dias_trial', '7'),
               ('admin_email', ?),
               ('admin_whatsapp', ?),
               ('admin_banco', ?),
               ('admin_banco_nombre', ?),
               ('admin_nombre', ?)
    ''', (ADMIN_EMAIL, TU_WHATSAPP, TU_BANCO, TU_BANCO_NOMBRE, TU_NOMBRE))
    
    # Crear usuario admin si no existe
    cursor.execute('SELECT id FROM usuarios WHERE email = ?', (ADMIN_EMAIL,))
    if not cursor.fetchone():
        password_hash = hash_password('admin123')  # Cambia esta contraseña
        cursor.execute('''
            INSERT INTO usuarios (email, password_hash, nombre, plan, es_admin, fecha_expiracion)
            VALUES (?, ?, ?, 'premium', 1, ?)
        ''', (ADMIN_EMAIL, password_hash, 'Administrador', 
              (datetime.now() + timedelta(days=3650)).strftime('%Y-%m-%d %H:%M:%S')))
    
    conn.commit()
    conn.close()
    print("✅ Base de datos RedCajeros inicializada")

def hash_password(password):
    """Hash simple para contraseñas"""
    salt = "redcajeros_salt_2026"
    return hashlib.sha256((password + salt).encode()).hexdigest()

def verificar_password(password, password_hash):
    """Verificar contraseña"""
    return hash_password(password) == password_hash

def require_login(f):
    """Decorador para requerir login"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'No autenticado'}), 401
        
        # Verificar si usuario aún existe y está activo
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT id, fecha_expiracion FROM usuarios WHERE id = ? AND activo = 1', 
                      (session['user_id'],))
        usuario = cursor.fetchone()
        conn.close()
        
        if not usuario:
            session.clear()
            return jsonify({'success': False, 'error': 'Usuario no encontrado'}), 401
        
        # Verificar suscripción
        fecha_expiracion = usuario[1]
        if fecha_expiracion:
            expiracion = datetime.strptime(fecha_expiracion, '%Y-%m-%d %H:%M:%S')
            if expiracion < datetime.now():
                return jsonify({
                    'success': False, 
                    'error': 'Suscripción expirada',
                    'code': 'SUBSCRIPTION_EXPIRED'
                }), 403
        
        return f(*args, **kwargs)
    return decorated_function

def require_admin(f):
    """Decorador para requerir admin"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'No autenticado'}), 401
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT es_admin FROM usuarios WHERE id = ?', (session['user_id'],))
        usuario = cursor.fetchone()
        conn.close()
        
        if not usuario or not usuario[0]:
            return jsonify({'success': False, 'error': 'No autorizado'}), 403
        
        return f(*args, **kwargs)
    return decorated_function

# ========== RUTAS PRINCIPALES ==========
@app.route('/')
def index():
    """Página principal (login/registro)"""
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    """Dashboard del usuario"""
    if 'user_id' not in session:
        return redirect(url_for('index'))
    return render_template('dashboard.html')

@app.route('/admin')
def admin_panel():
    """Panel de administración (solo para ti)"""
    if 'user_id' not in session:
        return redirect(url_for('index'))
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT es_admin FROM usuarios WHERE id = ?', (session['user_id'],))
    usuario = cursor.fetchone()
    conn.close()
    
    if not usuario or not usuario[0]:
        return redirect(url_for('dashboard'))
    
    return render_template('admin.html')

# ========== API AUTENTICACIÓN ==========
@app.route('/api/register', methods=['POST'])
def register():
    """Registrar nuevo usuario"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        nombre = data.get('nombre', '').strip()
        telefono = data.get('telefono', '').strip()
        
        # Validaciones
        if not email or '@' not in email:
            return jsonify({'success': False, 'error': 'Email inválido'}), 400
        
        if len(password) < 6:
            return jsonify({'success': False, 'error': 'Contraseña muy corta (mínimo 6 caracteres)'}), 400
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Verificar si email ya existe
            cursor.execute('SELECT id FROM usuarios WHERE email = ?', (email,))
            if cursor.fetchone():
                conn.close()
                return jsonify({'success': False, 'error': 'Email ya registrado'}), 400
            
            # Crear usuario con trial
            password_hash = hash_password(password)
            fecha_expiracion = datetime.now() + timedelta(days=7)  # 7 días trial
            
            cursor.execute('''
                INSERT INTO usuarios (email, password_hash, nombre, telefono, plan, fecha_expiracion, api_key)
                VALUES (?, ?, ?, ?, 'trial', ?, ?)
            ''', (email, password_hash, nombre, telefono, 
                  fecha_expiracion.strftime('%Y-%m-%d %H:%M:%S'), 
                  secrets.token_urlsafe(32)))
            
            user_id = cursor.lastrowid
            conn.commit()
            conn.close()
        
        # Iniciar sesión automáticamente
        session['user_id'] = user_id
        session['user_email'] = email
        session['user_nombre'] = nombre
        
        return jsonify({
            'success': True,
            'message': 'Registro exitoso. Tienes 7 días de prueba gratis.',
            'user': {
                'id': user_id,
                'email': email,
                'nombre': nombre,
                'plan': 'trial',
                'expiracion': fecha_expiracion.strftime('%Y-%m-%d')
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    """Iniciar sesión"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT id, email, password_hash, nombre, plan, fecha_expiracion, es_admin
                FROM usuarios 
                WHERE email = ? AND activo = 1
            ''', (email,))
            
            usuario = cursor.fetchone()
            conn.close()
            
            if not usuario:
                return jsonify({'success': False, 'error': 'Usuario no encontrado'}), 401
            
            user_id, user_email, stored_hash, nombre, plan, expiracion, es_admin = usuario
            
            # Verificar contraseña
            if not verificar_password(password, stored_hash):
                return jsonify({'success': False, 'error': 'Contraseña incorrecta'}), 401
            
            # Verificar suscripción
            if expiracion:
                expiracion_date = datetime.strptime(expiracion, '%Y-%m-%d %H:%M:%S')
                if expiracion_date < datetime.now():
                    return jsonify({
                        'success': False, 
                        'error': 'Tu prueba gratuita ha expirado',
                        'code': 'SUBSCRIPTION_EXPIRED'
                    }), 403
            
            # Iniciar sesión
            session['user_id'] = user_id
            session['user_email'] = user_email
            session['user_nombre'] = nombre
            session['user_plan'] = plan
            session['user_admin'] = bool(es_admin)
            
            return jsonify({
                'success': True,
                'user': {
                    'id': user_id,
                    'email': user_email,
                    'nombre': nombre,
                    'plan': plan,
                    'expiracion': expiracion,
                    'es_admin': bool(es_admin)
                }
            })
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/logout', methods=['POST'])
def logout():
    """Cerrar sesión"""
    session.clear()
    return jsonify({'success': True, 'message': 'Sesión cerrada'})

@app.route('/api/user/info')
@require_login
def user_info():
    """Obtener información del usuario actual"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, email, nombre, telefono, plan, fecha_registro, fecha_expiracion, es_admin
        FROM usuarios WHERE id = ?
    ''', (session['user_id'],))
    
    usuario = cursor.fetchone()
    conn.close()
    
    if not usuario:
        return jsonify({'success': False, 'error': 'Usuario no encontrado'}), 404
    
    return jsonify({
        'success': True,
        'user': {
            'id': usuario[0],
            'email': usuario[1],
            'nombre': usuario[2],
            'telefono': usuario[3],
            'plan': usuario[4],
            'fecha_registro': usuario[5],
            'fecha_expiracion': usuario[6],
            'es_admin': bool(usuario[7])
        }
    })

# ========== API PAGOS MANUALES ==========
@app.route('/api/pagos/solicitar', methods=['POST'])
@require_login
def solicitar_pago():
    """Solicitar pago manual (genera código)"""
    try:
        data = request.get_json()
        plan = data.get('plan', 'basic')
        
        # Precios por plan
        precios = {'basic': 9.99, 'premium': 19.99}
        
        if plan not in precios:
            return jsonify({'success': False, 'error': 'Plan no válido'}), 400
        
        # Generar código único
        codigo = f"REDCAJ-{secrets.token_hex(3).upper()}"
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Verificar si ya tiene un pago pendiente
            cursor.execute('''
                SELECT id FROM pagos_manuales 
                WHERE usuario_id = ? AND estado = 'pendiente'
            ''', (session['user_id'],))
            
            if cursor.fetchone():
                conn.close()
                return jsonify({'success': False, 'error': 'Ya tienes un pago pendiente'}), 400
            
            # Insertar solicitud de pago
            cursor.execute('''
                INSERT INTO pagos_manuales (usuario_id, codigo, monto, plan)
                VALUES (?, ?, ?, ?)
            ''', (session['user_id'], codigo, precios[plan], plan))
            
            conn.commit()
            
            # Obtener datos del usuario para el mensaje
            cursor.execute('SELECT nombre, telefono FROM usuarios WHERE id = ?', (session['user_id'],))
            usuario = cursor.fetchone()
            nombre_usuario = usuario[0] if usuario else ''
            
            # Obtener configuración del admin
            cursor.execute('SELECT valor FROM configuraciones WHERE clave = ?', ('admin_whatsapp',))
            admin_whatsapp = cursor.fetchone()
            admin_whatsapp = admin_whatsapp[0] if admin_whatsapp else TU_WHATSAPP
            
            cursor.execute('SELECT valor FROM configuraciones WHERE clave = ?', ('admin_banco',))
            admin_banco = cursor.fetchone()
            admin_banco = admin_banco[0] if admin_banco else TU_BANCO
            
            cursor.execute('SELECT valor FROM configuraciones WHERE clave = ?', ('admin_banco_nombre',))
            admin_banco_nombre = cursor.fetchone()
            admin_banco_nombre = admin_banco_nombre[0] if admin_banco_nombre else TU_BANCO_NOMBRE
            
            cursor.execute('SELECT valor FROM configuraciones WHERE clave = ?', ('admin_nombre',))
            admin_nombre = cursor.fetchone()
            admin_nombre = admin_nombre[0] if admin_nombre else TU_NOMBRE
            
            conn.close()
        
        # Crear mensaje para WhatsApp
        mensaje_whatsapp = (
            f"Hola {admin_nombre}! 👋\n\n"
            f"Soy {nombre_usuario} de RedCajeros.\n"
            f"Te envío el comprobante del pago con código:\n"
            f"*{codigo}*\n\n"
            f"Plan: {plan.upper()}\n"
            f"Monto: ${precios[plan]}\n\n"
            f"¡Gracias!"
        )
        
        # Codificar mensaje para URL
        import urllib.parse
        mensaje_codificado = urllib.parse.quote(mensaje_whatsapp)
        whatsapp_url = f"https://wa.me/{admin_whatsapp}?text={mensaje_codificado}"
        
        return jsonify({
            'success': True,
            'data': {
                'codigo': codigo,
                'monto': precios[plan],
                'plan': plan,
                'cuenta_bancaria': admin_banco,
                'banco': admin_banco_nombre,
                'titular': admin_nombre,
                'whatsapp': admin_whatsapp,
                'whatsapp_url': whatsapp_url,
                'mensaje': f"Incluye este código en tu mensaje: {codigo}"
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/pagos/estado')
@require_login
def estado_pago():
    """Consultar estado de pago pendiente"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT codigo, monto, plan, estado, fecha_solicitud, fecha_verificacion
        FROM pagos_manuales 
        WHERE usuario_id = ? AND estado = 'pendiente'
        ORDER BY fecha_solicitud DESC LIMIT 1
    ''', (session['user_id'],))
    
    pago = cursor.fetchone()
    conn.close()
    
    if not pago:
        return jsonify({'success': True, 'data': None})
    
    return jsonify({
        'success': True,
        'data': {
            'codigo': pago[0],
            'monto': pago[1],
            'plan': pago[2],
            'estado': pago[3],
            'fecha_solicitud': pago[4],
            'fecha_verificacion': pago[5]
        }
    })

# ========== API ADMIN (SOLO PARA TI) ==========
@app.route('/api/admin/pagos/pendientes')
@require_login
@require_admin
def admin_pagos_pendientes():
    """Obtener lista de pagos pendientes (solo admin)"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT pm.id, pm.codigo, pm.monto, pm.plan, pm.estado, pm.fecha_solicitud,
               u.id as user_id, u.email, u.nombre, u.telefono
        FROM pagos_manuales pm
        JOIN usuarios u ON pm.usuario_id = u.id
        WHERE pm.estado = 'pendiente'
        ORDER BY pm.fecha_solicitud ASC
    ''')
    
    pagos = cursor.fetchall()
    conn.close()
    
    return jsonify({
        'success': True,
        'data': [{
            'id': row[0],
            'codigo': row[1],
            'monto': row[2],
            'plan': row[3],
            'estado': row[4],
            'fecha_solicitud': row[5],
            'usuario': {
                'id': row[6],
                'email': row[7],
                'nombre': row[8],
                'telefono': row[9]
            }
        } for row in pagos]
    })

@app.route('/api/admin/pagos/verificar/<codigo>', methods=['POST'])
@require_login
@require_admin
def verificar_pago_admin(codigo):
    """Verificar pago manualmente (solo admin)"""
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Obtener datos del pago
            cursor.execute('''
                SELECT usuario_id, monto, plan FROM pagos_manuales 
                WHERE codigo = ? AND estado = 'pendiente'
            ''', (codigo,))
            
            pago = cursor.fetchone()
            if not pago:
                conn.close()
                return jsonify({'success': False, 'error': 'Pago no encontrado o ya verificado'}), 404
            
            usuario_id, monto, plan = pago
            
            # Actualizar usuario (extender suscripción)
            nueva_expiracion = datetime.now() + timedelta(days=30)
            
            cursor.execute('''
                UPDATE usuarios 
                SET plan = ?, fecha_expiracion = ?
                WHERE id = ?
            ''', (plan, nueva_expiracion.strftime('%Y-%m-%d %H:%M:%S'), usuario_id))
            
            # Marcar pago como verificado
            cursor.execute('''
                UPDATE pagos_manuales 
                SET estado = 'verificado', fecha_verificacion = CURRENT_TIMESTAMP,
                    notas = 'Verificado manualmente por admin'
                WHERE codigo = ?
            ''', (codigo,))
            
            # Obtener email del usuario para respuesta
            cursor.execute('SELECT email, nombre FROM usuarios WHERE id = ?', (usuario_id,))
            usuario = cursor.fetchone()
            email_usuario = usuario[0] if usuario else ''
            nombre_usuario = usuario[1] if usuario else ''
            
            conn.commit()
            conn.close()
        
        return jsonify({
            'success': True, 
            'message': f'Usuario {nombre_usuario} ({email_usuario}) activado con plan {plan} hasta {nueva_expiracion.strftime("%Y-%m-%d")}'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/admin/pagos/rechazar/<codigo>', methods=['POST'])
@require_login
@require_admin
def rechazar_pago_admin(codigo):
    """Rechazar pago (solo admin)"""
    try:
        data = request.get_json()
        motivo = data.get('motivo', 'Pago no verificado')
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            cursor.execute('''
                UPDATE pagos_manuales 
                SET estado = 'rechazado', notas = ?
                WHERE codigo = ? AND estado = 'pendiente'
            ''', (motivo, codigo))
            
            conn.commit()
            conn.close()
        
        return jsonify({
            'success': True, 
            'message': f'Pago {codigo} rechazado'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/admin/estadisticas')
@require_login
@require_admin
def admin_estadisticas():
    """Estadísticas generales (solo admin)"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Total usuarios
    cursor.execute('SELECT COUNT(*) FROM usuarios WHERE activo = 1')
    total_usuarios = cursor.fetchone()[0]
    
    # Usuarios activos (con suscripción vigente)
    cursor.execute('''
        SELECT COUNT(*) FROM usuarios 
        WHERE activo = 1 AND fecha_expiracion > CURRENT_TIMESTAMP
    ''')
    usuarios_activos = cursor.fetchone()[0]
    
    # Usuarios en trial
    cursor.execute('''
        SELECT COUNT(*) FROM usuarios 
        WHERE activo = 1 AND plan = 'trial' AND fecha_expiracion > CURRENT_TIMESTAMP
    ''')
    usuarios_trial = cursor.fetchone()[0]
    
    # Pagos verificados este mes
    cursor.execute('''
        SELECT COUNT(*), COALESCE(SUM(monto), 0) 
        FROM pagos_manuales 
        WHERE estado = 'verificado' 
        AND strftime('%Y-%m', fecha_verificacion) = strftime('%Y-%m', 'now')
    ''')
    pagos_mes = cursor.fetchone()
    pagos_cantidad = pagos_mes[0] or 0
    pagos_monto = pagos_mes[1] or 0
    
    # Pagos pendientes
    cursor.execute('SELECT COUNT(*) FROM pagos_manuales WHERE estado = "pendiente"')
    pagos_pendientes = cursor.fetchone()[0]
    
    conn.close()
    
    return jsonify({
        'success': True,
        'data': {
            'usuarios': {
                'total': total_usuarios,
                'activos': usuarios_activos,
                'trial': usuarios_trial,
                'expirados': total_usuarios - usuarios_activos
            },
            'pagos': {
                'este_mes_cantidad': pagos_cantidad,
                'este_mes_monto': pagos_monto,
                'pendientes': pagos_pendientes
            },
            'ingreso_mensual_estimado': pagos_monto
        }
    })

# ========== API CAJEROS (MODIFICADA para multi-usuario) ==========
@app.route('/api/cajeros', methods=['GET'])
@require_login
def get_cajeros():
    """Obtener cajeros del usuario actual"""
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, nombre, activo, fecha_creacion 
                FROM cajeros 
                WHERE usuario_id = ? 
                ORDER BY nombre
            ''', (session['user_id'],))
            cajeros = cursor.fetchall()
            conn.close()
        
        return jsonify({
            'success': True,
            'data': [{
                'id': row[0],
                'nombre': row[1],
                'activo': bool(row[2]),
                'fecha_creacion': row[3]
            } for row in cajeros]
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cajeros', methods=['POST'])
@require_login
def add_cajero():
    """Agregar cajero para el usuario actual"""
    try:
        data = request.get_json()
        nombre = data.get('nombre', '').strip()
        
        if not nombre:
            return jsonify({'success': False, 'error': 'El nombre no puede estar vacío'}), 400
        
        if len(nombre) < 2:
            return jsonify({'success': False, 'error': 'El nombre debe tener al menos 2 caracteres'}), 400
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Verificar si ya existe un cajero con el mismo nombre para este usuario
            cursor.execute('''
                SELECT id, nombre FROM cajeros 
                WHERE usuario_id = ? AND LOWER(nombre) = LOWER(?)
            ''', (session['user_id'], nombre))
            
            if cursor.fetchone():
                conn.close()
                return jsonify({'success': False, 'error': 'Ya tienes un cajero con ese nombre'}), 400
            
            cursor.execute('''
                INSERT INTO cajeros (usuario_id, nombre) 
                VALUES (?, ?)
            ''', (session['user_id'], nombre))
            
            conn.commit()
            cajero_id = cursor.lastrowid
            
            cursor.execute('''
                SELECT id, nombre, activo, fecha_creacion 
                FROM cajeros WHERE id = ?
            ''', (cajero_id,))
            
            cajero = cursor.fetchone()
            conn.close()
            
            return jsonify({
                'success': True,
                'data': {
                    'id': cajero[0],
                    'nombre': cajero[1],
                    'activo': bool(cajero[2]),
                    'fecha_creacion': cajero[3]
                },
                'message': 'Cajero agregado exitosamente'
            })
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'Error: {str(e)}'}), 500

# ========== API CARGAS (MODIFICADA para multi-usuario) ==========
@app.route('/api/cargas', methods=['GET'])
@require_login
def get_cargas():
    """Obtener cargas del usuario actual"""
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Obtener parámetros de filtro
            fecha_inicio = request.args.get('fecha_inicio')
            fecha_fin = request.args.get('fecha_fin')
            cajero_id = request.args.get('cajero_id')
            plataforma = request.args.get('plataforma')
            
            query = '''
                SELECT cg.id, c.nombre, cg.plataforma, cg.monto, cg.fecha, 
                       cg.nota, cg.pagado, cg.es_deuda
                FROM cargas cg
                JOIN cajeros c ON cg.cajero_id = c.id
                WHERE cg.usuario_id = ?
            '''
            
            params = [session['user_id']]
            
            if fecha_inicio and fecha_fin:
                query += ' AND cg.fecha BETWEEN ? AND ?'
                params.extend([fecha_inicio, fecha_fin])
            
            if cajero_id:
                query += ' AND cg.cajero_id = ?'
                params.append(cajero_id)
            
            if plataforma:
                query += ' AND cg.plataforma = ?'
                params.append(plataforma)
            
            query += ' ORDER BY cg.fecha DESC LIMIT 100'
            
            cursor.execute(query, params)
            cargas = cursor.fetchall()
            conn.close()
        
        return jsonify({
            'success': True,
            'data': [{
                'id': row[0],
                'cajero': row[1],
                'plataforma': row[2],
                'monto': row[3],
                'fecha': row[4],
                'nota': row[5] or '',
                'pagado': bool(row[6]),
                'es_deuda': bool(row[7])
            } for row in cargas]
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cargas', methods=['POST'])
@require_login
def add_carga():
    """Agregar carga para el usuario actual"""
    try:
        data = request.get_json()
        
        # Validar datos
        required_fields = ['cajero_id', 'plataforma', 'monto']
        for field in required_fields:
            if field not in data:
                return jsonify({'success': False, 'error': f'Falta el campo: {field}'}), 400
        
        cajero_id = data['cajero_id']
        plataforma = data['plataforma']
        monto = float(data['monto'])
        nota = data.get('nota', '').strip()
        
        if monto == 0:
            return jsonify({'success': False, 'error': 'El monto no puede ser 0'}), 400
        
        fecha = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        es_deuda = 1 if monto < 0 else 0
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Verificar que el cajero existe y pertenece al usuario
            cursor.execute('''
                SELECT id, nombre FROM cajeros 
                WHERE id = ? AND usuario_id = ? AND activo = 1
            ''', (cajero_id, session['user_id']))
            
            cajero = cursor.fetchone()
            if not cajero:
                conn.close()
                return jsonify({'success': False, 'error': 'El cajero no existe'}), 400
            
            cursor.execute('''
                INSERT INTO cargas (usuario_id, cajero_id, plataforma, monto, fecha, nota, es_deuda)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (session['user_id'], cajero_id, plataforma, monto, fecha, nota, es_deuda))
            
            conn.commit()
            carga_id = cursor.lastrowid
            conn.close()
        
        tipo_carga = "deuda" if monto < 0 else "carga"
        return jsonify({
            'success': True,
            'data': {
                'id': carga_id,
                'cajero': cajero[1],
                'plataforma': plataforma,
                'monto': monto,
                'fecha': fecha,
                'nota': nota,
                'pagado': False,
                'es_deuda': es_deuda
            },
            'message': f'{tipo_carga.capitalize()} registrada exitosamente'
        })
        
    except ValueError:
        return jsonify({'success': False, 'error': 'El monto debe ser un número válido'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': f'Error: {str(e)}'}), 500

# ========== API RESUMEN (MODIFICADA para multi-usuario) ==========
@app.route('/api/resumen', methods=['GET'])
@require_login
def get_resumen():
    """Obtener resumen del usuario actual"""
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Obtener configuración de deudas
            cursor.execute("SELECT valor FROM configuraciones WHERE clave = 'permitir_deudas'")
            permitir_deudas = cursor.fetchone()
            permitir_deudas = bool(int(permitir_deudas[0])) if permitir_deudas else True
            
            # Obtener todos los cajeros activos del usuario
            cursor.execute('''
                SELECT id, nombre FROM cajeros 
                WHERE usuario_id = ? AND activo = 1 
                ORDER BY nombre
            ''', (session['user_id'],))
            
            cajeros = cursor.fetchall()
            
            resumen = []
            
            for cajero_id, nombre in cajeros:
                # Calcular totales por plataforma - SOLO NO PAGADAS
                if permitir_deudas:
                    cursor.execute('''
                        SELECT plataforma, SUM(monto) as total
                        FROM cargas 
                        WHERE usuario_id = ? AND cajero_id = ? AND (pagado = 0 OR pagado IS NULL)
                        GROUP BY plataforma
                    ''', (session['user_id'], cajero_id))
                else:
                    cursor.execute('''
                        SELECT plataforma, SUM(monto) as total
                        FROM cargas 
                        WHERE usuario_id = ? AND cajero_id = ? AND (pagado = 0 OR pagado IS NULL) AND monto > 0
                        GROUP BY plataforma
                    ''', (session['user_id'], cajero_id))
                
                montos = cursor.fetchall()
                
                # Inicializar en 0
                totales = {'Zeus': 0, 'Gana': 0, 'Ganamos': 0}
                
                for plataforma, total in montos:
                    if plataforma in totales:
                        totales[plataforma] = total or 0
                
                total_general = sum(totales.values())
                
                # Obtener cantidad de cargas NO PAGADAS
                if permitir_deudas:
                    cursor.execute('''
                        SELECT COUNT(*) FROM cargas 
                        WHERE usuario_id = ? AND cajero_id = ? AND (pagado = 0 OR pagado IS NULL)
                    ''', (session['user_id'], cajero_id))
                else:
                    cursor.execute('''
                        SELECT COUNT(*) FROM cargas 
                        WHERE usuario_id = ? AND cajero_id = ? AND (pagado = 0 OR pagado IS NULL) AND monto > 0
                    ''', (session['user_id'], cajero_id))
                
                cantidad_cargas = cursor.fetchone()[0]
                
                resumen.append({
                    'cajero': nombre,
                    'cajero_id': cajero_id,
                    'zeus': totales['Zeus'],
                    'gana': totales['Gana'],
                    'ganamos': totales['Ganamos'],
                    'total': total_general,
                    'cargas': cantidad_cargas
                })
            
            conn.close()
        
        return jsonify({
            'success': True,
            'data': resumen
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== MANEJADOR DE ERRORES ==========
@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'error': 'Ruta no encontrada'}), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({'success': False, 'error': 'Error interno del servidor'}), 500

# ========== INICIAR SERVIDOR ==========
if __name__ == '__main__':
    # Inicializar base de datos
    init_db()
    print("✅ RedCajeros iniciado")
    print(f"📁 Base de datos: {DB_PATH}")
    print(f"👑 Admin: {ADMIN_EMAIL}")
    print("💰 Sistema de pagos manuales activado")
    print("\n⚠️  Para detener: Presiona Ctrl+C\n")
    
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False)