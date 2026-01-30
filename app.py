from flask import Flask, render_template, request, jsonify, send_file, redirect, url_for, session
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_cors import CORS
import sqlite3
import os
import json
from datetime import datetime, timedelta
import traceback
from threading import Lock
import hashlib
import secrets
import csv
import io
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
import tempfile
from functools import wraps

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'redcajeros-secreto-2024')
# Initialize CORS after creating the Flask app and enable credentials support
CORS(app, supports_credentials=True)

# Login Manager
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login_page'

# Ruta de la base de datos
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'database.db')

# Lock para operaciones de base de datos
db_lock = Lock()

# Modelo de Usuario
class User(UserMixin):
    def __init__(self, id, email, nombre, plan='free', rol='user'):
        self.id = id
        self.email = email
        self.nombre = nombre
        self.plan = plan
        self.rol = rol
    
    def is_admin(self):
        return self.rol == 'admin'

@login_manager.user_loader
def load_user(user_id):
    with db_lock:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, email, nombre, plan, rol, fecha_expiracion 
            FROM usuarios 
            WHERE id = ? AND activo = 1
        ''', (user_id,))
        user_data = cursor.fetchone()
        conn.close()
        
        if user_data:
            id, email, nombre, plan, rol, expiracion = user_data
            # Verificar si la suscripción está activa
            if expiracion and datetime.strptime(expiracion, '%Y-%m-%d %H:%M:%S') < datetime.now():
                # Suscripción expirada, pero permitimos login para renovar
                return User(id, email, nombre, 'expired', rol)
            return User(id, email, nombre, plan, rol)
    return None

# Función hash de contraseña
def hash_password(password):
    salt = "redcajeros_salt_2024"
    return hashlib.sha256((password + salt).encode()).hexdigest()

# Decorador para verificar suscripción activa
def subscription_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if current_user.is_authenticated:
            # Verificar suscripción
            with db_lock:
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                cursor.execute('SELECT fecha_expiracion, plan FROM usuarios WHERE id = ?', (current_user.id,))
                expiracion, plan = cursor.fetchone()
                conn.close()
                
                if expiracion and datetime.strptime(expiracion, '%Y-%m-%d %H:%M:%S') < datetime.now():
                    if plan != 'admin':
                        return jsonify({
                            'success': False, 
                            'error': 'Tu suscripción ha expirado. Renueva para continuar.',
                            'code': 'SUBSCRIPTION_EXPIRED'
                        }), 403
        return f(*args, **kwargs)
    return decorated_function

def init_db():
    """Crear base de datos y tablas - Versión Segura"""
    with db_lock:
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # 1. Tabla usuarios
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS usuarios (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    nombre TEXT,
                    plan TEXT DEFAULT 'free',
                    rol TEXT DEFAULT 'user',
                    telefono TEXT,
                    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    fecha_expiracion TIMESTAMP,
                    activo BOOLEAN DEFAULT 1,
                    api_key TEXT UNIQUE
                )
            ''')
            
            # 2. Tabla pagos_manuales
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS pagos_manuales (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    usuario_id INTEGER,
                    codigo TEXT UNIQUE NOT NULL,
                    monto DECIMAL(10,2),
                    plan TEXT,
                    estado TEXT DEFAULT 'pendiente',
                    comprobante_url TEXT,
                    fecha_solicitud TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    fecha_verificacion TIMESTAMP,
                    notas TEXT,
                    FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
                )
            ''')
            
            # 3. Tabla cajeros
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
            
            # 4. Tabla cargas
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
                    FOREIGN KEY(cajero_id) REFERENCES cajeros(id),
                    FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
                )
            ''')
            
            # 5. Tabla pagos
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS pagos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    usuario_id INTEGER NOT NULL,
                    cajero_id INTEGER,
                    monto_pagado REAL,
                    total_comisiones REAL,
                    fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    notas TEXT,
                    FOREIGN KEY(cajero_id) REFERENCES cajeros(id),
                    FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
                )
            ''')
            
            # 6. Tabla configuraciones
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS configuraciones (
                    clave TEXT PRIMARY KEY,
                    valor TEXT
                )
            ''')
            
            # Insertar configuraciones por defecto
            cursor.execute('''
                INSERT OR IGNORE INTO configuraciones (clave, valor) 
                VALUES ('porcentaje_comision', '10'),
                       ('moneda', '$'),
                       ('plataformas', 'Zeus,Gana,Ganamos'),
                       ('permitir_deudas', '1'),
                       ('whatsapp_admin', '584121234567'),
                       ('banco_nombre', 'Tu Banco'),
                       ('banco_cuenta', '0102-1234-5678-9012'),
                       ('banco_titular', 'Tu Nombre'),
                       ('precio_basico', '9.99'),
                       ('precio_premium', '19.99')
            ''')
            
            # Crear usuario admin por defecto
            cursor.execute('SELECT id FROM usuarios WHERE email = ?', ('admin@redcajeros.com',))
            if not cursor.fetchone():
                admin_hash = hashlib.sha256('admin123'.encode()).hexdigest()
                fecha_expiracion = (datetime.now() + timedelta(days=3650)).strftime('%Y-%m-%d %H:%M:%S')
                cursor.execute('''
                    INSERT INTO usuarios (email, password_hash, nombre, plan, rol, fecha_expiracion)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', ('admin@redcajeros.com', admin_hash, 'Administrador', 'admin', 'admin', fecha_expiracion))
            
            conn.commit()
            conn.close()
            print("✅ Base de datos sincronizada con éxito.")
        except Exception as e:
            print(f"❌ Error crítico en init_db: {e}")
            import traceback
            traceback.print_exc()

def actualizar_bd():
    """Actualizar base de datos existente"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Verificar y agregar columnas si no existen
        columnas_usuarios = [col[1] for col in cursor.execute("PRAGMA table_info(usuarios)").fetchall()]
        if 'rol' not in columnas_usuarios:
            cursor.execute('ALTER TABLE usuarios ADD COLUMN rol TEXT DEFAULT "user"')
        if 'telefono' not in columnas_usuarios:
            cursor.execute('ALTER TABLE usuarios ADD COLUMN telefono TEXT')
        if 'api_key' not in columnas_usuarios:
            cursor.execute('ALTER TABLE usuarios ADD COLUMN api_key TEXT UNIQUE')
        
        # Verificar tablas nuevas
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='pagos_manuales'")
        if not cursor.fetchone():
            cursor.execute('''
                CREATE TABLE pagos_manuales (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    usuario_id INTEGER,
                    codigo TEXT UNIQUE NOT NULL,
                    monto DECIMAL(10,2),
                    plan TEXT,
                    estado TEXT DEFAULT 'pendiente',
                    comprobante_url TEXT,
                    fecha_solicitud TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    fecha_verificacion TIMESTAMP,
                    notas TEXT,
                    FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
                )
            ''')
        
        # Agregar usuario_id a tablas existentes si no existe
        tablas = ['cajeros', 'cargas', 'pagos']
        for tabla in tablas:
            cursor.execute(f"PRAGMA table_info({tabla})")
            columnas = [col[1] for col in cursor.fetchall()]
            if 'usuario_id' not in columnas:
                cursor.execute(f'ALTER TABLE {tabla} ADD COLUMN usuario_id INTEGER')
        
        # Actualizar configuraciones
        configs_necesarias = {
            'whatsapp_admin': '584121234567',
            'banco_nombre': 'Tu Banco',
            'banco_cuenta': '0102-1234-5678-9012',
            'banco_titular': 'Tu Nombre',
            'precio_basico': '9.99',
            'precio_premium': '19.99'
        }
        
        for clave, valor in configs_necesarias.items():
            cursor.execute('SELECT clave FROM configuraciones WHERE clave = ?', (clave,))
            if not cursor.fetchone():
                cursor.execute('INSERT INTO configuraciones (clave, valor) VALUES (?, ?)', (clave, valor))
        
        conn.commit()
        conn.close()
        print("✅ Base de datos actualizada")
        
    except Exception as e:
        print(f"❌ Error actualizando BD: {e}")

# ========== RUTAS DE AUTENTICACIÓN ==========

@app.route('/login')
def login_page():
    # Si ya está logueado en Flask, mandarlo al dashboard directamente
    if current_user.is_authenticated:
        return redirect(url_for('dashboard_page'))
    return render_template('login.html')

@app.route('/register')
def register_page():
    """Página de registro - si ya está autenticado, redirige"""
    if current_user.is_authenticated:
        if current_user.rol == 'admin':
            return redirect(url_for('admin_panel'))
        else:
            return redirect(url_for('dashboard'))
    return render_template('register.html')

@app.route('/dashboard')
@login_required
def dashboard_page():
    return render_template('dashboard.html')

@app.route('/api/auth/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        nombre = data.get('nombre')
        email = data.get('email').lower().strip()
        password = data.get('password')
        
        if not email or not password:
            return jsonify({'success': False, 'error': 'Email y contraseña requeridos'}), 400

        # Usamos hashlib para el hash (o tu función hash_password si la tienes)
        hashed_pw = hashlib.sha256(password.encode()).hexdigest()
        
        # Trial de 7 días
        fecha_exp = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d %H:%M:%S')
        api_key = secrets.token_hex(16)

        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    INSERT INTO usuarios (nombre, email, password_hash, plan, fecha_expiracion, api_key)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (nombre, email, hashed_pw, 'free', fecha_exp, api_key))
                conn.commit()
                user_id = cursor.lastrowid
                
                return jsonify({
                    'success': True,
                    'user': {
                        'id': user_id,
                        'nombre': nombre,
                        'email': email,
                        'rol': 'user'
                    }
                })
            except sqlite3.IntegrityError:
                return jsonify({'success': False, 'error': 'El correo ya existe'}), 400
            finally:
                conn.close()

    except Exception as e:
        print(f"❌ Error en /api/auth/register: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'Datos no recibidos'}), 400
            
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')

        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute('SELECT id, email, password, nombre, rol FROM usuarios WHERE email = ?', (email,))
            user_data = cursor.fetchone()
            conn.close()

        if user_data:
            # Verificación por Hash SHA256
            hashed_input = hashlib.sha256(password.encode()).hexdigest()
            if hashed_input == user_data[2]:
                # Crear objeto usuario
                user = User(user_data[0], user_data[1], user_data[2], user_data[3], user_data[4])
                
                # INICIAR SESIÓN EN FLASK (Vital para Railway)
                login_user(user, remember=True)
                
                return jsonify({
                    'success': True,
                    'user': {
                        'id': user.id,
                        'email': user.email,
                        'nombre': user.nombre,
                        'rol': user.rol
                    }
                })
            
        return jsonify({'success': False, 'error': 'Credenciales inválidas'}), 401

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'success': False, 'error': 'Error interno'}), 500

@app.route('/api/auth/logout')
@login_required
def api_logout():
    logout_user()
    return jsonify({'success': True, 'message': 'Sesión cerrada'})

@app.route('/api/auth/me')
@login_required
def api_get_user():
    try:
        # Obtener datos actualizados de la BD
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute('''
                SELECT email, nombre, plan, rol, fecha_expiracion 
                FROM usuarios 
                WHERE id = ? AND activo = 1
            ''', (current_user.id,))
            
            user_data = cursor.fetchone()
            conn.close()
            
            if not user_data:
                return jsonify({'success': False, 'error': 'Usuario no encontrado'}), 404
            
            email, nombre, plan, rol, expiracion = user_data
            
            # Verificar si la suscripción está activa
            if expiracion and datetime.strptime(expiracion, '%Y-%m-%d %H:%M:%S') < datetime.now():
                plan = 'expired'
            
            return jsonify({
                'success': True,
                'user': {
                    'id': current_user.id,
                    'email': email,
                    'nombre': nombre,
                    'plan': plan,
                    'rol': rol,
                    'expiracion': expiracion
                }
            })
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    
@app.route('/api/auth/verify', methods=['GET'])
@login_required
def verify_auth():
    """Verificar autenticación y obtener datos del usuario"""
    return jsonify({
        'success': True,
        'user': {
            'id': current_user.id,
            'email': current_user.email,
            'nombre': current_user.nombre,
            'plan': current_user.plan,
            'rol': current_user.rol
        }
    })

# ========== SISTEMA DE PAGOS MANUALES ==========

@app.route('/api/pagos/solicitar', methods=['POST'])
@login_required
def solicitar_pago():
    """Solicitar pago manual"""
    try:
        data = request.get_json()
        plan = data.get('plan', 'basic')
        
        # Precios
        precios = {'basic': 9.99, 'premium': 19.99}
        if plan not in precios:
            return jsonify({'success': False, 'error': 'Plan no válido'}), 400
        
        # Generar código único
        codigo = f"REDCAJ-{secrets.token_hex(3).upper()}"
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Obtener datos bancarios de configuración
            cursor.execute('SELECT valor FROM configuraciones WHERE clave IN ("banco_nombre", "banco_cuenta", "banco_titular", "whatsapp_admin")')
            configs = cursor.fetchall()
            config_dict = {
                'banco_nombre': configs[0][0] if len(configs) > 0 else 'Tu Banco',
                'banco_cuenta': configs[1][0] if len(configs) > 1 else '0102-1234-5678-9012',
                'banco_titular': configs[2][0] if len(configs) > 2 else 'Tu Nombre',
                'whatsapp_admin': configs[3][0] if len(configs) > 3 else '584121234567'
            }
            
            # Insertar solicitud de pago
            cursor.execute('''
                INSERT INTO pagos_manuales (usuario_id, codigo, monto, plan)
                VALUES (?, ?, ?, ?)
            ''', (current_user.id, codigo, precios[plan], plan))
            
            conn.commit()
            conn.close()
        
        # Generar enlace de WhatsApp
        mensaje = f"Hola RedCajeros! Te envío el comprobante del pago con código {codigo} para el plan {plan}"
        whatsapp_url = f"https://wa.me/{config_dict['whatsapp_admin']}?text={mensaje.replace(' ', '%20')}"
        
        return jsonify({
            'success': True,
            'data': {
                'codigo': codigo,
                'monto': precios[plan],
                'plan': plan,
                'banco_nombre': config_dict['banco_nombre'],
                'banco_cuenta': config_dict['banco_cuenta'],
                'banco_titular': config_dict['banco_titular'],
                'whatsapp_url': whatsapp_url,
                'whatsapp_numero': config_dict['whatsapp_admin']
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/pagos/mis-solicitudes')
@login_required
def mis_solicitudes_pago():
    """Obtener solicitudes de pago del usuario"""
    with db_lock:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT codigo, monto, plan, estado, fecha_solicitud, fecha_verificacion
            FROM pagos_manuales
            WHERE usuario_id = ?
            ORDER BY fecha_solicitud DESC
        ''', (current_user.id,))
        
        solicitudes = cursor.fetchall()
        conn.close()
    
    return jsonify({
        'success': True,
        'data': [{
            'codigo': s[0],
            'monto': s[1],
            'plan': s[2],
            'estado': s[3],
            'fecha_solicitud': s[4],
            'fecha_verificacion': s[5]
        } for s in solicitudes]
    })

