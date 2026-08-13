"""
Pruebas del control de tiempo de almuerzo (tabla almuerzo_sesiones, migración 004).

Crea una base de datos desechable, ejercita la lógica real de src/database.py y la
borra al terminar. NUNCA toca la base de producción.

Uso:
    cd backend/python_core
    ./venv/bin/python tests/test_control_almuerzo.py

Requiere que el usuario de `python_core/.env` tenga permiso CREATE DATABASE.
"""
import os
import sys
from datetime import datetime, timedelta

import mysql.connector
from dotenv import load_dotenv

PYTHON_CORE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(os.path.dirname(PYTHON_CORE))
sys.path.insert(0, PYTHON_CORE)

load_dotenv(os.path.join(PYTHON_CORE, '.env'))

DB_PRUEBA = 'comedor_test_almuerzo'
MIGRACION = os.path.join(PROJECT_ROOT, 'sql', 'migrations', '004_control_almuerzo.sql')

# Esquema mínimo que necesita registrar_evento()
ESQUEMA_BASE = """
CREATE TABLE usuarios (
  zk_id VARCHAR(50) NOT NULL PRIMARY KEY,
  nombre_completo VARCHAR(150) NOT NULL,
  role VARCHAR(50) DEFAULT 'Operativo',
  tipo_menu_predeterminado VARCHAR(50) DEFAULT 'Normal'
) ENGINE=InnoDB;

CREATE TABLE registros (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  nombre VARCHAR(150) DEFAULT NULL,
  fecha DATE NOT NULL,
  hora TIME NOT NULL,
  descripcion VARCHAR(50) DEFAULT NULL,
  numero_ticket INT DEFAULT 0,
  KEY idx_fecha (fecha)
) ENGINE=InnoDB;

CREATE TABLE menu_diario (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  fecha DATE NOT NULL,
  opcion INT DEFAULT 1,
  sin_sopa TINYINT(1) DEFAULT 0,
  sin_arroz TINYINT(1) DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE configuracion (
  clave VARCHAR(50) NOT NULL PRIMARY KEY,
  valor TEXT,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
"""

DATOS_BASE = """
INSERT INTO usuarios (zk_id, nombre_completo) VALUES
  ('900', 'PRUEBA UNO'), ('901', 'PRUEBA DOS'), ('902', 'PRUEBA TRES'),
  ('904', 'PRUEBA CUATRO'), ('905', 'PRUEBA CINCO'), ('14', 'VIP CATORCE');

INSERT INTO configuracion (clave, valor) VALUES
  ('horario_activo', 'true'), ('horario_inicio', '00:00'), ('horario_fin', '23:59'),
  ('almuerzo_control_activo', 'true'), ('almuerzo_minutos_permitidos', '30'),
  ('almuerzo_tolerancia_minutos', '0'), ('almuerzo_retorno_min_minutos', '8'),
  ('almuerzo_horario_fin_retorno', '15:30'), ('almuerzo_excluir_ids', '14,27');
"""

CONEXION_ADMIN = {
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', ''),
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', 3306)),
}

fallos = []


def check(nombre, obtenido, esperado):
    ok = obtenido == esperado
    print(f"{'✅' if ok else '❌'} {nombre}: {obtenido!r}" + ("" if ok else f" (esperado {esperado!r})"))
    if not ok:
        fallos.append(nombre)


def ejecutar_script(conn, script):
    cur = conn.cursor()
    for sentencia in [s.strip() for s in script.split(';') if s.strip()]:
        cur.execute(sentencia)
    conn.commit()
    cur.close()


def preparar_bd():
    """Crea la BD desechable con el esquema base más la tabla de la migración 004."""
    conn = mysql.connector.connect(**CONEXION_ADMIN)
    cur = conn.cursor()
    cur.execute(f"DROP DATABASE IF EXISTS {DB_PRUEBA}")
    cur.execute(f"CREATE DATABASE {DB_PRUEBA}")
    cur.close()
    conn.close()

    conn = mysql.connector.connect(database=DB_PRUEBA, **CONEXION_ADMIN)
    ejecutar_script(conn, ESQUEMA_BASE)
    ejecutar_script(conn, DATOS_BASE)

    # Extraer el CREATE TABLE real de la migración: la prueba valida el mismo DDL
    # que se aplica en producción, no una copia que pueda quedar desfasada.
    with open(MIGRACION, encoding='utf-8') as f:
        contenido = f.read()
    inicio = contenido.index('CREATE TABLE IF NOT EXISTS `almuerzo_sesiones`')
    fin = contenido.index(';', contenido.index('ENGINE=InnoDB', inicio))
    ejecutar_script(conn, contenido[inicio:fin])
    conn.close()


