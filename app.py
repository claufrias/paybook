from flask import Flask, render_template, request, jsonify, send_file
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

app = Flask(__name__)
CORS(app)

# Ruta de la base de datos
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'database.db')

# Lock para operaciones de base de datos
db_lock = Lock()

def init_db():
    """Crear base de datos y tablas"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Tabla cajeros
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cajeros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT UNIQUE NOT NULL,
            activo BOOLEAN DEFAULT 1,
            fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Tabla cargas
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cargas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cajero_id INTEGER,
            plataforma TEXT,
            monto REAL,
            fecha TEXT,
            nota TEXT,
            pagado BOOLEAN DEFAULT 0,
            es_deuda BOOLEAN DEFAULT 0,
            FOREIGN KEY(cajero_id) REFERENCES cajeros(id)
        )
    ''')
    
    # Tabla pagos
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pagos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cajero_id INTEGER,
            monto_pagado REAL,
            total_comisiones REAL,
            fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            notas TEXT,
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
    
    # Insertar configuraciones por defecto
    cursor.execute('''
        INSERT OR IGNORE INTO configuraciones (clave, valor) 
        VALUES ('porcentaje_comision', '10'),
               ('moneda', '$'),
               ('plataformas', 'Zeus,Gana,Paybook'),
               ('permitir_deudas', '1')
    ''')
    
    conn.commit()
    conn.close()

def actualizar_bd():
    """Actualizar base de datos existente"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Verificar columnas
        cursor.execute("PRAGMA table_info(cargas)")
        columnas = [col[1] for col in cursor.fetchall()]
        
        if 'pagado' not in columnas:
            cursor.execute('ALTER TABLE cargas ADD COLUMN pagado BOOLEAN DEFAULT 0')
        
        if 'es_deuda' not in columnas:
            cursor.execute('ALTER TABLE cargas ADD COLUMN es_deuda BOOLEAN DEFAULT 0')
        
        # Verificar tabla pagos
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='pagos'")
        if not cursor.fetchone():
            cursor.execute('''
                CREATE TABLE pagos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cajero_id INTEGER,
                    monto_pagado REAL,
                    total_comisiones REAL,
                    fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    notas TEXT,
                    FOREIGN KEY(cajero_id) REFERENCES cajeros(id)
                )
            ''')
        
        # Actualizar plataforma Ganamos a Paybook
        cursor.execute("UPDATE cargas SET plataforma = 'Paybook' WHERE plataforma = 'Ganamos'")
        
        # Verificar configuración de deudas
        cursor.execute("SELECT clave FROM configuraciones WHERE clave = 'permitir_deudas'")
        if not cursor.fetchone():
            cursor.execute("INSERT INTO configuraciones (clave, valor) VALUES ('permitir_deudas', '1')")
        
        # Actualizar configuraciones para incluir Paybook
        cursor.execute("UPDATE configuraciones SET valor = 'Zeus,Gana,Paybook' WHERE clave = 'plataformas'")
        
        conn.commit()
        conn.close()
        print("✅ Base de datos lista")
        
    except Exception as e:
        print(f"❌ Error BD: {e}")

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

# ========== RUTAS PRINCIPALES ==========
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/favicon.ico')
def favicon():
    return '', 404