# ========== PANEL ADMIN ==========

@app.route('/admin')
@login_required
def admin_panel():
    """Panel de administración"""
    if not current_user.is_admin():
        return redirect(url_for('dashboard'))
    return render_template('admin.html')

@app.route('/api/admin/pagos/pendientes')
@login_required
def admin_pagos_pendientes():
    """Obtener pagos pendientes (solo admin)"""
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'No autorizado'}), 403
    
    with db_lock:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT pm.id, pm.codigo, pm.monto, pm.plan, pm.fecha_solicitud,
                   u.email, u.nombre, u.telefono
            FROM pagos_manuales pm
            JOIN usuarios u ON pm.usuario_id = u.id
            WHERE pm.estado = 'pendiente'
            ORDER BY pm.fecha_solicitud DESC
        ''')
        
        pagos = cursor.fetchall()
        conn.close()
    
    return jsonify({
        'success': True,
        'data': [{
            'id': p[0],
            'codigo': p[1],
            'monto': p[2],
            'plan': p[3],
            'fecha_solicitud': p[4],
            'usuario_email': p[5],
            'usuario_nombre': p[6],
            'usuario_telefono': p[7]
        } for p in pagos]
    })

@app.route('/api/admin/pagos/verificar/<codigo>', methods=['POST'])
@login_required
def admin_verificar_pago(codigo):
    """Verificar pago manualmente (solo admin)"""
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'No autorizado'}), 403
    
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
                return jsonify({'success': False, 'error': 'Código no encontrado o ya verificado'})
            
            usuario_id, monto, plan = pago
            
            # Actualizar usuario
            nueva_expiracion = datetime.now() + timedelta(days=30)
            
            cursor.execute('''
                UPDATE usuarios 
                SET plan = ?, fecha_expiracion = ?
                WHERE id = ?
            ''', (plan, nueva_expiracion.strftime('%Y-%m-%d %H:%M:%S'), usuario_id))
            
            # Marcar pago como verificado
            cursor.execute('''
                UPDATE pagos_manuales 
                SET estado = 'verificado', fecha_verificacion = CURRENT_TIMESTAMP
                WHERE codigo = ?
            ''', (codigo,))
            
            conn.commit()
            
            # Obtener email del usuario
            cursor.execute('SELECT email, nombre FROM usuarios WHERE id = ?', (usuario_id,))
            usuario_email, usuario_nombre = cursor.fetchone()
            
            conn.close()
        
        return jsonify({
            'success': True, 
            'message': f'Pago verificado. Usuario {usuario_nombre} activado hasta {nueva_expiracion.strftime("%Y-%m-%d")}'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/admin/pagos/rechazar/<codigo>', methods=['POST'])
@login_required
def admin_rechazar_pago(codigo):
    """Rechazar pago (solo admin)"""
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'No autorizado'}), 403
    
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Obtener datos del pago
            cursor.execute('SELECT usuario_id FROM pagos_manuales WHERE codigo = ?', (codigo,))
            pago = cursor.fetchone()
            
            if not pago:
                conn.close()
                return jsonify({'success': False, 'error': 'Código no encontrado'})
            
            # Marcar como rechazado
            cursor.execute('''
                UPDATE pagos_manuales 
                SET estado = 'rechazado'
                WHERE codigo = ?
            ''', (codigo,))
            
            conn.commit()
            conn.close()
        
        return jsonify({'success': True, 'message': 'Pago rechazado'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/admin/usuarios')
@login_required
def admin_usuarios():
    """Listar todos los usuarios (solo admin)"""
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'No autorizado'}), 403
    
    with db_lock:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, email, nombre, plan, rol, telefono, 
                   fecha_registro, fecha_expiracion, activo
            FROM usuarios
            ORDER BY fecha_registro DESC
        ''')
        
        usuarios = cursor.fetchall()
        conn.close()
    
    return jsonify({
        'success': True,
        'data': [{
            'id': u[0],
            'email': u[1],
            'nombre': u[2],
            'plan': u[3],
            'rol': u[4],
            'telefono': u[5],
            'fecha_registro': u[6],
            'fecha_expiracion': u[7],
            'activo': bool(u[8])
        } for u in usuarios]
    })

