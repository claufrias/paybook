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