# ========== API CAJEROS ==========
@app.route('/api/cajeros', methods=['GET'])
def get_cajeros():
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute('SELECT id, nombre, activo, fecha_creacion FROM cajeros ORDER BY nombre')
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
                cursor.execute('INSERT INTO cajeros (nombre) VALUES (?)', (nombre,))
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
            
            # Verificar si existe
            cursor.execute('SELECT id FROM cajeros WHERE id = ?', (id,))
            if not cursor.fetchone():
                conn.close()
                return jsonify({'success': False, 'error': 'Cajero no encontrado'}), 404
            
            # Verificar si el nuevo nombre ya existe
            cursor.execute('SELECT id FROM cajeros WHERE nombre = ? AND id != ?', (nombre, id))
            if cursor.fetchone():
                conn.close()
                return jsonify({'success': False, 'error': 'Ya existe otro cajero con ese nombre'}), 400
            
            # Actualizar cajero
            cursor.execute('''
                UPDATE cajeros 
                SET nombre = ?, activo = ?
                WHERE id = ?
            ''', (nombre, 1 if activo else 0, id))
            
            conn.commit()
            conn.close()
        
        return jsonify({
            'success': True,
            'message': 'Cajero actualizado exitosamente'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cajeros/<int:id>/eliminar', methods=['DELETE'])
def eliminar_cajero_completamente(id):
    """Eliminar completamente un cajero (solo si no tiene cargas)"""
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Verificar si existe
            cursor.execute('SELECT id, nombre FROM cajeros WHERE id = ?', (id,))
            cajero = cursor.fetchone()
            
            if not cajero:
                conn.close()
                return jsonify({'success': False, 'error': 'Cajero no encontrado'}), 404
            
            # Verificar si tiene cargas
            cursor.execute('SELECT COUNT(*) FROM cargas WHERE cajero_id = ?', (id,))
            tiene_cargas = cursor.fetchone()[0] > 0
            
            if tiene_cargas:
                conn.close()
                return jsonify({'success': False, 'error': 'No se puede eliminar un cajero que tiene cargas registradas. Use desactivar en su lugar.'}), 400
            
            # Eliminar completamente
            cursor.execute('DELETE FROM cajeros WHERE id = ?', (id,))
            conn.commit()
            conn.close()
        
        return jsonify({
            'success': True,
            'message': f'Cajero "{cajero[1]}" eliminado completamente del sistema'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cajeros/<int:id>', methods=['DELETE'])
def delete_cajero(id):
    """Desactivar cajero (marcar como inactivo)"""
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Verificar si existe
            cursor.execute('SELECT id, nombre FROM cajeros WHERE id = ?', (id,))
            cajero = cursor.fetchone()
            
            if not cajero:
                conn.close()
                return jsonify({'success': False, 'error': 'Cajero no encontrado'}), 404
            
            # Marcamos como inactivo
            cursor.execute('UPDATE cajeros SET activo = 0 WHERE id = ?', (id,))
            
            mensaje = f'Cajero "{cajero[1]}" marcado como inactivo'
            
            conn.commit()
            conn.close()
        
        return jsonify({
            'success': True,
            'message': mensaje
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== API CARGAS - GET ==========
@app.route('/api/cargas', methods=['GET'])
def get_cargas():
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Obtener parámetros de filtro
            fecha_inicio = request.args.get('fecha_inicio')
            fecha_fin = request.args.get('fecha_fin')
            cajero_id = request.args.get('cajero_id')
            plataforma = request.args.get('plataforma')
            limite = request.args.get('limite', 100)
            
            query = '''
                SELECT cg.id, c.nombre, cg.plataforma, cg.monto, cg.fecha, cg.nota, cg.pagado, cg.es_deuda
                FROM cargas cg
                JOIN cajeros c ON cg.cajero_id = c.id
                WHERE 1=1
            '''
            
            params = []
            
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
        
        # Permitir montos negativos (deudas)
        if monto == 0:
            return jsonify({'success': False, 'error': 'El monto no puede ser 0'}), 400
        
        if abs(monto) > 1000000:
            return jsonify({'success': False, 'error': 'El monto no puede superar $1,000,000'}), 400
        
        fecha = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        es_deuda = 1 if monto < 0 else 0
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Verificar que el cajero existe
            cursor.execute('SELECT id, nombre FROM cajeros WHERE id = ? AND activo = 1', (cajero_id,))
            cajero = cursor.fetchone()
            if not cajero:
                conn.close()
                return jsonify({'success': False, 'error': 'El cajero no existe o está inactivo'}), 400
            
            cursor.execute('''
                INSERT INTO cargas (cajero_id, plataforma, monto, fecha, nota, es_deuda)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (cajero_id, plataforma, monto, fecha, nota, es_deuda))
            
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
def delete_carga(id):
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Verificar si existe
            cursor.execute('SELECT id FROM cargas WHERE id = ?', (id,))
            if not cursor.fetchone():
                conn.close()
                return jsonify({'success': False, 'error': 'Carga no encontrada'}), 404
            
            # Eliminar carga
            cursor.execute('DELETE FROM cargas WHERE id = ?', (id,))
            conn.commit()
            conn.close()
        
        return jsonify({
            'success': True,
            'message': 'Carga eliminada exitosamente'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== API RESÚMEN ==========
@app.route('/api/resumen', methods=['GET'])
def get_resumen():
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Obtener configuración de deudas
            cursor.execute("SELECT valor FROM configuraciones WHERE clave = 'permitir_deudas'")
            permitir_deudas = cursor.fetchone()
            permitir_deudas = bool(int(permitir_deudas[0])) if permitir_deudas else True
            
            # Obtener todos los cajeros activos
            cursor.execute('SELECT id, nombre FROM cajeros WHERE activo = 1 ORDER BY nombre')
            cajeros = cursor.fetchall()
            
            resumen = []
            
            for cajero_id, nombre in cajeros:
                # Calcular totales por plataforma - SOLO NO PAGADAS
                if permitir_deudas:
                    # Si se permiten deudas, incluir montos negativos
                    cursor.execute('''
                        SELECT plataforma, SUM(monto) as total
                        FROM cargas 
                        WHERE cajero_id = ? AND (pagado = 0 OR pagado IS NULL)
                        GROUP BY plataforma
                    ''', (cajero_id,))
                else:
                    # Si no se permiten deudas, solo montos positivos
                    cursor.execute('''
                        SELECT plataforma, SUM(monto) as total
                        FROM cargas 
                        WHERE cajero_id = ? AND (pagado = 0 OR pagado IS NULL) AND monto > 0
                        GROUP BY plataforma
                    ''', (cajero_id,))
                
                montos = cursor.fetchall()
                
                # Inicializar en 0
                totales = {'Zeus': 0, 'Gana': 0, 'Paybook': 0}
                
                for plataforma, total in montos:
                    if plataforma in totales:
                        totales[plataforma] = total or 0
                
                total_general = sum(totales.values())
                
                # Obtener cantidad de cargas NO PAGADAS
                if permitir_deudas:
                    cursor.execute('SELECT COUNT(*) FROM cargas WHERE cajero_id = ? AND (pagado = 0 OR pagado IS NULL)', (cajero_id,))
                else:
                    cursor.execute('SELECT COUNT(*) FROM cargas WHERE cajero_id = ? AND (pagado = 0 OR pagado IS NULL) AND monto > 0', (cajero_id,))
                
                cantidad_cargas = cursor.fetchone()[0]
                
                resumen.append({
                    'cajero': nombre,
                    'cajero_id': cajero_id,
                    'zeus': totales['Zeus'],
                    'gana': totales['Gana'],
                    'paybook': totales['Paybook'],
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

@app.route('/api/resumen/pendientes', methods=['GET'])
def get_resumen_pendientes():
    """Obtener resumen solo de comisiones NO PAGADAS"""
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Obtener configuración de deudas
            cursor.execute("SELECT valor FROM configuraciones WHERE clave = 'permitir_deudas'")
            permitir_deudas = cursor.fetchone()
            permitir_deudas = bool(int(permitir_deudas[0])) if permitir_deudas else True
            
            # Obtener todos los cajeros activos
            cursor.execute('SELECT id, nombre FROM cajeros WHERE activo = 1 ORDER BY nombre')
            cajeros = cursor.fetchall()
            
            resumen = []
            
            for cajero_id, nombre in cajeros:
                # Calcular totales por plataforma (SOLO NO PAGADAS)
                if permitir_deudas:
                    cursor.execute('''
                        SELECT plataforma, SUM(monto) as total
                        FROM cargas 
                        WHERE cajero_id = ? AND (pagado = 0 OR pagado IS NULL)
                        GROUP BY plataforma
                    ''', (cajero_id,))
                else:
                    cursor.execute('''
                        SELECT plataforma, SUM(monto) as total
                        FROM cargas 
                        WHERE cajero_id = ? AND (pagado = 0 OR pagado IS NULL) AND monto > 0
                        GROUP BY plataforma
                    ''', (cajero_id,))
                
                montos = cursor.fetchall()
                
                # Inicializar en 0
                totales = {'Zeus': 0, 'Gana': 0, 'Paybook': 0}
                
                for plataforma, total in montos:
                    if plataforma in totales:
                        totales[plataforma] = total or 0
                
                total_general = sum(totales.values())
                
                # Obtener cantidad de cargas NO PAGADAS
                if permitir_deudas:
                    cursor.execute('SELECT COUNT(*) FROM cargas WHERE cajero_id = ? AND (pagado = 0 OR pagado IS NULL)', (cajero_id,))
                else:
                    cursor.execute('SELECT COUNT(*) FROM cargas WHERE cajero_id = ? AND (pagado = 0 OR pagado IS NULL) AND monto > 0', (cajero_id,))
                
                cantidad_cargas = cursor.fetchone()[0]
                
                resumen.append({
                    'cajero': nombre,
                    'cajero_id': cajero_id,
                    'zeus': totales['Zeus'],
                    'gana': totales['Gana'],
                    'paybook': totales['Paybook'],
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

# ========== API ESTADÍSTICAS ==========
@app.route('/api/estadisticas', methods=['GET'])
def get_estadisticas():
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Total cajeros
            cursor.execute('SELECT COUNT(*) FROM cajeros WHERE activo = 1')
            total_cajeros = cursor.fetchone()[0]
            
            # Total cargas
            cursor.execute('SELECT COUNT(*), COALESCE(SUM(monto), 0) FROM cargas')
            total_cargas, monto_total = cursor.fetchone()
            
            # Cargas hoy
            hoy = datetime.now().strftime('%Y-%m-%d')
            cursor.execute('SELECT COUNT(*), COALESCE(SUM(monto), 0) FROM cargas WHERE fecha LIKE ?', (f'{hoy}%',))
            cargas_hoy, monto_hoy = cursor.fetchone()
            
            # Top cajero (de todas las cargas)
            cursor.execute('''
                SELECT c.nombre, SUM(cg.monto) as total
                FROM cajeros c
                JOIN cargas cg ON c.id = cg.cajero_id
                GROUP BY c.id
                ORDER BY total DESC
                LIMIT 1
            ''')
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

# ========== API PAGOS ==========
@app.route('/api/pagos', methods=['POST'])
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
            
            # Verificar que el cajero existe
            cursor.execute('SELECT nombre FROM cajeros WHERE id = ? AND activo = 1', (cajero_id,))
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
                    WHERE cajero_id = ? AND (pagado = 0 OR pagado IS NULL)
                ''', (cajero_id,))
            else:
                cursor.execute('''
                    SELECT COALESCE(SUM(monto), 0), COUNT(*)
                    FROM cargas 
                    WHERE cajero_id = ? AND (pagado = 0 OR pagado IS NULL) AND monto > 0
                ''', (cajero_id,))
            
            total_comisiones, cantidad_cargas = cursor.fetchone()
            
            if monto_pagado is None:
                monto_pagado = total_comisiones
            
            # Registrar el pago
            cursor.execute('''
                INSERT INTO pagos (cajero_id, monto_pagado, total_comisiones, notas)
                VALUES (?, ?, ?, ?)
            ''', (cajero_id, monto_pagado, total_comisiones, notas))
            
            pago_id = cursor.lastrowid
            
            # Marcar cargas como pagadas (solo hasta el monto pagado)
            if monto_pagado >= total_comisiones:
                # Si paga todo, marcar todas como pagadas
                cursor.execute('''
                    UPDATE cargas 
                    SET pagado = 1 
                    WHERE cajero_id = ? AND (pagado = 0 OR pagado IS NULL)
                ''', (cajero_id,))
            else:
                # Si paga parcialmente, marcar cargas más antiguas primero
                cursor.execute('''
                    UPDATE cargas 
                    SET pagado = 1 
                    WHERE id IN (
                        SELECT id FROM cargas 
                        WHERE cajero_id = ? AND (pagado = 0 OR pagado IS NULL)
                        ORDER BY fecha ASC
                        LIMIT ?
                    )
                ''', (cajero_id, cantidad_cargas))
            
            # Registrar carga especial en el historial para el pago
            fecha_pago = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute('''
                INSERT INTO cargas (cajero_id, plataforma, monto, fecha, nota, pagado, es_deuda)
                VALUES (?, ?, ?, ?, ?, 1, 0)
            ''', (cajero_id, 'PAGO', -monto_pagado, fecha_pago, f'Pago registrado - {notas}' if notas else 'Pago registrado'))
            
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

# ========== FUNCIONES PARA PDF ==========
def generar_pdf(datos, titulo, tipo_reporte=None):
    """Generar PDF con los datos proporcionados"""
    buffer = io.BytesIO()
    
    # Crear documento PDF en formato horizontal
    doc = SimpleDocTemplate(buffer, pagesize=landscape(letter))
    elements = []
    
    # Estilos
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        spaceAfter=12,
        alignment=1  # Centrado
    )
    
    # Título
    elements.append(Paragraph(titulo, title_style))
    elements.append(Spacer(1, 12))
    
    # Información del reporte
    if tipo_reporte == 'diario':
        fecha_info = f"Fecha: {datetime.now().strftime('%Y-%m-%d')}"
    elif tipo_reporte == 'semanal':
        hoy = datetime.now()
        inicio_semana = hoy - timedelta(days=hoy.weekday())
        fin_semana = inicio_semana + timedelta(days=6)
        fecha_info = f"Período: {inicio_semana.strftime('%Y-%m-%d')} al {fin_semana.strftime('%Y-%m-%d')}"
    elif tipo_reporte == 'mensual':
        hoy = datetime.now()
        inicio_mes = datetime(hoy.year, hoy.month, 1)
        fecha_info = f"Mes: {inicio_mes.strftime('%B %Y')}"
    else:
        fecha_info = f"Generado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    
    elements.append(Paragraph(fecha_info, styles['Normal']))
    elements.append(Spacer(1, 20))
    
    # Crear tabla de datos
    if isinstance(datos, list) and len(datos) > 0:
        # Preparar encabezados y datos
        if 'cajero' in datos[0]:  # Es un resumen
            encabezados = ['Cajero', '🔱 Zeus', '🎯 Gana', '💰 Paybook', 'Total', 'Estado']
            tabla_datos = [encabezados]
            
            for item in datos:
                estado = "PAGADO" if item.get('pagado') else "PENDIENTE"
                fila = [
                    item['cajero'],
                    f"${item.get('zeus', 0):.2f}",
                    f"${item.get('gana', 0):.2f}",
                    f"${item.get('paybook', 0):.2f}",
                    f"${item.get('total', 0):.2f}",
                    estado
                ]
                tabla_datos.append(fila)
                
        else:  # Es historial de cargas
            encabezados = ['Fecha', 'Cajero', 'Plataforma', 'Monto', 'Estado', 'Tipo']
            tabla_datos = [encabezados]
            
            for item in datos:
                fecha = datetime.strptime(item['fecha'], '%Y-%m-%d %H:%M:%S')
                fecha_formateada = fecha.strftime('%d/%m/%Y %H:%M')
                
                if item.get('plataforma') == 'PAGO':
                    estado = 'PAGO'
                    tipo = 'PAGO'
                else:
                    estado = 'PAGADO' if item.get('pagado') else 'PENDIENTE'
                    tipo = 'DEUDA' if item.get('es_deuda') else 'CARGA'
                
                fila = [
                    fecha_formateada,
                    item['cajero'],
                    item['plataforma'],
                    f"${float(item['monto']):.2f}",
                    estado,
                    tipo
                ]
                tabla_datos.append(fila)
        
        # Crear tabla
        tabla = Table(tabla_datos, colWidths=[1.5*inch, 1.5*inch, 1.2*inch, 1*inch, 0.8*inch, 0.8*inch])
        
        # Estilo de la tabla
        estilo_tabla = TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.lightgrey]),
        ])
        
        tabla.setStyle(estilo_tabla)
        elements.append(tabla)
    
    # Generar PDF
    doc.build(elements)
    buffer.seek(0)
    return buffer

# ========== API EXPORTACIÓN PDF ==========
@app.route('/api/exportar/pdf', methods=['GET'])
def exportar_pdf():
    try:
        # Obtener parámetros
        fecha_inicio = request.args.get('fecha_inicio')
        fecha_fin = request.args.get('fecha_fin')
        tipo_reporte = request.args.get('tipo_reporte', 'general')
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Construir query según tipo de reporte
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
                WHERE 1=1
            '''
            
            params = []
            if fecha_inicio and fecha_fin:
                query_cargas += ' AND cg.fecha BETWEEN ? AND ?'
                params.extend([fecha_inicio, fecha_fin])
            
            query_cargas += ' ORDER BY cg.fecha DESC'
            
            cursor.execute(query_cargas, params)
            cargas_data = cursor.fetchall()
            
            # Calcular totales CORRECTAMENTE
            total_cargas = len(cargas_data)
            total_monto = sum(row[2] for row in cargas_data) if cargas_data else 0
            
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
            alignment=1  # Centered
        )
        
        # Contenido
        elements = []
        
        # Título
        title_text = f"Reporte Paybook - {tipo_reporte.capitalize()}"
        if fecha_inicio and fecha_fin:
            fecha_inicio_formatted = fecha_inicio.split('T')[0] if 'T' in fecha_inicio else fecha_inicio
            fecha_fin_formatted = fecha_fin.split('T')[0] if 'T' in fecha_fin else fecha_fin
            title_text += f"\nDel {fecha_inicio_formatted} al {fecha_fin_formatted}"
        else:
            title_text += f"\n{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        
        elements.append(Paragraph(title_text, title_style))
        elements.append(Spacer(1, 20))
        
        # Totales - FORMATO CORRECTO
        totales_data = [
            ['Total Cargas:', str(total_cargas)],
            ['Monto Total:', f"${abs(total_monto):.2f}" + (" (-)" if total_monto < 0 else "")],
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
            # Encabezados
            headers = ['Cajero', 'Plataforma', 'Monto', 'Fecha', 'Estado', 'Tipo']
            data = [headers]
            
            for row in cargas_data:
                monto = float(row[2])
                fecha = row[3]
                fecha_formatted = fecha.split(' ')[0] if ' ' in fecha else fecha
                
                data.append([
                    row[0],  # Cajero
                    row[1],  # Plataforma
                    f"${abs(monto):.2f}" + (" (-)" if monto < 0 else ""),  # Monto
                    fecha_formatted,  # Fecha
                    row[5],  # Estado
                    row[6]   # Tipo
                ])
            
            # Crear tabla
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
        elements.append(Paragraph("© Paybook - Sistema de Gestión de Comisiones", styles['Normal']))
        
        # Construir PDF
        doc.build(elements)
        
        # Preparar respuesta
        buffer.seek(0)
        filename = f'reporte_paybook_{tipo_reporte}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.pdf'
        
        return send_file(
            buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        import traceback
        print(f"Error en exportar_pdf: {str(e)}")
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== API REPORTES ==========
@app.route('/api/reportes/diario', methods=['GET'])
def get_reporte_diario():
    try:
        hoy = datetime.now().strftime('%Y-%m-%d')
        fecha_inicio = f'{hoy} 00:00:00'
        fecha_fin = f'{hoy} 23:59:59'
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Obtener cargas del día
            cursor.execute('''
                SELECT c.nombre, cg.plataforma, cg.monto, cg.fecha, cg.nota, cg.pagado, cg.es_deuda
                FROM cargas cg
                JOIN cajeros c ON cg.cajero_id = c.id
                WHERE cg.fecha BETWEEN ? AND ?
                ORDER BY cg.fecha DESC
            ''', (fecha_inicio, fecha_fin))
            
            cargas = cursor.fetchall()
            
            # Calcular totales
            cursor.execute('''
                SELECT COUNT(*), COALESCE(SUM(monto), 0)
                FROM cargas 
                WHERE fecha BETWEEN ? AND ?
            ''', (fecha_inicio, fecha_fin))
            
            total_cargas, monto_total = cursor.fetchone()
            
            conn.close()
        
        return jsonify({
            'success': True,
            'data': {
                'fecha': hoy,
                'total_cargas': total_cargas or 0,
                'monto_total': monto_total or 0,
                'cargas': [{
                    'cajero': row[0],
                    'plataforma': row[1],
                    'monto': row[2],
                    'fecha': row[3],
                    'nota': row[4] or '',
                    'pagado': bool(row[5]),
                    'es_deuda': bool(row[6])
                } for row in cargas]
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/reportes/semanal', methods=['GET'])
def get_reporte_semanal():
    try:
        hoy = datetime.now()
        inicio_semana = hoy - timedelta(days=hoy.weekday())
        fin_semana = inicio_semana + timedelta(days=6)
        
        fecha_inicio = inicio_semana.strftime('%Y-%m-%d 00:00:00')
        fecha_fin = fin_semana.strftime('%Y-%m-%d 23:59:59')
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Obtener cargas de la semana
            cursor.execute('''
                SELECT c.nombre, cg.plataforma, cg.monto, cg.fecha, cg.nota, cg.pagado, cg.es_deuda
                FROM cargas cg
                JOIN cajeros c ON cg.cajero_id = c.id
                WHERE cg.fecha BETWEEN ? AND ?
                ORDER BY cg.fecha DESC
            ''', (fecha_inicio, fecha_fin))
            
            cargas = cursor.fetchall()
            
            # Calcular totales
            cursor.execute('''
                SELECT COUNT(*), COALESCE(SUM(monto), 0)
                FROM cargas 
                WHERE fecha BETWEEN ? AND ?
            ''', (fecha_inicio, fecha_fin))
            
            total_cargas, monto_total = cursor.fetchone()
            
            conn.close()
        
        return jsonify({
            'success': True,
            'data': {
                'fecha_inicio': inicio_semana.strftime('%Y-%m-%d'),
                'fecha_fin': fin_semana.strftime('%Y-%m-%d'),
                'total_cargas': total_cargas or 0,
                'monto_total': monto_total or 0,
                'cargas': [{
                    'cajero': row[0],
                    'plataforma': row[1],
                    'monto': row[2],
                    'fecha': row[3],
                    'nota': row[4] or '',
                    'pagado': bool(row[5]),
                    'es_deuda': bool(row[6])
                } for row in cargas]
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/reportes/mensual', methods=['GET'])
def get_reporte_mensual():
    try:
        hoy = datetime.now()
        inicio_mes = datetime(hoy.year, hoy.month, 1)
        if hoy.month == 12:
            fin_mes = datetime(hoy.year + 1, 1, 1) - timedelta(days=1)
        else:
            fin_mes = datetime(hoy.year, hoy.month + 1, 1) - timedelta(days=1)
        
        fecha_inicio = inicio_mes.strftime('%Y-%m-%d 00:00:00')
        fecha_fin = fin_mes.strftime('%Y-%m-%d 23:59:59')
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Obtener cargas del mes
            cursor.execute('''
                SELECT c.nombre, cg.plataforma, cg.monto, cg.fecha, cg.nota, cg.pagado, cg.es_deuda
                FROM cargas cg
                JOIN cajeros c ON cg.cajero_id = c.id
                WHERE cg.fecha BETWEEN ? AND ?
                ORDER BY cg.fecha DESC
            ''', (fecha_inicio, fecha_fin))
            
            cargas = cursor.fetchall()
            
            # Calcular totales
            cursor.execute('''
                SELECT COUNT(*), COALESCE(SUM(monto), 0)
                FROM cargas 
                WHERE fecha BETWEEN ? AND ?
            ''', (fecha_inicio, fecha_fin))
            
            total_cargas, monto_total = cursor.fetchone()
            
            conn.close()
        
        return jsonify({
            'success': True,
            'data': {
                'fecha_inicio': inicio_mes.strftime('%Y-%m-%d'),
                'fecha_fin': fin_mes.strftime('%Y-%m-%d'),
                'total_cargas': total_cargas or 0,
                'monto_total': monto_total or 0,
                'cargas': [{
                    'cajero': row[0],
                    'plataforma': row[1],
                    'monto': row[2],
                    'fecha': row[3],
                    'nota': row[4] or '',
                    'pagado': bool(row[5]),
                    'es_deuda': bool(row[6])
                } for row in cargas]
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== API CONFIGURACIÓN ==========
@app.route('/api/configuracion', methods=['GET'])
def get_configuracion():
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
def update_configuracion():
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

# ========== API HERRAMIENTAS ==========
@app.route('/api/herramientas/calcular-comisiones', methods=['POST'])
def calcular_comisiones():
    try:
        if request.json_data:
            data = request.json_data
        else:
            data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No se recibieron datos'}), 400
        
        porcentaje = float(data.get('porcentaje', 10))
        monto_total = float(data.get('monto_total', 0))
        
        if porcentaje < 0 or porcentaje > 100:
            return jsonify({'success': False, 'error': 'El porcentaje debe estar entre 0 y 100'}), 400
        
        if monto_total < 0:
            return jsonify({'success': False, 'error': 'El monto total no puede ser negativo'}), 400
        
        comision = monto_total * (porcentaje / 100)
        
        return jsonify({
            'success': True,
            'data': {
                'porcentaje': porcentaje,
                'monto_total': monto_total,
                'comision': comision,
                'comision_formateada': f'${comision:,.2f}'
            }
        })
        
    except ValueError:
        return jsonify({'success': False, 'error': 'Datos numéricos inválidos'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ========== MANEJADOR DE ERRORES ==========
@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'error': 'Ruta no encontrada'}), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({'success': False, 'error': 'Error interno del servidor'}), 500

# ========== RUTAS DE DIAGNÓSTICO ==========
@app.route('/status')
def status():
    return jsonify({
        'status': 'online',
        'database': os.path.exists(DB_PATH),
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'version': '3.0',
        'actualizacion': 'tiempo real'
    })

# ========== INICIAR SERVIDOR ==========
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    print(f"🚀 Iniciando Paybook v3.0 (Actualización en Tiempo Real)...")
    print(f"📁 Base de datos: {DB_PATH}")
    print(f"🌐 Puerto: {port}")
    print("\n⚠️  Para detener: Presiona Ctrl+C\n")
    app.run(host='0.0.0.0', port=port, debug=False)