# ========== MIDDLEWARE Y RUTAS PROTEGIDAS ==========

@app.before_request
def handle_json():
    if request.method in ['POST', 'PUT'] and request.content_type == 'application/json':
        try:
            request.json_data = request.get_json()
        except:
            request.json_data = None

@app.route('/')
def index():
    if current_user.is_authenticated:
        if current_user.is_admin():
            return redirect(url_for('admin_panel'))
        return redirect(url_for('dashboard'))
    return render_template('login.html')

# ========== MODIFICAR TODAS LAS RUTAS EXISTENTES PARA FILTRAR POR USUARIO ==========

# Decorador para rutas que requieren usuario activo
def user_required(f):
    @wraps(f)
    @login_required
    @subscription_required
    def decorated_function(*args, **kwargs):
        return f(*args, **kwargs)
    return decorated_function

# CAJEROS - Modificadas para filtrar por usuario
@app.route('/api/cajeros', methods=['GET'])
@user_required
def get_cajeros():
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute('SELECT id, nombre, activo, fecha_creacion FROM cajeros WHERE usuario_id = ? ORDER BY nombre', (current_user.id,))
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
@user_required
def add_cajero():
    try:
        if request.json_data:
            data = request.json_data
        else:
            data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No se recibieron datos'}), 400
            
        nombre = data.get('nombre', '').strip()
        
        if not nombre:
            return jsonify({'success': False, 'error': 'El nombre no puede estar vacío'}), 400
        
        if len(nombre) < 2:
            return jsonify({'success': False, 'error': 'El nombre debe tener al menos 2 caracteres'}), 400
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            try:
                # Verificar si ya existe un cajero con el mismo nombre para este usuario
                cursor.execute('SELECT id, nombre FROM cajeros WHERE LOWER(nombre) = LOWER(?) AND usuario_id = ?', (nombre, current_user.id))
                cajero_existente = cursor.fetchone()
                
                if cajero_existente:
                    conn.close()
                    return jsonify({
                        'success': False, 
                        'error': f'Ya existe un cajero con el nombre "{cajero_existente[1]}"'
                    }), 400
                
                cursor.execute('INSERT INTO cajeros (usuario_id, nombre) VALUES (?, ?)', (current_user.id, nombre))
                conn.commit()
                cajero_id = cursor.lastrowid
                
                cursor.execute('SELECT id, nombre, activo, fecha_creacion FROM cajeros WHERE id = ?', (cajero_id,))
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
            except sqlite3.IntegrityError:
                conn.close()
                return jsonify({'success': False, 'error': 'El cajero ya existe'}), 400
                
    except Exception as e:
        return jsonify({'success': False, 'error': f'Error: {str(e)}'}), 500

