from flask import Flask, render_template, request, jsonify, send_file
import sqlite3
import os
import json
from datetime import datetime, timedelta
import pandas as pd
import traceback
from threading import Lock

app = Flask(__name__)

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
               ('plataformas', 'Zeus,Gana,Ganamos')
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

@app.route('/api/cajeros/<int:id>', methods=['DELETE'])
def delete_cajero(id):
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
                # Marcar como inactivo
                cursor.execute('UPDATE cajeros SET activo = 0 WHERE id = ?', (id,))
                mensaje = f'Cajero "{cajero[1]}" marcado como inactivo (tiene cargas registradas)'
            else:
                # Eliminar completamente
                cursor.execute('DELETE FROM cajeros WHERE id = ?', (id,))
                mensaje = f'Cajero "{cajero[1]}" eliminado exitosamente'
            
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
                SELECT cg.id, c.nombre, cg.plataforma, cg.monto, cg.fecha, cg.nota
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
        
        # DEBUG: Imprimir cuántas cargas se encontraron
        print(f"📊 API /api/cargas: {len(cargas)} cargas encontradas")
        
        return jsonify({
            'success': True,
            'data': [{
                'id': row[0],
                'cajero': row[1],
                'plataforma': row[2],
                'monto': row[3],
                'fecha': row[4],
                'nota': row[5] or ''
            } for row in cargas]
        })
        
    except Exception as e:
        print(f"❌ Error en /api/cargas: {str(e)}")
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
        
        if monto <= 0:
            return jsonify({'success': False, 'error': 'El monto debe ser mayor a 0'}), 400
        
        if monto > 1000000:
            return jsonify({'success': False, 'error': 'El monto no puede superar $1,000,000'}), 400
        
        fecha = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
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
                INSERT INTO cargas (cajero_id, plataforma, monto, fecha, nota)
                VALUES (?, ?, ?, ?, ?)
            ''', (cajero_id, plataforma, monto, fecha, nota))
            
            conn.commit()
            carga_id = cursor.lastrowid
            conn.close()
        
        return jsonify({
            'success': True,
            'data': {
                'id': carga_id,
                'cajero': cajero[1],
                'plataforma': plataforma,
                'monto': monto,
                'fecha': fecha,
                'nota': nota
            },
            'message': 'Carga registrada exitosamente'
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
            
            # Obtener todos los cajeros activos
            cursor.execute('SELECT id, nombre FROM cajeros WHERE activo = 1 ORDER BY nombre')
            cajeros = cursor.fetchall()
            
            resumen = []
            
            for cajero_id, nombre in cajeros:
                # Calcular totales por plataforma - SOLO NO PAGADAS
                cursor.execute('''
                    SELECT plataforma, SUM(monto) as total
                    FROM cargas 
                    WHERE cajero_id = ? AND (pagado = 0 OR pagado IS NULL)
                    GROUP BY plataforma
                ''', (cajero_id,))
                
                montos = cursor.fetchall()
                
                # Inicializar en 0
                totales = {'Zeus': 0, 'Gana': 0, 'Ganamos': 0}
                
                for plataforma, total in montos:
                    if plataforma in totales:
                        totales[plataforma] = total or 0
                
                total_general = sum(totales.values())
                
                # Obtener cantidad de cargas NO PAGADAS
                cursor.execute('SELECT COUNT(*) FROM cargas WHERE cajero_id = ? AND (pagado = 0 OR pagado IS NULL)', (cajero_id,))
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

@app.route('/api/resumen/pendientes', methods=['GET'])
def get_resumen_pendientes():
    """Obtener resumen solo de comisiones NO PAGADAS"""
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Obtener todos los cajeros activos
            cursor.execute('SELECT id, nombre FROM cajeros WHERE activo = 1 ORDER BY nombre')
            cajeros = cursor.fetchall()
            
            resumen = []
            
            for cajero_id, nombre in cajeros:
                # Calcular totales por plataforma (SOLO NO PAGADAS)
                cursor.execute('''
                    SELECT plataforma, SUM(monto) as total
                    FROM cargas 
                    WHERE cajero_id = ? AND (pagado = 0 OR pagado IS NULL)
                    GROUP BY plataforma
                ''', (cajero_id,))
                
                montos = cursor.fetchall()
                
                # Inicializar en 0
                totales = {'Zeus': 0, 'Gana': 0, 'Ganamos': 0}
                
                for plataforma, total in montos:
                    if plataforma in totales:
                        totales[plataforma] = total or 0
                
                total_general = sum(totales.values())
                
                # Obtener cantidad de cargas NO PAGADAS
                cursor.execute('SELECT COUNT(*) FROM cargas WHERE cajero_id = ? AND (pagado = 0 OR pagado IS NULL)', (cajero_id,))
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
        print(f"❌ Error en /api/estadisticas: {str(e)}")
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
            
            # Obtener el total actual de comisiones NO pagadas
            cursor.execute('''
                SELECT COALESCE(SUM(monto), 0), COUNT(*)
                FROM cargas 
                WHERE cajero_id = ? AND (pagado = 0 OR pagado IS NULL)
            ''', (cajero_id,))
            
            total_comisiones, cantidad_cargas = cursor.fetchone()
            
            if monto_pagado is None:
                monto_pagado = total_comisiones
            
            # Registrar el pago
            cursor.execute('''
                INSERT INTO pagos (cajero_id, monto_pagado, total_comisiones, notas)
                VALUES (?, ?, ?, ?)
            ''', (cajero_id, monto_pagado, total_comisiones, notas))
            
            # Marcar cargas como pagadas
            cursor.execute('''
                UPDATE cargas 
                SET pagado = 1 
                WHERE cajero_id = ? AND (pagado = 0 OR pagado IS NULL)
            ''', (cajero_id,))
            
            conn.commit()
            pago_id = cursor.lastrowid
            
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

# ========== API EXPORTACIÓN ==========
@app.route('/api/exportar/excel', methods=['GET'])
def exportar_excel():
    try:
        # Obtener parámetros
        fecha_inicio = request.args.get('fecha_inicio')
        fecha_fin = request.args.get('fecha_fin')
        
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Construir query según tipo de reporte
            if fecha_inicio and fecha_fin:
                cursor.execute('''
                    SELECT c.nombre, cg.plataforma, cg.monto, cg.fecha, cg.nota
                    FROM cargas cg
                    JOIN cajeros c ON cg.cajero_id = c.id
                    WHERE cg.fecha BETWEEN ? AND ?
                    ORDER BY cg.fecha DESC
                ''', (fecha_inicio, fecha_fin))
            else:
                cursor.execute('''
                    SELECT c.nombre, cg.plataforma, cg.monto, cg.fecha, cg.nota
                    FROM cargas cg
                    JOIN cajeros c ON cg.cajero_id = c.id
                    ORDER BY cg.fecha DESC
                ''')
            
            cargas = cursor.fetchall()
            
            # Crear DataFrame
            df_cargas = pd.DataFrame(cargas, columns=['Cajero', 'Plataforma', 'Monto', 'Fecha', 'Nota'])
            
            # Crear DataFrame de resumen por cajero
            cursor.execute('''
                SELECT c.nombre, 
                       COALESCE(SUM(CASE WHEN cg.plataforma = 'Zeus' THEN cg.monto ELSE 0 END), 0) as Zeus,
                       COALESCE(SUM(CASE WHEN cg.plataforma = 'Gana' THEN cg.monto ELSE 0 END), 0) as Gana,
                       COALESCE(SUM(CASE WHEN cg.plataforma = 'Ganamos' THEN cg.monto ELSE 0 END), 0) as Ganamos,
                       COALESCE(SUM(cg.monto), 0) as Total,
                       COUNT(cg.id) as Cargas
                FROM cajeros c
                LEFT JOIN cargas cg ON c.id = cg.cajero_id
                GROUP BY c.id
                ORDER BY Total DESC
            ''')
            
            resumen = cursor.fetchall()
            df_resumen = pd.DataFrame(resumen, columns=['Cajero', 'Zeus', 'Gana', 'Ganamos', 'Total', 'Cargas'])
            
            conn.close()
            
            # Crear carpeta static si no existe
            static_dir = os.path.join(BASE_DIR, 'static')
            if not os.path.exists(static_dir):
                os.makedirs(static_dir)
            
            # Guardar archivo Excel
            filename = f'reporte_comisiones_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
            filepath = os.path.join(static_dir, filename)
            
            with pd.ExcelWriter(filepath, engine='openpyxl') as writer:
                df_resumen.to_excel(writer, sheet_name='Resumen', index=False)
                df_cargas.to_excel(writer, sheet_name='Cargas Detalladas', index=False)
        
        return jsonify({
            'success': True,
            'filename': filename,
            'url': f'/static/{filename}',
            'message': 'Reporte exportado exitosamente'
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
        'version': '2.1',
        'websocket': 'desactivado',
        'actualizacion': 'polling cada 10s'
    })

# ========== INICIAR SERVIDOR ==========
if __name__ == '__main__':
    print("🚀 Iniciando CashFlow v2.1 (SIN WebSockets)...")
    print(f"📁 Base de datos: {DB_PATH}")
    print("🌐 Servidor: http://127.0.0.1:5000")
    print("📱 Acceso móvil: http://[TU-IP]:5000")
    print("\n⚠️  Para detener: Presiona Ctrl+C\n")
    app.run(host='0.0.0.0', port=5000, debug=True)