
import mysql.connector
from mysql.connector import pooling
from mysql.connector.connection import MySQLConnection
from typing import Tuple, Dict, Optional, Any, List
import os
import logging
from datetime import datetime
from dotenv import load_dotenv

# Cargar variables simulando el entorno si se ejecuta directo
load_dotenv()

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

    def registrar_evento(self, user_id: str, nombre: str) -> Tuple[str, int]:
        """
        Registra el evento de asistencia en la base de datos.
        Determina si es Almuerzo, Dieta, Extra o Duplicado.
        Retorna: (tipo_evento, numero_ticket)
        """
        conn = None
        tipo_evento = "ERROR"
        user_id_str = str(user_id)
        es_vip = user_id_str in self.IDS_VIPS
        es_especial = user_id_str in self.IDS_CON_ESPECIAL

        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            ahora = datetime.now()
            fecha_hoy = ahora.date()

            es_dieta_seleccion = self._verificar_menu(cursor, user_id_str, fecha_hoy)
            ya_comio = self._es_duplicado(cursor, user_id_str, fecha_hoy)

            if not ya_comio:
                if es_especial:
                    tipo_evento = "TICKET GERENCIA"
                elif es_dieta_seleccion:
                    tipo_evento = "TICKET DIETA"
                else:
                    tipo_evento = "TICKET ALMUERZO"
            else:
                if es_vip:
                    tipo_evento = "TICKET EXTRA"
                else:
                    tipo_evento = "INTENTO DE DUPLICADO"

            ticket_number = self._get_siguiente_ticket(cursor, fecha_hoy)
            
            # 4. Insertar el registro
            sql_insert = "INSERT INTO registros (user_id, nombre, fecha, hora, descripcion, numero_ticket) VALUES (%s, %s, %s, %s, %s, %s)"
            val_insert = (user_id_str, nombre, fecha_hoy, ahora.time(), tipo_evento, ticket_number)
            cursor.execute(sql_insert, val_insert)
            conn.commit()
            
            logging.info(f"✅ REGISTRADO: {nombre} -> {tipo_evento} (N: {ticket_number})")
            return tipo_evento, ticket_number

        except Exception as e:
            logging.error(f"Error BD al registrar evento: {e}")
            return "ERROR", 0
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
    def verificar_horario(self):
        """
        Verifica si la hora actual está dentro del rango permitido en la configuración.
        Retorna: (permitido: bool, mensaje: str)
        """
        conn = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT clave, valor FROM configuracion")
            rows = cursor.fetchall()
            config = {row[0]: row[1] for row in rows}

            if config.get('horario_activo') == 'true':
                start = config.get('horario_inicio', '00:00')
                end = config.get('horario_fin', '23:59')
                
                # Obtener hora actual (Format HH:MM)
                # Asumiendo hora local del sistema
                now = datetime.now().strftime('%H:%M')
                
                if now < start or now > end:
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
