
import mysql.connector
from mysql.connector import pooling
from mysql.connector.connection import MySQLConnection
from typing import Tuple, Dict, Optional, Any, List
import os
import time
import logging
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Cargar variables simulando el entorno si se ejecuta directo
load_dotenv()

# Valores por defecto del control de tiempo de almuerzo (migración 004).
# Se usan solo si la clave no está en la tabla `configuracion`.
CONFIG_ALMUERZO_DEFAULTS: Dict[str, str] = {
    'almuerzo_control_activo':      'true',
    'almuerzo_minutos_permitidos':  '30',
    'almuerzo_tolerancia_minutos':  '0',
    'almuerzo_retorno_min_minutos': '8',
    'almuerzo_horario_fin_retorno': '15:30',
    'almuerzo_excluir_ids':         '',
    'almuerzo_zonas_controladas':   '',
    'almuerzo_controlar_sin_zona':  'true',
}

# Descripciones que representan un almuerzo ya consumido
TIPOS_TICKET_CONSUMO = ('TICKET ALMUERZO', 'TICKET EXTRA', 'TICKET DIETA', 'TICKET GERENCIA')
# Descripciones que abren una sesión de almuerzo (miden tiempo)
TIPOS_ABREN_SESION = ('TICKET ALMUERZO', 'TICKET DIETA', 'TICKET GERENCIA')
RETORNO_ALMUERZO = 'RETORNO ALMUERZO'