def borrar_bd():
    conn = mysql.connector.connect(**CONEXION_ADMIN)
    cur = conn.cursor()
    cur.execute(f"DROP DATABASE IF EXISTS {DB_PRUEBA}")
    cur.close()
    conn.close()


def main():
    preparar_bd()

    # Database() lee DB_NAME del entorno: lo apuntamos a la BD desechable
    os.environ['DB_NAME'] = DB_PRUEBA
    from src.database import Database
    db = Database()

    def sql(query, params=()):
        conn = db.get_connection()
        cur = conn.cursor()
        cur.execute(query, params)
        filas = cur.fetchall() if cur.description else None
        conn.commit()
        cur.close()
        conn.close()
        return filas

    def retroceder_salida(user_id, minutos=None, segundos=None):
        """Simula que la salida al almuerzo ocurrió hace N minutos/segundos."""
        delta = timedelta(minutes=minutos or 0, seconds=segundos or 0)
        nueva = (datetime.now() - delta).time().strftime('%H:%M:%S')
        sql("UPDATE almuerzo_sesiones SET hora_salida = %s WHERE user_id = %s AND fecha = CURDATE()",
            (nueva, user_id))
        sql("UPDATE registros SET hora = %s WHERE user_id = %s AND fecha = CURDATE() "
            "AND descripcion LIKE 'TICKET%'", (nueva, user_id))

    def sesion(user_id):
        filas = sql("""SELECT estado, segundos_usados, minutos_usados, hora_retorno, tipo_ticket
                         FROM almuerzo_sesiones WHERE user_id = %s AND fecha = CURDATE()""", (user_id,))
        return filas[0] if filas else None

    def set_config(clave, valor):
        sql("INSERT INTO configuracion (clave, valor) VALUES (%s, %s) "
            "ON DUPLICATE KEY UPDATE valor = %s", (clave, valor, valor))
        db._config_cache = {}  # invalidar caché TTL para que el cambio aplique ya

    print("\n--- CASO 1: primera marcación abre la sesión ---")
    tipo, ticket, _ = db.registrar_evento('900', 'PRUEBA UNO')
    check("tipo", tipo, "TICKET ALMUERZO")
    check("numero_ticket", ticket, 1)
    s = sesion('900')
    check("estado sesión", s[0], "EN_ALMUERZO")
    check("tipo_ticket sesión", s[4], "TICKET ALMUERZO")
    check("hora_retorno vacía", s[3], None)

    print("\n--- CASO 2: re-marca a los 3 min = duplicado, no retorno ---")
    retroceder_salida('900', minutos=3)
    tipo, _, _ = db.registrar_evento('900', 'PRUEBA UNO')
    check("tipo", tipo, "INTENTO DE DUPLICADO")
    check("sesión sigue abierta", sesion('900')[0], "EN_ALMUERZO")

    print("\n--- CASO 3: retorno a los 25 min = A_TIEMPO ---")
    retroceder_salida('900', minutos=25)
    tipo, ticket, info = db.registrar_evento('900', 'PRUEBA UNO')
    check("tipo", tipo, "RETORNO ALMUERZO")
    check("estado", info.get('estado'), "A_TIEMPO")
    check("no consume ticket", ticket, None)
    check("minutos", sesion('900')[2], 25)
    check("registro sin numero_ticket",
          sql("SELECT numero_ticket FROM registros WHERE user_id='900' "
              "AND descripcion='RETORNO ALMUERZO'")[0][0], None)

    print("\n--- CASO 4: marcación posterior al cierre = duplicado ---")
    tipo, _, _ = db.registrar_evento('900', 'PRUEBA UNO')
    check("tipo", tipo, "INTENTO DE DUPLICADO")
    check("sesión no se reabre", sesion('900')[0], "A_TIEMPO")

    print("\n--- CASO 5: retorno a los 35 min = EXCEDIDO (30 min estrictos) ---")
    db.registrar_evento('901', 'PRUEBA DOS')
    retroceder_salida('901', minutos=35)
    tipo, _, info = db.registrar_evento('901', 'PRUEBA DOS')
    check("tipo", tipo, "RETORNO ALMUERZO")
    check("estado", info.get('estado'), "EXCEDIDO")
    check("minutos", sesion('901')[2], 35)

    print("\n--- CASO 6: 30:40 excede (el límite se mide en segundos) ---")
    db.registrar_evento('902', 'PRUEBA TRES')
    retroceder_salida('902', segundos=30 * 60 + 40)
    _, _, info = db.registrar_evento('902', 'PRUEBA TRES')
    check("estado", info.get('estado'), "EXCEDIDO")
    check("minutos_usados truncados a 30", sesion('902')[2], 30)
    check("segundos exactos", sesion('902')[1], 30 * 60 + 40)

    print("\n--- CASO 7: VIP excluido conserva TICKET EXTRA y no genera sesión ---")
    db.registrar_evento('14', 'VIP CATORCE')
    check("sin sesión para VIP", sesion('14'), None)
    tipo, _, _ = db.registrar_evento('14', 'VIP CATORCE')
    check("tipo", tipo, "TICKET EXTRA")

    print("\n--- CASO 8: ventana de retorno extendida fuera de horario ---")
    ahora = datetime.now()
    fin_pasado = (ahora - timedelta(minutes=30)).strftime('%H:%M')
    set_config('almuerzo_horario_fin_retorno', (ahora + timedelta(minutes=60)).strftime('%H:%M'))
    db.registrar_evento('904', 'PRUEBA CUATRO')          # abre sesión dentro de horario
    set_config('horario_fin', fin_pasado)                # ahora ya cerró el comedor
    check("sesión abierta -> aceptado", db.verificar_horario('904')[0], True)
    check("sin sesión -> rechazado", db.verificar_horario('903')[0], False)
    check("sesión ya cerrada -> rechazado", db.verificar_horario('901')[0], False)
    check("sin user_id -> rechazado", db.verificar_horario()[0], False)
    set_config('horario_fin', '23:59')

    print("\n--- CASO 9: control desactivado = comportamiento anterior ---")
    set_config('almuerzo_control_activo', 'false')
    db.registrar_evento('905', 'PRUEBA CINCO')
    check("no crea sesión", sesion('905'), None)
    tipo, _, _ = db.registrar_evento('905', 'PRUEBA CINCO')
    check("2ª marcación vuelve a ser duplicado", tipo, "INTENTO DE DUPLICADO")
    set_config('almuerzo_control_activo', 'true')

    print("\n--- CASO 10: cerrar_sesiones_colgadas marca SIN_RETORNO ---")
    sql("INSERT INTO almuerzo_sesiones (user_id, nombre, fecha, hora_salida, tipo_ticket) "
        "VALUES ('906', 'PRUEBA SEIS', CURDATE() - INTERVAL 1 DAY, '12:00:00', 'TICKET ALMUERZO')")
    check("cerró la sesión de ayer", db.cerrar_sesiones_colgadas(), 1)
    check("estado", sql("SELECT estado FROM almuerzo_sesiones WHERE user_id='906'")[0][0], "SIN_RETORNO")
    check("no toca las de hoy", sql("SELECT COUNT(*) FROM almuerzo_sesiones WHERE fecha = CURDATE() "
                                    "AND estado = 'EN_ALMUERZO'")[0][0], 1)
    check("idempotente", db.cerrar_sesiones_colgadas(), 0)

    print("\n--- CASO 11: tiene_sesion_abierta ---")
    check("904 abierta", db.tiene_sesion_abierta('904'), True)
    check("900 cerrada", db.tiene_sesion_abierta('900'), False)
    check("inexistente", db.tiene_sesion_abierta('999'), False)

    print("\n" + "=" * 55)
    if fallos:
        print(f"❌ {len(fallos)} FALLO(S): {', '.join(fallos)}")
        return 1
    print("✅ TODAS LAS PRUEBAS PASARON")
    return 0


if __name__ == "__main__":
    codigo = 1
    try:
        codigo = main()
    finally:
        borrar_bd()
    sys.exit(codigo)
