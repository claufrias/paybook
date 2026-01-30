from flask import Flask, render_template, request, jsonify, send_file, redirect, url_for
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

# ========== PARCHES PARA COMPATIBILIDAD ==========
import werkzeug
# Solucionar problema de url_decode en Flask-Login
try:
    from werkzeug.urls import url_decode
    werkzeug.urls.url_decode = url_decode
except ImportError:
    # Para versiones nuevas de Werkzeug
    from werkzeug.datastructures import MultiDict
    from urllib.parse import parse_qs
    
    def url_decode(query_string, charset='utf-8'):
        result = parse_qs(query_string, keep_blank_values=True)
        return MultiDict((k, v[0]) for k, v in result.items())
    
    werkzeug.urls.url_decode = url_decode

# Ahora importar Flask-Login (debe funcionar)
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user

app = Flask(__name__)
CORS(app)

# Configuración Flask-Login
app.secret_key = os.environ.get('SECRET_KEY', 'redcajeros-secret-key-2026')
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login_page'

# Ruta de la base de datos
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'database.db')

# Lock para operaciones de base de datos
db_lock = Lock()

# ========== MODELOS ==========
class User(UserMixin):
    def __init__(self, id, email, nombre, plan='free', expiracion=None):
        self.id = id
        self.email = email
        self.nombre = nombre
        self.plan = plan
        self.expiracion = expiracion