class Database:
    """
    Clase responsable de todas las interacciones con la base de datos MySQL.
    Maneja conexiones, registros de eventos y sincronización de usuarios.
    """

    def __init__(self) -> None:
        # --- CONFIGURACIÓN DE BASE DE DATOS ---
        self.config: Dict[str, Any] = {
            'user': os.getenv('DB_USER', 'root'),
            'password': os.getenv('DB_PASSWORD', ''),
            'host': os.getenv('DB_HOST', 'localhost'),
            'database': os.getenv('DB_NAME', 'control_comedor'),
            'port': int(os.getenv('DB_PORT', 3306))
        }

        # Initialize connection pool
        try:
            self.pool = mysql.connector.pooling.MySQLConnectionPool(
                pool_name="comedor_pool",
                pool_size=5,
                pool_reset_session=True,
                **self.config
            )
            logging.info("Connection pool 'comedor_pool' created successfully.")
        except mysql.connector.Error as err:
            logging.error(f"Error creating connection pool: {err}")
            raise err
        
        # Identificadores especiales para lógica de negocio
        self.IDS_VIPS = ['14', '27']
        self.IDS_CON_ESPECIAL = ['16', '119', '120']

        # Caché de la tabla `configuracion`. Cada evento del biométrico necesita
        # leerla 2-3 veces (horario, umbrales, exclusiones); con TTL corto
        # evitamos consultas repetidas sin perder capacidad de ajuste en vivo.
        self._config_cache: Dict[str, str] = {}
        self._config_cache_ts: float = 0.0
        self.CONFIG_TTL_SEGUNDOS = 60

    def get_connection(self) -> MySQLConnection:
        """Establece y retorna una nueva conexión a MySQL."""
        try:
            return self.pool.get_connection()
        except mysql.connector.Error as err:
            logging.error(f"Error conectando a BD: {err}")
            raise err

    def obtener_nombre_real(self, user_id, nombre_zk_cortado):
        """
        Verifica si el usuario existe en la BD. Si no, lo crea.
        Retorna el nombre completo almacenado.
        """
        conn = None
        nombre_final = nombre_zk_cortado
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Consultar si el ID ya existe
            sql = "SELECT nombre_completo FROM usuarios WHERE zk_id = %s"
            cursor.execute(sql, (user_id,))
            resultado = cursor.fetchone()
            
            if resultado:
                nombre_final = resultado[0]
            else:
                # Si no existe, registrar como nuevo
                print(f"🆕 NUEVO EMPLEADO DETECTADO (ID {user_id}).")
                logging.info(f"Nuevo empleado guardado: ID {user_id}")
                sql_insert = "INSERT INTO usuarios (zk_id, nombre_completo) VALUES (%s, %s)"
                cursor.execute(sql_insert, (user_id, nombre_zk_cortado))
                conn.commit()
                nombre_final = nombre_zk_cortado

        except Exception as e:
            logging.error(f"Error sincronizando usuario {user_id}: {e}")
        finally:
            if conn and conn.is_connected():
                cursor.close()
                conn.close()
        return nombre_final

    def _verificar_menu(self, cursor: Any, user_id: str, fecha_hoy: datetime.date) -> bool:
        """ Verifica si el usuario tiene asignada una dieta web hoy o por defecto. """
        query_menu = "SELECT opcion FROM menu_diario WHERE user_id = %s AND fecha = %s"
        cursor.execute(query_menu, (user_id, fecha_hoy))
        menu_res = cursor.fetchone()

        if menu_res and menu_res[0] == 2:
            return True
        elif not menu_res:
            cursor.execute("SELECT tipo_menu_predeterminado FROM usuarios WHERE zk_id = %s", (user_id,))
            user_pref = cursor.fetchone()
            if user_pref and user_pref[0] == 'Dieta':
                return True
        return False

    def _es_duplicado(self, cursor: Any, user_id: str, fecha_hoy: datetime.date) -> bool:
        """ Retorna True si ya consumió almuerzo/dieta/gerencia en este día """
        query_duplicado = "SELECT COUNT(*) FROM registros WHERE user_id = %s AND fecha = %s AND (descripcion IN ('TICKET ALMUERZO', 'TICKET EXTRA', 'TICKET DIETA', 'TICKET GERENCIA'))"
        cursor.execute(query_duplicado, (user_id, fecha_hoy))
        (conteo,) = cursor.fetchone()
        return conteo > 0

    def _get_siguiente_ticket(self, cursor: Any, fecha_hoy: datetime.date) -> int:
        sql_used = "SELECT numero_ticket FROM registros WHERE fecha = %s AND descripcion IN ('TICKET ALMUERZO', 'TICKET EXTRA', 'TICKET DIETA', 'TICKET GERENCIA', 'TICKET VISITA') ORDER BY numero_ticket ASC"
        cursor.execute(sql_used, (fecha_hoy,))
        used_numbers = [row[0] for row in cursor.fetchall() if row[0] is not None]

        ticket_number = 1
        for n in used_numbers:
            if n == ticket_number:
                ticket_number += 1
            elif n > ticket_number:
                break # Hueco encontrado
        return ticket_number

    # ------------------------------------------------------------------
    # CONFIGURACIÓN (con caché de corta duración)
    # ------------------------------------------------------------------

    def _leer_configuracion(self, cursor: Any) -> Dict[str, str]:
        """
        Devuelve la tabla `configuracion` como dict, cacheada por CONFIG_TTL_SEGUNDOS.
        Las claves ausentes del control de almuerzo se rellenan con sus defaults.
        """
        ahora = time.time()
        if self._config_cache and (ahora - self._config_cache_ts) < self.CONFIG_TTL_SEGUNDOS:
            return self._config_cache

        cursor.execute("SELECT clave, valor FROM configuracion")
        config = dict(CONFIG_ALMUERZO_DEFAULTS)
        config.update({row[0]: row[1] for row in cursor.fetchall()})

        self._config_cache = config
        self._config_cache_ts = ahora
        return config

    @staticmethod
    def _config_int(config: Dict[str, str], clave: str) -> int:
        """Lee un entero de la configuración, cayendo al default si el valor es basura."""
        try:
            return int(str(config.get(clave, CONFIG_ALMUERZO_DEFAULTS.get(clave, '0'))).strip())
        except (TypeError, ValueError):
            logging.warning(f"Config '{clave}' no es un número válido; usando default.")
            return int(CONFIG_ALMUERZO_DEFAULTS.get(clave, '0'))

    @staticmethod
    def _lista_config(config: Dict[str, str], clave: str) -> set:
        """Convierte una clave 'A,B,C' de configuración en un set en mayúsculas."""
        return {p.strip().upper() for p in str(config.get(clave, '')).split(',') if p.strip()}

    def _obtener_zona(self, cursor: Any, user_id_str: str) -> Optional[str]:
        """Zona de trabajo del empleado, o None si no tiene ninguna asignada."""
        try:
            cursor.execute("SELECT zona FROM usuarios WHERE zk_id = %s", (user_id_str,))
            fila = cursor.fetchone()
            if fila and fila[0]:
                return str(fila[0]).strip().upper()
        except Exception as e:
            # La columna `zona` la agrega la migración 006. Si aún no está aplicada,
            # no se rompe el flujo de impresión: se trata como "sin zona".
            logging.warning(f"No se pudo leer la zona de {user_id_str}: {e}")
        return None

    def _mide_tiempo_almuerzo(self, cursor: Any, config: Dict[str, str], user_id_str: str) -> bool:
        """
        True si a este usuario se le controla el tiempo de almuerzo.

        Se descarta por tres motivos, en orden:
          1. El control está apagado globalmente (`almuerzo_control_activo`).
          2. El ID está en `almuerzo_excluir_ids` (VIPs con derecho a ticket extra).
             Es un override individual: manda sobre la zona.
          3. Su zona no está en `almuerzo_zonas_controladas` (ej. ADMINISTRATIVOS,
             BODEGA y LOGISTICA no se contabilizan).

        A quien no tiene zona asignada se le aplica `almuerzo_controlar_sin_zona`.
        """
        if str(config.get('almuerzo_control_activo', 'true')).lower() != 'true':
            return False

        if user_id_str in self._lista_config(config, 'almuerzo_excluir_ids'):
            return False

        controladas = self._lista_config(config, 'almuerzo_zonas_controladas')
        # Sin zonas configuradas se mide a todos: evita que una configuración
        # vacía o corrupta apague el módulo en silencio.
        if not controladas:
            return True

        zona = self._obtener_zona(cursor, user_id_str)
        if zona is None:
            return str(config.get('almuerzo_controlar_sin_zona', 'true')).lower() == 'true'
        return zona in controladas

    # ------------------------------------------------------------------
    # SESIONES DE ALMUERZO (tabla almuerzo_sesiones, migración 004)
    # ------------------------------------------------------------------

    @staticmethod
    def _segundos_desde_medianoche(momento: datetime) -> int:
        return momento.hour * 3600 + momento.minute * 60 + momento.second

    def _obtener_sesion(self, cursor: Any, user_id_str: str, fecha: Any) -> Optional[Dict[str, Any]]:
        """Devuelve la sesión de almuerzo del usuario para esa fecha, o None."""
        cursor.execute(
            "SELECT id, hora_salida, hora_retorno FROM almuerzo_sesiones WHERE user_id = %s AND fecha = %s",
            (user_id_str, fecha)
        )
        fila = cursor.fetchone()
        if not fila:
            return None
        return {'id': fila[0], 'hora_salida': fila[1], 'hora_retorno': fila[2]}

    def _abrir_sesion(self, cursor: Any, user_id_str: str, nombre: str, fecha: Any,
                      hora: Any, tipo_ticket: str, numero_ticket: Optional[int]) -> None:
        """
        Registra la salida al almuerzo. El ON DUPLICATE KEY no-op hace la operación
        idempotente: si ya existe una sesión del día se conserva la hora original.
        """
        cursor.execute(
            """INSERT INTO almuerzo_sesiones
                   (user_id, nombre, fecha, hora_salida, tipo_ticket, numero_ticket)
               VALUES (%s, %s, %s, %s, %s, %s)
               ON DUPLICATE KEY UPDATE id = id""",
            (user_id_str, nombre, fecha, hora, tipo_ticket, numero_ticket)
        )

    def _cerrar_sesion(self, cursor: Any, config: Dict[str, str], sesion_id: int,
                       hora_retorno: Any, segundos_usados: int) -> str:
        """
        Cierra la sesión calculando el estado. El límite es estricto: se excede al
        superar (permitidos + tolerancia) minutos, comparando en segundos para que
        un retorno a 30:40 no se trunque a 30 min.
        Retorna el estado asignado.
        """
        permitidos = self._config_int(config, 'almuerzo_minutos_permitidos')
        tolerancia = self._config_int(config, 'almuerzo_tolerancia_minutos')
        limite_segundos = (permitidos + tolerancia) * 60
        estado = 'EXCEDIDO' if segundos_usados > limite_segundos else 'A_TIEMPO'

        # El `hora_retorno IS NULL` protege contra un doble cierre por carrera.
        cursor.execute(
            """UPDATE almuerzo_sesiones
                  SET hora_retorno = %s, segundos_usados = %s, estado = %s
                WHERE id = %s AND hora_retorno IS NULL""",
            (hora_retorno, segundos_usados, estado, sesion_id)
        )
        return estado

    def tiene_sesion_abierta(self, user_id: str) -> bool:
        """
        True si el usuario salió a almorzar hoy y todavía no marcó su retorno.
        Lo usa el worker para ampliar la ventana horaria antes de rechazar la marcación.
        """
        conn = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            config = self._leer_configuracion(cursor)
            if not self._mide_tiempo_almuerzo(cursor, config, str(user_id)):
                return False
            sesion = self._obtener_sesion(cursor, str(user_id), datetime.now().date())
            return bool(sesion and sesion['hora_retorno'] is None)
        except Exception as e:
            logging.error(f"Error consultando sesión abierta de {user_id}: {e}")
            return False
        finally:
            if conn and conn.is_connected():
                cursor.close()
                conn.close()

    def cerrar_sesiones_colgadas(self, fecha: Optional[Any] = None) -> int:
        """
        Marca como SIN_RETORNO las sesiones que quedaron abiertas.
        Sin `fecha` procesa todos los días anteriores a hoy (uso en el mantenimiento
        diario); con `fecha` procesa solo ese día. Retorna cuántas cerró.
        """
        conn = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            if fecha is None:
                cursor.execute(
                    """UPDATE almuerzo_sesiones SET estado = 'SIN_RETORNO'
                        WHERE estado = 'EN_ALMUERZO' AND hora_retorno IS NULL AND fecha < CURDATE()"""
                )
            else:
                cursor.execute(
                    """UPDATE almuerzo_sesiones SET estado = 'SIN_RETORNO'
                        WHERE estado = 'EN_ALMUERZO' AND hora_retorno IS NULL AND fecha = %s""",
                    (fecha,)
                )
            afectadas = cursor.rowcount
            conn.commit()
            if afectadas:
                logging.info(f"Sesiones de almuerzo marcadas SIN_RETORNO: {afectadas}")
            return afectadas
        except Exception as e:
            logging.error(f"Error cerrando sesiones colgadas: {e}")
            return 0
        finally:
            if conn and conn.is_connected():
                cursor.close()
                conn.close()

    def registrar_evento(self, user_id: str, nombre: str) -> Tuple[str, Optional[int], Dict[str, Any]]:
        """
        Registra el evento de asistencia en la base de datos.
        Determina si es Almuerzo, Dieta, Extra, Retorno de almuerzo o Duplicado.
        Retorna: (tipo_evento, numero_ticket, info)

        `info` trae los datos del retorno cuando aplica:
        {'segundos_usados': int, 'estado': 'A_TIEMPO'|'EXCEDIDO', 'hora_salida': str}
        """
        conn = None
        tipo_evento = "ERROR"
        info: Dict[str, Any] = {}
        user_id_str = str(user_id)
        es_vip = user_id_str in self.IDS_VIPS
        es_especial = user_id_str in self.IDS_CON_ESPECIAL

        try:
            conn = self.get_connection()
            cursor = conn.cursor()

            ahora = datetime.now()
            fecha_hoy = ahora.date()

            config = self._leer_configuracion(cursor)
            mide_tiempo = self._mide_tiempo_almuerzo(cursor, config, user_id_str)

            es_dieta_seleccion = self._verificar_menu(cursor, user_id_str, fecha_hoy)
            ya_comio = self._es_duplicado(cursor, user_id_str, fecha_hoy)

            sesion = None
            if not ya_comio:
                if es_especial:
                    tipo_evento = "TICKET GERENCIA"
                elif es_dieta_seleccion:
                    tipo_evento = "TICKET DIETA"
                else:
                    tipo_evento = "TICKET ALMUERZO"
            else:
                # Ya tiene ticket hoy: puede ser el retorno del almuerzo o un duplicado real.
                sesion = self._obtener_sesion(cursor, user_id_str, fecha_hoy) if mide_tiempo else None
                segundos_usados = None
                if sesion and sesion['hora_retorno'] is None and sesion['hora_salida'] is not None:
                    # hora_salida llega como timedelta (segundos desde medianoche del mismo día)
                    segundos_usados = self._segundos_desde_medianoche(ahora) - int(sesion['hora_salida'].total_seconds())

                minimo_retorno = self._config_int(config, 'almuerzo_retorno_min_minutos') * 60
                if segundos_usados is not None and segundos_usados >= minimo_retorno:
                    tipo_evento = RETORNO_ALMUERZO
                    info['segundos_usados'] = segundos_usados
                elif es_vip:
                    tipo_evento = "TICKET EXTRA"
                else:
                    # Marcación demasiado pronto (reintento por ticket no impreso),
                    # o sesión ya cerrada (tercera marcación en adelante).
                    tipo_evento = "INTENTO DE DUPLICADO"

            # El retorno no consume número de ticket: no se imprime nada.
            ticket_number = None if tipo_evento == RETORNO_ALMUERZO else self._get_siguiente_ticket(cursor, fecha_hoy)

            # 4. Insertar el registro
            sql_insert = "INSERT INTO registros (user_id, nombre, fecha, hora, descripcion, numero_ticket) VALUES (%s, %s, %s, %s, %s, %s)"
            val_insert = (user_id_str, nombre, fecha_hoy, ahora.time(), tipo_evento, ticket_number)
            cursor.execute(sql_insert, val_insert)

            # 5. Actualizar la sesión de almuerzo en la misma transacción
            if tipo_evento == RETORNO_ALMUERZO:
                info['estado'] = self._cerrar_sesion(
                    cursor, config, sesion['id'], ahora.time(), info['segundos_usados']
                )
                info['hora_salida'] = str(sesion['hora_salida'])
            elif mide_tiempo and tipo_evento in TIPOS_ABREN_SESION:
                self._abrir_sesion(
                    cursor, user_id_str, nombre, fecha_hoy, ahora.time(), tipo_evento, ticket_number
                )

            conn.commit()

            if tipo_evento == RETORNO_ALMUERZO:
                minutos = info['segundos_usados'] // 60
                logging.info(f"✅ RETORNO: {nombre} -> {minutos} min ({info['estado']})")
            else:
                logging.info(f"✅ REGISTRADO: {nombre} -> {tipo_evento} (N: {ticket_number})")
            return tipo_evento, ticket_number, info

        except Exception as e:
            logging.error(f"Error BD al registrar evento: {e}")
            return "ERROR", 0, info
        finally:
            if conn and conn.is_connected():
                cursor.close()
                conn.close()

    def obtener_preferencias_menu(self, user_id):
        """
        Devuelve (es_dieta, es_especial, sin_sopa, sin_arroz) para un usuario hoy.
        """
        conn = None
        es_dieta = False 
        es_especial = False
        sin_sopa = False
        sin_arroz = False
        
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            fecha_hoy_str = datetime.now().strftime('%Y-%m-%d')
            
            # Consultar menú diario
            query = "SELECT opcion, sin_sopa, sin_arroz FROM menu_diario WHERE user_id = %s AND fecha = %s"
            cursor.execute(query, (user_id, fecha_hoy_str))
            resultado = cursor.fetchone()
            
            if resultado:
                opcion_db, sin_sopa_db, sin_arroz_db = resultado
                if opcion_db == 2: es_dieta = True
                if sin_sopa_db == 1: sin_sopa = True
                if sin_arroz_db == 1: sin_arroz = True
            else:
                # Preferencia por defecto
                cursor.execute("SELECT tipo_menu_predeterminado FROM usuarios WHERE zk_id = %s", (user_id,))
                user_pref = cursor.fetchone()
                if user_pref and user_pref[0] == 'Dieta':
                    es_dieta = True

            if str(user_id) in self.IDS_CON_ESPECIAL:
                es_especial = True
                
            return es_dieta, es_especial, sin_sopa, sin_arroz

        except Exception as e:
            logging.error(f"Error obteniendo preferencias: {e}")
            return False, False, False, False
        finally:
            if conn and conn.is_connected():
                cursor.close()
                conn.close()

    def sincronizar_usuarios_faltantes(self):
        """
        Busca usuarios que existen en 'registros' pero no en 'usuarios' y los restaura.
        Se ejecuta periódicamente.
        """
        conn = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            sql_missing = """
                SELECT DISTINCT r.user_id, 
                       (SELECT nombre FROM registros r2 WHERE r2.user_id = r.user_id ORDER BY id DESC LIMIT 1) as ultimo_nombre
                FROM registros r
                WHERE r.user_id NOT IN (SELECT zk_id FROM usuarios)
                AND r.user_id NOT LIKE 'VISITA_%'
            """
            cursor.execute(sql_missing)
            faltantes = cursor.fetchall()
            
            if not faltantes:
                return

            logging.info(f"Restaurando {len(faltantes)} usuarios faltantes.")
            for uid, nombre in faltantes:
                try:
                    if not nombre: nombre = f"Restaurado_{uid}"
                    sql_ins = "INSERT INTO usuarios (zk_id, nombre_completo) VALUES (%s, %s)"
                    cursor.execute(sql_ins, (str(uid), nombre))
                except Exception as e:
                    logging.error(f"Error restaurando ID {uid}: {e}")

            conn.commit()
            print(f"✅ Restauración completada: {len(faltantes)} usuarios.")
            
        except Exception as e:
            logging.error(f"Error en sincronizar_usuarios_faltantes: {e}")
        finally:
            if conn and conn.is_connected():
                cursor.close()
                conn.close()

    def sincronizar_usuarios_masivo(self, users_zk_list):
        """
        Recibe lista de objetos usuario desde el ZK y los asegura en BD.
        Retorna mapa {id: nombre}.
        """
        conn_db = None
        nuevos = 0
        user_map = {}
        try:
            conn_db = self.get_connection()
            cursor = conn_db.cursor()
            
            # Obtener IDs existentes
            cursor.execute("SELECT zk_id FROM usuarios")
            ids_en_bd = {str(row[0]) for row in cursor.fetchall()}
            
            for u in users_zk_list:
                uid_str = str(u.user_id)
                user_map[uid_str] = u.name
                if uid_str not in ids_en_bd:
                    sql = "INSERT INTO usuarios (zk_id, nombre_completo) VALUES (%s, %s)"
                    cursor.execute(sql, (uid_str, u.name))
                    ids_en_bd.add(uid_str)
                    nuevos += 1
            
            conn_db.commit()
            if nuevos > 0:
                logging.info(f"Sincronización masiva: {nuevos} nuevos usuarios.")
            
            return user_map

        except Exception as e:
            logging.error(f"Error sincronización masiva: {e}")
            return {}
        finally:
            if conn_db and conn_db.is_connected():
                cursor.close()
                conn_db.close()
    def verificar_horario(self, user_id: Optional[str] = None) -> Tuple[bool, str]:
        """
        Verifica si la hora actual está dentro del rango permitido en la configuración.

        Si se pasa `user_id` y esa persona tiene una sesión de almuerzo abierta, se
        acepta la marcación hasta `almuerzo_horario_fin_retorno` aunque ya haya
        pasado `horario_fin`. Sin esta ventana extendida, quien saca ticket a las
        13:50 y regresa a las 14:25 no quedaría registrado como retorno.

        Retorna: (permitido: bool, mensaje: str)
        """
        conn = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            config = self._leer_configuracion(cursor)

            if config.get('horario_activo') == 'true':
                start = str(config.get('horario_inicio', '00:00'))[:5]
                end = str(config.get('horario_fin', '23:59'))[:5]

                # Obtener hora actual (Format HH:MM)
                # Asumiendo hora local del sistema
                now = datetime.now().strftime('%H:%M')

                if now < start:
                    return False, f"Fuera de Horario ({start}-{end})"

                if now > end:
                    fin_retorno = str(config.get('almuerzo_horario_fin_retorno', end))[:5]
                    if (user_id is not None
                            and now <= fin_retorno
                            and self._mide_tiempo_almuerzo(cursor, config, str(user_id))):
                        sesion = self._obtener_sesion(cursor, str(user_id), datetime.now().date())
                        if sesion and sesion['hora_retorno'] is None:
                            return True, f"Ventana de retorno (hasta {fin_retorno})"
                    return False, f"Fuera de Horario ({start}-{end})"

            return True, "OK"

        except Exception as e:
            logging.error(f"Error verificando horario: {e}")
            # Si hay error de BD, permitimos por defecto para no bloquear acceso
            return True, "Error BD"
        finally:
            if conn and conn.is_connected():
                cursor.close()
                conn.close()