# CARGAS - Modificadas para filtrar por usuario
@app.route('/api/cargas', methods=['GET'])
@user_required
def get_cargas():
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            fecha_inicio = request.args.get('fecha_inicio')
            fecha_fin = request.args.get('fecha_fin')
            cajero_id = request.args.get('cajero_id')
            plataforma = request.args.get('plataforma')
            limite = request.args.get('limite', 100)
            
            query = '''
                SELECT cg.id, c.nombre, cg.plataforma, cg.monto, cg.fecha, cg.nota, cg.pagado, cg.es_deuda
                FROM cargas cg
                JOIN cajeros c ON cg.cajero_id = c.id
                WHERE cg.usuario_id = ?
            '''
            
            params = [current_user.id]
            
            if fecha_inicio and fecha_fin:
                query += ' AND cg.fecha BETWEEN ? AND ?'
                params.extend([fecha_inicio, fecha_fin])
            
            if cajero_id:
                query += ' AND cg.cajero_id = ?'
                params.append(cajero_id)
            
            if plataforma:
                query += ' AND cg.plataforma = ?'
                params.append(plataforma)
            
            query += ' ORDER BY cg.fecha DESC LIMIT ?'
            params.append(limite)
            
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
@user_required
def add_carga():
    try:
        if request.json_data:
            data = request.json_data
        else:
            data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No se recibieron datos'}), 400
        
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
            cursor.execute('SELECT id, nombre FROM cajeros WHERE id = ? AND usuario_id = ? AND activo = 1', (cajero_id, current_user.id))
            cajero = cursor.fetchone()
            if not cajero:
                conn.close()
                return jsonify({'success': False, 'error': 'El cajero no existe o no tienes permisos'}), 400
            
            cursor.execute('''
                INSERT INTO cargas (usuario_id, cajero_id, plataforma, monto, fecha, nota, es_deuda)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (current_user.id, cajero_id, plataforma, monto, fecha, nota, es_deuda))
            
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

# RESÚMEN - Modificado para filtrar por usuario
@app.route('/api/resumen', methods=['GET'])
@user_required
def get_resumen():
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            cursor.execute('SELECT id, nombre FROM cajeros WHERE usuario_id = ? AND activo = 1 ORDER BY nombre', (current_user.id,))
            cajeros = cursor.fetchall()
            
            resumen = []
            
            for cajero_id, nombre in cajeros:
                # Calcular totales por plataforma
                cursor.execute('''
                    SELECT plataforma, SUM(monto) as total
                    FROM cargas 
                    WHERE cajero_id = ? AND usuario_id = ? AND (pagado = 0 OR pagado IS NULL)
                    GROUP BY plataforma
                ''', (cajero_id, current_user.id))
                
                montos = cursor.fetchall()
                
                totales = {'Zeus': 0, 'Gana': 0, 'Ganamos': 0}
                
                for plataforma, total in montos:
                    if plataforma in totales:
                        totales[plataforma] = total or 0
                
                total_general = sum(totales.values())
                
                # Obtener cantidad de cargas
                cursor.execute('SELECT COUNT(*) FROM cargas WHERE cajero_id = ? AND usuario_id = ? AND (pagado = 0 OR pagado IS NULL)', (cajero_id, current_user.id))
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

# ESTADÍSTICAS - Modificado para filtrar por usuario
@app.route('/api/estadisticas', methods=['GET'])
@user_required
def get_estadisticas():
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Total cajeros del usuario
            cursor.execute('SELECT COUNT(*) FROM cajeros WHERE usuario_id = ? AND activo = 1', (current_user.id,))
            total_cajeros = cursor.fetchone()[0]
            
            # Total cargas del usuario
            cursor.execute('SELECT COUNT(*), COALESCE(SUM(monto), 0) FROM cargas WHERE usuario_id = ?', (current_user.id,))
            total_cargas, monto_total = cursor.fetchone()
            
            # Cargas hoy del usuario
            hoy = datetime.now().strftime('%Y-%m-%d')
            cursor.execute('SELECT COUNT(*), COALESCE(SUM(monto), 0) FROM cargas WHERE usuario_id = ? AND fecha LIKE ?', (current_user.id, f'{hoy}%',))
            cargas_hoy, monto_hoy = cursor.fetchone()
            
            # Top cajero del usuario
            cursor.execute('''
                SELECT c.nombre, SUM(cg.monto) as total
                FROM cajeros c
                JOIN cargas cg ON c.id = cg.cajero_id
                WHERE c.usuario_id = ? AND cg.usuario_id = ?
                GROUP BY c.id
                ORDER BY total DESC
                LIMIT 1
            ''', (current_user.id, current_user.id))
            top_cajero = cursor.fetchone()
            
            conn.close()
        
        return jsonify({
            'success': True,
            'data': {
                'totales': {
                    'cajeros': total_cajeros,
                    'cargas': total_cargas or 0,
                    'monto_total': monto_total or 0
                },
                'hoy': {
                    'cargas': cargas_hoy or 0,
                    'monto': monto_hoy or 0
                },
                'top_cajero': {
                    'nombre': top_cajero[0] if top_cajero else 'Sin datos',
                    'monto': top_cajero[1] if top_cajero else 0
                }
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# PAGOS - Modificado para filtrar por usuario
@app.route('/api/pagos', methods=['POST'])
@user_required
def registrar_pago():
    try:
        if request.json_data:
            data = request.json_data
        else:
            data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No se recibieron datos'}), 400
        
        cajero_id = data.get('cajero_id')
        monto_pagado = data.get('monto_pagado')
        notas = data.get('notas', '').strip()
        
        if not cajero_id:
            return jsonify({'success': False, 'error': 'Se requiere ID del cajero'}), 400
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Verificar que el cajero existe y pertenece al usuario
            cursor.execute('SELECT nombre FROM cajeros WHERE id = ? AND usuario_id = ? AND activo = 1', (cajero_id, current_user.id))
            cajero = cursor.fetchone()
            
            if not cajero:
                conn.close()
                return jsonify({'success': False, 'error': 'Cajero no encontrado o no tienes permisos'}), 404
            
            # Obtener el total actual de comisiones
            cursor.execute('''
                SELECT COALESCE(SUM(monto), 0), COUNT(*)
                FROM cargas 
                WHERE cajero_id = ? AND usuario_id = ? AND (pagado = 0 OR pagado IS NULL)
            ''', (cajero_id, current_user.id))
            
            total_comisiones, cantidad_cargas = cursor.fetchone()
            
            if monto_pagado is None:
                monto_pagado = total_comisiones
            
            # Registrar el pago
            cursor.execute('''
                INSERT INTO pagos (usuario_id, cajero_id, monto_pagado, total_comisiones, notas)
                VALUES (?, ?, ?, ?, ?)
            ''', (current_user.id, cajero_id, monto_pagado, total_comisiones, notas))
            
            pago_id = cursor.lastrowid
            
            # Marcar cargas como pagadas
            if monto_pagado >= total_comisiones:
                cursor.execute('''
                    UPDATE cargas 
                    SET pagado = 1 
                    WHERE cajero_id = ? AND usuario_id = ? AND (pagado = 0 OR pagado IS NULL)
                ''', (cajero_id, current_user.id))
            else:
                cursor.execute('''
                    UPDATE cargas 
                    SET pagado = 1 
                    WHERE id IN (
                        SELECT id FROM cargas 
                        WHERE cajero_id = ? AND usuario_id = ? AND (pagado = 0 OR pagado IS NULL)
                        ORDER BY fecha ASC
                        LIMIT ?
                    )
                ''', (cajero_id, current_user.id, cantidad_cargas))
            
            # Registrar carga especial para el pago
            fecha_pago = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute('''
                INSERT INTO cargas (usuario_id, cajero_id, plataforma, monto, fecha, nota, pagado, es_deuda)
                VALUES (?, ?, ?, ?, ?, ?, 1, 0)
            ''', (current_user.id, cajero_id, 'PAGO', -monto_pagado, fecha_pago, f'Pago registrado - {notas}' if notas else 'Pago registrado'))
            
            conn.commit()
            
            cursor.execute('SELECT * FROM pagos WHERE id = ?', (pago_id,))
            pago = cursor.fetchone()
            conn.close()
        
        return jsonify({
            'success': True,
            'data': {
                'id': pago[0],
                'cajero_id': pago[1],
                'cajero_nombre': cajero[0],
                'monto_pagado': pago[2],
                'total_comisiones': pago[3],
                'fecha_pago': pago[4],
                'notas': pago[5],
                'diferencia': pago[2] - pago[3],
                'cargas_afectadas': cantidad_cargas
            },
            'message': f'Pago registrado exitosamente para {cajero[0]}'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# EXPORTACIÓN - Modificado para filtrar por usuario
@app.route('/api/exportar/pdf', methods=['GET'])
@user_required
def exportar_pdf():
    try:
        fecha_inicio = request.args.get('fecha_inicio')
        fecha_fin = request.args.get('fecha_fin')
        tipo_reporte = request.args.get('tipo_reporte', 'general')
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            query_cargas = '''
                SELECT c.nombre, cg.plataforma, cg.monto, cg.fecha, cg.nota,
                       CASE 
                           WHEN cg.pagado = 1 THEN 'PAGADO'
                           WHEN cg.es_deuda = 1 THEN 'DEUDA'
                           ELSE 'PENDIENTE'
                       END as estado,
                       CASE 
                           WHEN cg.es_deuda = 1 THEN 'DEUDA'
                           ELSE 'CARGA'
                       END as tipo
                FROM cargas cg
                JOIN cajeros c ON cg.cajero_id = c.id
                WHERE cg.usuario_id = ?
            '''
            
            params = [current_user.id]
            if fecha_inicio and fecha_fin:
                query_cargas += ' AND cg.fecha BETWEEN ? AND ?'
                params.extend([fecha_inicio, fecha_fin])
            
            query_cargas += ' ORDER BY cg.fecha DESC'
            
            cursor.execute(query_cargas, params)
            cargas_data = cursor.fetchall()
            
            total_cargas = len(cargas_data)
            total_monto = sum(row[2] for row in cargas_data)
            
            # Obtener datos del usuario para el reporte
            cursor.execute('SELECT email, nombre FROM usuarios WHERE id = ?', (current_user.id,))
            usuario_data = cursor.fetchone()
            usuario_email, usuario_nombre = usuario_data if usuario_data else ('', '')
            
            conn.close()
        
        # Crear PDF
        buffer = io.BytesIO()
        
        doc = SimpleDocTemplate(
            buffer,
            pagesize=landscape(letter),
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=72
        )
        
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=16,
            spaceAfter=30,
            alignment=1
        )
        
        elements = []
        
        # Título con datos del usuario
        title_text = f"RedCajeros - Reporte {tipo_reporte.capitalize()}\nUsuario: {usuario_nombre} ({usuario_email})"
        if fecha_inicio and fecha_fin:
            fecha_inicio_formatted = fecha_inicio.split('T')[0] if 'T' in fecha_inicio else fecha_inicio
            fecha_fin_formatted = fecha_fin.split('T')[0] if 'T' in fecha_fin else fecha_fin
            title_text += f"\nDel {fecha_inicio_formatted} al {fecha_fin_formatted}"
        else:
            title_text += f"\n{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        
        elements.append(Paragraph(title_text, title_style))
        elements.append(Spacer(1, 20))
        
        # Totales
        totales_data = [
            ['Total Cargas:', str(total_cargas)],
            ['Monto Total:', f"${total_monto:.2f}"],
            ['Generado:', datetime.now().strftime('%Y-%m-%d %H:%M:%S')]
        ]
        
        totales_table = Table(totales_data, colWidths=[200, 200])
        totales_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#2c3e50')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ('TOPPADDING', (0, 0), (-1, -1), 12),
        ]))
        elements.append(totales_table)
        elements.append(Spacer(1, 20))
        
        # Tabla de datos
        if cargas_data:
            headers = ['Cajero', 'Plataforma', 'Monto', 'Fecha', 'Estado', 'Tipo']
            data = [headers]
            
            for row in cargas_data:
                monto = float(row[2])
                fecha = row[3]
                fecha_formatted = fecha.split(' ')[0] if ' ' in fecha else fecha
                
                data.append([
                    row[0],
                    row[1],
                    f"${abs(monto):.2f}" + (" (-)" if monto < 0 else ""),
                    fecha_formatted,
                    row[5],
                    row[6]
                ])
            
            table = Table(data, colWidths=[120, 80, 80, 80, 80, 80])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#34495e')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#ecf0f1')),
                ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 1, colors.grey),
            ]))
            
            elements.append(table)
        else:
            elements.append(Paragraph("No hay datos para mostrar", styles['Normal']))
        
        elements.append(Spacer(1, 30))
        elements.append(Paragraph("© RedCajeros - Sistema de Gestión de Comisiones", styles['Normal']))
        
        doc.build(elements)
        
        buffer.seek(0)
        filename = f'redcajeros_{usuario_email}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.pdf'
        
        return send_file(
            buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== RUTAS DE CONFIGURACIÓN (solo admin) ==========

@app.route('/api/configuracion', methods=['GET'])
@login_required
def get_configuracion():
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'No autorizado'}), 403
    
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            cursor.execute('SELECT clave, valor FROM configuraciones')
            configs = cursor.fetchall()
            conn.close()
        
        config_dict = {row[0]: row[1] for row in configs}
        
        return jsonify({
            'success': True,
            'data': config_dict
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/configuracion', methods=['PUT'])
@login_required
def update_configuracion():
    if not current_user.is_admin():
        return jsonify({'success': False, 'error': 'No autorizado'}), 403
    
    try:
        if request.json_data:
            data = request.json_data
        else:
            data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No se recibieron datos'}), 400
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            for clave, valor in data.items():
                cursor.execute('''
                    INSERT OR REPLACE INTO configuraciones (clave, valor)
                    VALUES (?, ?)
                ''', (clave, str(valor)))
            
            conn.commit()
            conn.close()
        
        return jsonify({
            'success': True,
            'message': 'Configuración actualizada exitosamente'
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

# ========== INICIAR APLICACIÓN ==========

if __name__ == '__main__':
    # 1. Asegurar BD
    try:
        init_db()
        # actualizar_bd() # Descomentar si tienes esta función
    except Exception as e:
        print(f"Aviso inicialización: {e}")

    # 2. Configuración Railway
    port = int(os.environ.get("PORT", 5000))
    print(f"🚀 Corriendo en puerto: {port}")
    app.run(host='0.0.0.0', port=port, debug=False)


def status():
    """Endpoint para healthcheck de Railway"""
    return jsonify({
        'status': 'online',
        'database': os.path.exists(DB_PATH),
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'version': '4.0',
        'nombre': 'RedCajeros',
        'usuarios': len(get_all_users()) if hasattr(get_all_users, '__call__') else 0
    })


def get_all_users():
    """Función auxiliar para contar usuarios"""
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute('SELECT COUNT(*) FROM usuarios')
            count = cursor.fetchone()[0]
            conn.close()
            return count
    except:
        return 0