@login_manager.user_loader
def load_user(user_id):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, email, nombre, plan, fecha_expiracion 
        FROM usuarios 
        WHERE id = ? AND activo = 1
    ''', (user_id,))
    
    user_data = cursor.fetchone()
    conn.close()
    
    if user_data:
        return User(user_data[0], user_data[1], user_data[2], user_data[3], user_data[4])
    return None

# ========== UTILIDADES ==========
def hash_password(password):
    """Hash simple para contraseñas"""
    salt = "redcajeros_salt_2026"
    return hashlib.sha256((password + salt).encode()).hexdigest()

def require_auth(f):
    """Decorator para requerir autenticación"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({'success': False, 'error': 'No autenticado'}), 401
        
        # Verificar suscripción activa
        if current_user.expiracion:
            expiracion_date = datetime.strptime(current_user.expiracion, '%Y-%m-%d %H:%M:%S')
            if expiracion_date < datetime.now():
                return jsonify({
                    'success': False, 
                    'error': 'Suscripción expirada. Renueva tu plan.',
                    'code': 'SUBSCRIPTION_EXPIRED'
                }), 403
        
        return f(*args, **kwargs)
    return decorated_function

def get_db_connection():
    """Obtener conexión a BD con contexto de usuario"""
    conn = sqlite3.connect(DB_PATH)
    
    # Si hay usuario autenticado, aplicar filtros por usuario_id
    if current_user.is_authenticated:
        # Crear función personalizada para aplicar filtros
        def add_user_filter(query, params=None):
            if params is None:
                params = []
            
            # Verificar si ya tiene WHERE
            if 'WHERE' in query.upper():
                query += ' AND usuario_id = ?'
            else:
                query += ' WHERE usuario_id = ?'
            
            params.append(current_user.id)
            return query, params
        
        conn.add_user_filter = add_user_filter
    else:
        conn.add_user_filter = lambda q, p=None: (q, p or [])
    
    return conn

# ========== INICIALIZACIÓN BD ==========
def init_db():
    """Crear base de datos y tablas"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Tabla usuarios
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            nombre TEXT,
            telefono TEXT,
            plan TEXT DEFAULT 'free',
            fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            fecha_expiracion TIMESTAMP,
            activo BOOLEAN DEFAULT 1,
            api_key TEXT UNIQUE
        )
    ''')
    
    # Tabla pagos_manuales
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pagos_manuales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            codigo TEXT UNIQUE,
            monto DECIMAL(10,2),
            plan TEXT,
            estado TEXT DEFAULT 'pendiente',
            fecha_solicitud TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            fecha_verificacion TIMESTAMP,
            FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
        )
    ''')
    
    # Tabla cajeros (MODIFICADA para multi-usuario)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cajeros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            nombre TEXT NOT NULL,
            activo BOOLEAN DEFAULT 1,
            fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(usuario_id, nombre)
        )
    ''')
    
    # Tabla cargas (MODIFICADA para multi-usuario)
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
    
    # Tabla pagos (MODIFICADA para multi-usuario)
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
    
    # Tabla configuraciones
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
               ('whatsapp_admin', '584241234567'),
               ('banco_nombre', 'Mercantil'),
               ('banco_cuenta', '0105-1234-5678-9012'),
               ('banco_titular', 'RedCajeros Admin'),
               ('precio_basico', '9.99'),
               ('precio_premium', '19.99')
    ''')
    
    # Crear usuario admin por defecto (si no existe)
    cursor.execute('SELECT id FROM usuarios WHERE email = ?', ('admin@redcajeros.com',))
    if not cursor.fetchone():
        admin_hash = hash_password('admin123')
        cursor.execute('''
            INSERT INTO usuarios (email, password_hash, nombre, plan, fecha_expiracion)
            VALUES (?, ?, ?, ?, ?)
        ''', ('admin@redcajeros.com', admin_hash, 'Administrador', 'premium', 
              (datetime.now() + timedelta(days=3650)).strftime('%Y-%m-%d %H:%M:%S')))
    
    conn.commit()
    conn.close()
    print("✅ Base de datos inicializada con sistema de usuarios")

def actualizar_bd():
    """Actualizar base de datos existente"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Verificar y agregar campos necesarios
        cursor.execute("PRAGMA table_info(cajeros)")
        columnas_cajeros = [col[1] for col in cursor.fetchall()]
        
        cursor.execute("PRAGMA table_info(cargas)")
        columnas_cargas = [col[1] for col in cursor.fetchall()]
        
        # Agregar usuario_id a tablas existentes si no existe
        if 'usuario_id' not in columnas_cajeros:
            cursor.execute('ALTER TABLE cajeros ADD COLUMN usuario_id INTEGER')
            # Asignar cajeros existentes al usuario admin
            cursor.execute('SELECT id FROM usuarios WHERE email = ?', ('admin@redcajeros.com',))
            admin_id = cursor.fetchone()[0]
            cursor.execute('UPDATE cajeros SET usuario_id = ? WHERE usuario_id IS NULL', (admin_id,))
        
        if 'usuario_id' not in columnas_cargas:
            cursor.execute('ALTER TABLE cargas ADD COLUMN usuario_id INTEGER')
            cursor.execute('SELECT id FROM usuarios WHERE email = ?', ('admin@redcajeros.com',))
            admin_id = cursor.fetchone()[0]
            cursor.execute('UPDATE cargas SET usuario_id = ? WHERE usuario_id IS NULL', (admin_id,))
        
        # Verificar tabla pagos
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='pagos'")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(pagos)")
            columnas_pagos = [col[1] for col in cursor.fetchall()]
            if 'usuario_id' not in columnas_pagos:
                cursor.execute('ALTER TABLE pagos ADD COLUMN usuario_id INTEGER')
        
        conn.commit()
        conn.close()
        print("✅ Base de datos actualizada para multi-usuario")
        
    except Exception as e:
        print(f"❌ Error actualizando BD: {e}")

# Inicializar BD
init_db()
actualizar_bd()

# ========== MIDDLEWARE ==========
@app.before_request
def handle_json():
    if request.method in ['POST', 'PUT'] and request.content_type == 'application/json':
        try:
            request.json_data = request.get_json()
        except:
            request.json_data = None

# ========== RUTAS DE AUTENTICACIÓN ==========
@app.route('/login')
def login_page():
    return render_template('login.html')

@app.route('/register')
def register_page():
    return render_template('register.html')

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')

@app.route('/admin')
@login_required
def admin_panel():
    # Solo admin puede ver este panel
    if current_user.email != 'admin@redcajeros.com':
        return redirect(url_for('dashboard'))
    return render_template('admin.html')

@app.route('/api/auth/register', methods=['POST'])
def api_register():
    try:
        if request.json_data:
            data = request.json_data
        else:
            data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No se recibieron datos'}), 400
        
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
            
            # Crear usuario
            password_hash = hash_password(password)
            fecha_expiracion = datetime.now() + timedelta(days=7)  # Trial de 7 días
            
            cursor.execute('''
                INSERT INTO usuarios (email, password_hash, nombre, telefono, plan, fecha_expiracion)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (email, password_hash, nombre, telefono, 'trial', 
                  fecha_expiracion.strftime('%Y-%m-%d %H:%M:%S')))
            
            user_id = cursor.lastrowid
            
            conn.commit()
            conn.close()
        
        # Login automático
        user = User(user_id, email, nombre, 'trial', fecha_expiracion.strftime('%Y-%m-%d %H:%M:%S'))
        login_user(user)
        
        return jsonify({
            'success': True,
            'message': 'Registro exitoso. Tienes 7 días de prueba.',
            'user': {
                'id': user_id,
                'email': email,
                'nombre': nombre,
                'telefono': telefono,
                'plan': 'trial',
                'expiracion': fecha_expiracion.strftime('%Y-%m-%d')
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    try:
        if request.json_data:
            data = request.json_data
        else:
            data = request.get_json()
        
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT id, email, password_hash, nombre, telefono, plan, fecha_expiracion 
                FROM usuarios 
                WHERE email = ? AND activo = 1
            ''', (email,))
            
            user_data = cursor.fetchone()
            conn.close()
            
        if not user_data:
            return jsonify({'success': False, 'error': 'Usuario no encontrado'}), 401
        
        user_id, user_email, stored_hash, nombre, telefono, plan, expiracion = user_data
        
        # Verificar contraseña
        if hash_password(password) != stored_hash:
            return jsonify({'success': False, 'error': 'Contraseña incorrecta'}), 401
        
        # Verificar si la suscripción está activa
        if expiracion and datetime.strptime(expiracion, '%Y-%m-%d %H:%M:%S') < datetime.now():
            return jsonify({
                'success': False, 
                'error': 'Suscripción expirada',
                'code': 'SUBSCRIPTION_EXPIRED'
            }), 403
        
        user = User(user_id, user_email, nombre, plan, expiracion)
        login_user(user)
        
        return jsonify({
            'success': True,
            'user': {
                'id': user_id,
                'email': user_email,
                'nombre': nombre,
                'telefono': telefono,
                'plan': plan,
                'expiracion': expiracion
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/auth/logout', methods=['POST'])
@login_required
def api_logout():
    logout_user()
    return jsonify({'success': True, 'message': 'Sesión cerrada'})

@app.route('/api/auth/user')
@login_required
def api_get_user():
    return jsonify({
        'success': True,
        'user': {
            'id': current_user.id,
            'email': current_user.email,
            'nombre': current_user.nombre,
            'plan': current_user.plan,
            'expiracion': current_user.expiracion
        }
    })

# ========== API PAGOS MANUALES ==========
@app.route('/api/pagos/solicitar', methods=['POST'])
@login_required
def api_solicitar_pago():
    try:
        data = request.get_json()
        plan = data.get('plan', 'basic')
        
        # Obtener precios desde configuración
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            cursor.execute("SELECT valor FROM configuraciones WHERE clave = 'precio_basico'")
            precio_basico = float(cursor.fetchone()[0])
            
            cursor.execute("SELECT valor FROM configuraciones WHERE clave = 'precio_premium'")
            precio_premium = float(cursor.fetchone()[0])
            
            cursor.execute("SELECT valor FROM configuraciones WHERE clave = 'banco_nombre'")
            banco_nombre = cursor.fetchone()[0]
            
            cursor.execute("SELECT valor FROM configuraciones WHERE clave = 'banco_cuenta'")
            banco_cuenta = cursor.fetchone()[0]
            
            cursor.execute("SELECT valor FROM configuraciones WHERE clave = 'banco_titular'")
            banco_titular = cursor.fetchone()[0]
            
            cursor.execute("SELECT valor FROM configuraciones WHERE clave = 'whatsapp_admin'")
            whatsapp_admin = cursor.fetchone()[0]
            
            conn.close()
        
        # Precios por plan
        precios = {'basic': precio_basico, 'premium': precio_premium}
        
        if plan not in precios:
            return jsonify({'success': False, 'error': 'Plan no válido'})
        
        # Generar código único
        codigo = f"REDCAJ-{secrets.token_hex(3).upper()}"
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO pagos_manuales (usuario_id, codigo, monto, plan)
                VALUES (?, ?, ?, ?)
            ''', (current_user.id, codigo, precios[plan], plan))
            
            conn.commit()
            conn.close()
        
        # Información para el pago
        info_pago = {
            'codigo': codigo,
            'monto': precios[plan],
            'plan': plan,
            'banco_nombre': banco_nombre,
            'banco_cuenta': banco_cuenta,
            'banco_titular': banco_titular,
            'whatsapp_admin': whatsapp_admin,
            'mensaje_whatsapp': f"Hola RedCajeros! Te envío el comprobante del pago con código {codigo}"
        }
        
        return jsonify({'success': True, 'data': info_pago})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/pagos/estado')
@login_required
def api_estado_pago():
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT codigo, monto, plan, estado, fecha_solicitud, fecha_verificacion
                FROM pagos_manuales 
                WHERE usuario_id = ? 
                ORDER BY fecha_solicitud DESC
                LIMIT 1
            ''', (current_user.id,))
            
            pago = cursor.fetchone()
            conn.close()
        
        if pago:
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
        else:
            return jsonify({'success': True, 'data': None})
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== API ADMIN PAGOS ==========
@app.route('/api/admin/pagos/pendientes')
@login_required
def api_admin_pagos_pendientes():
    # Solo admin puede ver esto
    if current_user.email != 'admin@redcajeros.com':
        return jsonify({'success': False, 'error': 'No autorizado'}), 403
    
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT pm.id, pm.codigo, pm.monto, pm.plan, pm.estado, pm.fecha_solicitud,
                       u.email, u.nombre, u.telefono
                FROM pagos_manuales pm
                JOIN usuarios u ON pm.usuario_id = u.id
                WHERE pm.estado = 'pendiente'
                ORDER BY pm.fecha_solicitud DESC
            ''')
            
            pagos = cursor.fetchall()
            conn.close()
        
        pagos_list = []
        for p in pagos:
            pagos_list.append({
                'id': p[0],
                'codigo': p[1],
                'monto': p[2],
                'plan': p[3],
                'estado': p[4],
                'fecha_solicitud': p[5],
                'usuario_email': p[6],
                'usuario_nombre': p[7],
                'usuario_telefono': p[8]
            })
        
        return jsonify({'success': True, 'data': pagos_list})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/admin/pagos/verificar/<codigo>', methods=['POST'])
@login_required
def api_admin_verificar_pago(codigo):
    # Solo admin puede verificar pagos
    if current_user.email != 'admin@redcajeros.com':
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
            
            # Obtener email para respuesta
            cursor.execute('SELECT email FROM usuarios WHERE id = ?', (usuario_id,))
            email = cursor.fetchone()[0]
            
            conn.commit()
            conn.close()
        
        return jsonify({
            'success': True, 
            'message': f'Usuario {email} activado hasta {nueva_expiracion.strftime("%Y-%m-%d")}'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/admin/pagos/rechazar/<codigo>', methods=['POST'])
@login_required
def api_admin_rechazar_pago(codigo):
    if current_user.email != 'admin@redcajeros.com':
        return jsonify({'success': False, 'error': 'No autorizado'}), 403
    
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
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

# ========== RUTAS PRINCIPALES (PROTEGIDAS) ==========
@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    return render_template('index.html')

@app.route('/api/status')
def status():
    return jsonify({
        'status': 'online',
        'app': 'RedCajeros',
        'version': '3.0',
        'multi_usuario': True
    })

# ========== API CAJEROS (MODIFICADA PARA MULTI-USUARIO) ==========
@app.route('/api/cajeros', methods=['GET'])
@require_auth
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
@require_auth
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
                # Verificar si ya existe un cajero con el mismo nombre para ESTE usuario
                cursor.execute('SELECT id, nombre FROM cajeros WHERE usuario_id = ? AND LOWER(nombre) = LOWER(?)', 
                              (current_user.id, nombre))
                cajero_existente = cursor.fetchone()
                
                if cajero_existente:
                    conn.close()
                    return jsonify({
                        'success': False, 
                        'error': f'Ya existe un cajero con el nombre "{cajero_existente[1]}" en tu cuenta'
                    }), 400
                
                cursor.execute('INSERT INTO cajeros (usuario_id, nombre) VALUES (?, ?)', 
                              (current_user.id, nombre))
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

@app.route('/api/cajeros/<int:id>', methods=['PUT'])
@require_auth
def update_cajero(id):
    try:
        if request.json_data:
            data = request.json_data
        else:
            data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No se recibieron datos'}), 400
        
        nombre = data.get('nombre', '').strip()
        activo = data.get('activo', True)
        
        if not nombre:
            return jsonify({'success': False, 'error': 'El nombre no puede estar vacío'}), 400
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Verificar que existe y pertenece a este usuario
            cursor.execute('SELECT id, nombre FROM cajeros WHERE id = ? AND usuario_id = ?', (id, current_user.id))
            cajero_actual = cursor.fetchone()
            if not cajero_actual:
                conn.close()
                return jsonify({'success': False, 'error': 'Cajero no encontrado'}), 404
            
            # Verificar si el nuevo nombre ya existe para ESTE usuario
            cursor.execute('SELECT id FROM cajeros WHERE usuario_id = ? AND LOWER(nombre) = LOWER(?) AND id != ?', 
                          (current_user.id, nombre, id))
            if cursor.fetchone():
                conn.close()
                return jsonify({'success': False, 'error': 'Ya existe otro cajero con ese nombre en tu cuenta'}), 400
            
            # Actualizar cajero
            cursor.execute('''UPDATE cajeros SET nombre = ?, activo = ? WHERE id = ? AND usuario_id = ?''',
                          (nombre, 1 if activo else 0, id, current_user.id))
            
            conn.commit()
            conn.close()
        
        return jsonify({'success': True, 'message': 'Cajero actualizado exitosamente'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cajeros/<int:id>/eliminar', methods=['DELETE'])
@require_auth
def eliminar_cajero_completamente(id):
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Verificar que existe y pertenece a este usuario
            cursor.execute('SELECT id, nombre FROM cajeros WHERE id = ? AND usuario_id = ?', (id, current_user.id))
            cajero = cursor.fetchone()
            
            if not cajero:
                conn.close()
                return jsonify({'success': False, 'error': 'Cajero no encontrado'}), 404
            
            # Verificar si tiene cargas
            cursor.execute('SELECT COUNT(*) FROM cargas WHERE cajero_id = ? AND usuario_id = ?', (id, current_user.id))
            tiene_cargas = cursor.fetchone()[0] > 0
            
            if tiene_cargas:
                conn.close()
                return jsonify({'success': False, 'error': 'No se puede eliminar un cajero que tiene cargas registradas'}), 400
            
            # Eliminar completamente
            cursor.execute('DELETE FROM cajeros WHERE id = ? AND usuario_id = ?', (id, current_user.id))
            conn.commit()
            conn.close()
        
        return jsonify({'success': True, 'message': f'Cajero eliminado completamente'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cajeros/<int:id>', methods=['DELETE'])
@require_auth
def delete_cajero(id):
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Verificar que existe y pertenece a este usuario
            cursor.execute('SELECT id, nombre FROM cajeros WHERE id = ? AND usuario_id = ?', (id, current_user.id))
            cajero = cursor.fetchone()
            
            if not cajero:
                conn.close()
                return jsonify({'success': False, 'error': 'Cajero no encontrado'}), 404
            
            # Marcamos como inactivo
            cursor.execute('UPDATE cajeros SET activo = 0 WHERE id = ? AND usuario_id = ?', (id, current_user.id))
            
            conn.commit()
            conn.close()
        
        return jsonify({'success': True, 'message': 'Cajero desactivado correctamente'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== API CARGAS (MODIFICADA PARA MULTI-USUARIO) ==========
@app.route('/api/cargas', methods=['GET'])
@require_auth
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
@require_auth
def add_carga():
    try:
        if request.json_data:
            data = request.json_data
        else:
            data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No se recibieron datos'}), 400
        
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
        
        if abs(monto) > 1000000:
            return jsonify({'success': False, 'error': 'El monto no puede superar $1,000,000'}), 400
        
        fecha = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        es_deuda = 1 if monto < 0 else 0
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Verificar que el cajero existe y pertenece a este usuario
            cursor.execute('SELECT id, nombre FROM cajeros WHERE id = ? AND usuario_id = ? AND activo = 1', 
                          (cajero_id, current_user.id))
            cajero = cursor.fetchone()
            if not cajero:
                conn.close()
                return jsonify({'success': False, 'error': 'El cajero no existe o está inactivo'}), 400
            
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

@app.route('/api/cargas/<int:id>', methods=['DELETE'])
@require_auth
def delete_carga(id):
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Verificar que existe y pertenece a este usuario
            cursor.execute('SELECT id FROM cargas WHERE id = ? AND usuario_id = ?', (id, current_user.id))
            if not cursor.fetchone():
                conn.close()
                return jsonify({'success': False, 'error': 'Carga no encontrada'}), 404
            
            # Eliminar carga
            cursor.execute('DELETE FROM cargas WHERE id = ? AND usuario_id = ?', (id, current_user.id))
            conn.commit()
            conn.close()
        
        return jsonify({'success': True, 'message': 'Carga eliminada exitosamente'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== API RESÚMEN (MODIFICADA PARA MULTI-USUARIO) ==========
@app.route('/api/resumen', methods=['GET'])
@require_auth
def get_resumen():
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Obtener configuración de deudas
            cursor.execute("SELECT valor FROM configuraciones WHERE clave = 'permitir_deudas'")
            permitir_deudas = cursor.fetchone()
            permitir_deudas = bool(int(permitir_deudas[0])) if permitir_deudas else True
            
            # Obtener todos los cajeros activos de ESTE usuario
            cursor.execute('SELECT id, nombre FROM cajeros WHERE usuario_id = ? AND activo = 1 ORDER BY nombre', (current_user.id,))
            cajeros = cursor.fetchall()
            
            resumen = []
            
            for cajero_id, nombre in cajeros:
                # Calcular totales por plataforma - SOLO NO PAGADAS
                if permitir_deudas:
                    cursor.execute('''
                        SELECT plataforma, SUM(monto) as total
                        FROM cargas 
                        WHERE cajero_id = ? AND usuario_id = ? AND (pagado = 0 OR pagado IS NULL)
                        GROUP BY plataforma
                    ''', (cajero_id, current_user.id))
                else:
                    cursor.execute('''
                        SELECT plataforma, SUM(monto) as total
                        FROM cargas 
                        WHERE cajero_id = ? AND usuario_id = ? AND (pagado = 0 OR pagado IS NULL) AND monto > 0
                        GROUP BY plataforma
                    ''', (cajero_id, current_user.id))
                
                montos = cursor.fetchall()
                
                # Inicializar en 0
                totales = {'Zeus': 0, 'Gana': 0, 'Ganamos': 0}
                
                for plataforma, total in montos:
                    if plataforma in totales:
                        totales[plataforma] = total or 0
                
                total_general = sum(totales.values())
                
                # Obtener cantidad de cargas NO PAGADAS
                if permitir_deudas:
                    cursor.execute('SELECT COUNT(*) FROM cargas WHERE cajero_id = ? AND usuario_id = ? AND (pagado = 0 OR pagado IS NULL)', 
                                  (cajero_id, current_user.id))
                else:
                    cursor.execute('SELECT COUNT(*) FROM cargas WHERE cajero_id = ? AND usuario_id = ? AND (pagado = 0 OR pagado IS NULL) AND monto > 0', 
                                  (cajero_id, current_user.id))
                
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

# ========== API ESTADÍSTICAS (MODIFICADA PARA MULTI-USUARIO) ==========
@app.route('/api/estadisticas', methods=['GET'])
@require_auth
def get_estadisticas():
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Total cajeros de ESTE usuario
            cursor.execute('SELECT COUNT(*) FROM cajeros WHERE usuario_id = ? AND activo = 1', (current_user.id,))
            total_cajeros = cursor.fetchone()[0]
            
            # Total cargas de ESTE usuario
            cursor.execute('SELECT COUNT(*), COALESCE(SUM(monto), 0) FROM cargas WHERE usuario_id = ?', (current_user.id,))
            total_cargas, monto_total = cursor.fetchone()
            
            # Cargas hoy de ESTE usuario
            hoy = datetime.now().strftime('%Y-%m-%d')
            cursor.execute('SELECT COUNT(*), COALESCE(SUM(monto), 0) FROM cargas WHERE usuario_id = ? AND fecha LIKE ?', 
                          (current_user.id, f'{hoy}%',))
            cargas_hoy, monto_hoy = cursor.fetchone()
            
            # Top cajero de ESTE usuario
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

# ========== API PAGOS (MODIFICADA PARA MULTI-USUARIO) ==========
@app.route('/api/pagos', methods=['POST'])
@require_auth
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
            
            # Verificar que el cajero existe y pertenece a ESTE usuario
            cursor.execute('SELECT nombre FROM cajeros WHERE id = ? AND usuario_id = ? AND activo = 1', 
                          (cajero_id, current_user.id))
            cajero = cursor.fetchone()
            
            if not cajero:
                conn.close()
                return jsonify({'success': False, 'error': 'Cajero no encontrado o inactivo'}), 404
            
            # Obtener configuración de deudas
            cursor.execute("SELECT valor FROM configuraciones WHERE clave = 'permitir_deudas'")
            permitir_deudas = cursor.fetchone()
            permitir_deudas = bool(int(permitir_deudas[0])) if permitir_deudas else True
            
            # Obtener el total actual de comisiones NO pagadas (incluyendo deudas si está permitido)
            if permitir_deudas:
                cursor.execute('''
                    SELECT COALESCE(SUM(monto), 0), COUNT(*)
                    FROM cargas 
                    WHERE cajero_id = ? AND usuario_id = ? AND (pagado = 0 OR pagado IS NULL)
                ''', (cajero_id, current_user.id))
            else:
                cursor.execute('''
                    SELECT COALESCE(SUM(monto), 0), COUNT(*)
                    FROM cargas 
                    WHERE cajero_id = ? AND usuario_id = ? AND (pagado = 0 OR pagado IS NULL) AND monto > 0
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
            
            # Marcar cargas como pagadas (solo hasta el monto pagado)
            if monto_pagado >= total_comisiones:
                # Si paga todo, marcar todas como pagadas
                cursor.execute('''
                    UPDATE cargas 
                    SET pagado = 1 
                    WHERE cajero_id = ? AND usuario_id = ? AND (pagado = 0 OR pagado IS NULL)
                ''', (cajero_id, current_user.id))
            else:
                # Si paga parcialmente, marcar cargas más antiguas primero
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
            
            # Registrar carga especial en el historial para el pago
            fecha_pago = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute('''
                INSERT INTO cargas (usuario_id, cajero_id, plataforma, monto, fecha, nota, pagado, es_deuda)
                VALUES (?, ?, ?, ?, ?, ?, 1, 0)
            ''', (current_user.id, cajero_id, 'PAGO', -monto_pagado, fecha_pago, 
                  f'Pago registrado - {notas}' if notas else 'Pago registrado'))
            
            conn.commit()
            
            # Obtener detalles del pago
            cursor.execute('''
                SELECT p.*, c.nombre 
                FROM pagos p
                JOIN cajeros c ON p.cajero_id = c.id
                WHERE p.id = ?
            ''', (pago_id,))
            
            pago = cursor.fetchone()
            conn.close()
        
        return jsonify({
            'success': True,
            'data': {
                'id': pago[0],
                'cajero_id': pago[1],
                'cajero_nombre': pago[6],
                'monto_pagado': pago[3],
                'total_comisiones': pago[4],
                'fecha_pago': pago[5],
                'notas': pago[6],
                'diferencia': pago[3] - pago[4],
                'cargas_afectadas': cantidad_cargas
            },
            'message': f'Pago registrado exitosamente para {cajero[0]}'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== API EXPORTACIÓN (MODIFICADA PARA MULTI-USUARIO) ==========
@app.route('/api/exportar/pdf', methods=['GET'])
@require_auth
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
            
            # Calcular totales
            total_cargas = len(cargas_data)
            total_monto = sum(row[2] for row in cargas_data)
            
            conn.close()
        
        # Crear PDF
        buffer = io.BytesIO()
        
        # Configurar documento
        doc = SimpleDocTemplate(
            buffer,
            pagesize=landscape(letter),
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=72
        )
        
        # Estilos
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=16,
            spaceAfter=30,
            alignment=1
        )
        
        # Contenido
        elements = []
        
        # Título
        title_text = f"Reporte RedCajeros - {tipo_reporte.capitalize()}"
        title_text += f"\nUsuario: {current_user.nombre} ({current_user.email})"
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
                    row[0],  # Cajero
                    row[1],  # Plataforma
                    f"${abs(monto):.2f}" + (" (-)" if monto < 0 else ""),
                    fecha_formatted,
                    row[5],  # Estado
                    row[6]   # Tipo
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
        
        # Pie de página
        elements.append(Spacer(1, 30))
        elements.append(Paragraph("© RedCajeros - Sistema de Gestión de Comisiones", styles['Normal']))
        
        # Construir PDF
        doc.build(elements)
        
        # Preparar respuesta
        buffer.seek(0)
        filename = f'reporte_redcajeros_{current_user.id}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.pdf'
        
        return send_file(
            buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== API CONFIGURACIÓN ==========
@app.route('/api/configuracion', methods=['GET'])
@login_required
def get_configuracion():
    # Solo admin puede ver configuración
    if current_user.email != 'admin@redcajeros.com':
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

# ========== RUTAS DE PRUEBA ==========
@app.route('/api/test')
def test():
    return jsonify({'status': 'ok', 'app': 'RedCajeros', 'version': '3.0'})

# ========== MANEJADOR DE ERRORES ==========
@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'error': 'Ruta no encontrada'}), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({'success': False, 'error': 'Error interno del servidor'}), 500

# ========== INICIAR SERVIDOR ==========
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    print(f"🚀 Iniciando RedCajeros v3.0 (Sistema Multi-Usuario)...")
    print(f"📁 Base de datos: {DB_PATH}")
    print(f"👤 Usuario admin: admin@redcajeros.com / admin123")
    print(f"🌐 Puerto: {port}")
    print("\n⚠️  Para detener: Presiona Ctrl+C\n")
    app.run(host='0.0.0.0', port=port, debug=False)