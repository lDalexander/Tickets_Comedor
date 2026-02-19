import sys
import time
import textwrap
import socket
import smtplib
import threading  # <--- NUEVA LIBRERÍA (Estándar)
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from zk import ZK, const
import mysql.connector
from escpos.printer import Network

# --- CONFIGURACIÓN DE DISPOSITIVOS ---
IP_BIOMETRICO = '150.36.200.12'
IP_IMPRESORA  = '150.36.200.9'
PUERTO_ZK     = 4370
ARCHIVO_LOGO  = "logo_grande.png" 

# --- CONFIGURACIÓN DE CORREO (SMTP) ---
SMTP_SERVER   = 'smtp-mail.outlook.com' # Ejemplo para Gmail
SMTP_PORT     = 587
SMTP_USER     = 'no-reply@detcuador.com'
SMTP_PASS     = 'D3tcuador2025@' # Ojo: Usa App Password si es Gmail
EMAIL_DESTINO = 'agarcia@detcuador.com'

IDS_VIPS = ['14', '27', '33'] 

DB_CONFIG = {
    'user': 'root',
    'password': '',
    'host': 'localhost',
    'database': 'control_comedor',
    'port': 3306
}

memoria_papel = {} 
estado_anterior_impresora = "DESCONOCIDO" # Estado inicial

# ==========================================
#  FUNCIONES DE CORREO Y ESTADO
# ==========================================

def enviar_correo(asunto, mensaje):
    try:
        msg = MIMEMultipart()
        msg['From'] = SMTP_USER
        msg['To'] = EMAIL_DESTINO
        msg['Subject'] = f"🤖 MONITOR IMP. DE TICKETS: {asunto}"
        msg.attach(MIMEText(mensaje, 'plain'))

        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_USER, EMAIL_DESTINO, msg.as_string())
        server.quit()
        print(f"📧 [EMAIL] Enviado: {asunto}")
    except Exception as e:
        print(f"❌ [EMAIL] Error enviando correo: {e}")

def verificar_estado_impresora():
    """
    Revisa Tapa, Papel y CONEXIÓN (Apagada).
    Maneja el cambio de estados para no hacer spam.
    """
    global estado_anterior_impresora
    
    nuevo_estado = "OK"
    mensaje_error = ""
    asunto_error = ""
    
    try:
        # Intentamos conectar. Si falla aquí, va al except -> OFFLINE
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5) # Damos 5 seg para responder antes de decir que está apagada
        s.connect((IP_IMPRESORA, 9100))
        
        # --- CONSULTAS ---
        s.send(b'\x10\x04\x02') # Tapa / Error
        resp_error = s.recv(1)
        
        s.send(b'\x10\x04\x04') # Papel
        resp_papel = s.recv(1)
        s.close()
        
        if not resp_error or not resp_papel:
            raise Exception("Respuesta vacía") # Forzamos error de conexión

        byte_error = ord(resp_error)
        byte_papel = ord(resp_papel)

        # --- ANÁLISIS ---
        tapa_abierta  = (byte_error & 0x04) > 0
        error_general = (byte_error & 0x40) > 0
        sin_papel     = (byte_papel & 0x60) > 0
        poco_papel    = (byte_papel & 0x0C) > 0

        if tapa_abierta:
            nuevo_estado = "TAPA_ABIERTA"
            asunto_error = "⚠️ ALERTA: TAPA ABIERTA"
            mensaje_error = "La tapa está abierta. Ciérrela para continuar."
        elif sin_papel:
            nuevo_estado = "SIN_PAPEL"
            asunto_error = "⛔ ALERTA: SIN PAPEL"
            mensaje_error = "La impresora no tiene papel."
        elif error_general:
            nuevo_estado = "ERROR_MECANICO"
            asunto_error = "❌ ALERTA: FALLA MECANICA"
            mensaje_error = "Posible atasco de cuchilla o error hardware."
        elif poco_papel:
            nuevo_estado = "POCO_PAPEL"
            # Opcional: Avisar o no.
        else:
            nuevo_estado = "OK"

    except Exception as e:
        # AQUÍ CAEMOS SI LA IMPRESORA ESTÁ APAGADA O SIN RED
        nuevo_estado = "OFFLINE"
        asunto_error = "🔌 ALERTA: IMPRESORA APAGADA/OFFLINE"
        mensaje_error = f"No se detecta la conexion de la impresora de tickets de comida. Puede estar apagada o sin cable de red."
        print(f"⚠️ Error conexión impresora: {e}")

    # --- LÓGICA DE NOTIFICACIÓN ---
    # Solo enviamos correo si el estado CAMBIA (ej: de OK a OFFLINE, o de OFFLINE a OK)
    if nuevo_estado != estado_anterior_impresora:
        
        # 1. Si entra en un estado de error
        if nuevo_estado != "OK" and nuevo_estado != "POCO_PAPEL":
            print(f"🚨 CAMBIO A ESTADO CRÍTICO: {nuevo_estado}")
            enviar_correo(asunto_error, mensaje_error)
        
        # 2. Si se arregla (Vuelve a OK desde un error)
        elif nuevo_estado == "OK" and estado_anterior_impresora not in ["OK", "DESCONOCIDO", "POCO_PAPEL"]:
            print("✅ IMPRESORA RECUPERADA.")
            enviar_correo("🟢 IMPRESORA ONLINE Y LISTA", "La conexión y los sensores reportan estado normal.")

        estado_anterior_impresora = nuevo_estado
    
    return nuevo_estado

# ==========================================
#  HILO DE MONITOREO PERIODICO (NUEVO)
# ==========================================

def tarea_monitoreo_periodico():
    """
    Esta función corre en paralelo (background).
    Revisa la impresora cada 12 horas aunque nadie use el comedor.
    """
    print("⏰ Hilo de monitoreo periódico INICIADO (Cada 12h)")
    while True:
        time.sleep(43200) # 43200 segundos = 12 Horas
        
        timestamp = datetime.now().strftime('%d/%m %H:%M')
        print(f"\n[{timestamp}] ⏰ Ejecutando revisión programada de 12h...")
        
        verificar_estado_impresora()
        
        # Volverá a dormir 12h automáticamente al repetir el while

# ==========================================
#  FUNCIONES ORIGINALES DB / IMPRESION
# ==========================================
# ... (Estas funciones obtener_nombre_real, registrar_evento, imprimir_tickets 
#      SON LAS MISMAS DE TU CÓDIGO ANTERIOR, las omito para ahorrar espacio visual 
#      pero debes mantenerlas en tu archivo final) ...

def obtener_nombre_real(user_id, nombre_zk_cortado):
    conn = None
    nombre_final = nombre_zk_cortado
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        sql = "SELECT nombre_completo FROM usuarios WHERE zk_id = %s"
        cursor.execute(sql, (user_id,))
        resultado = cursor.fetchone()
        
        if resultado:
            nombre_final = resultado[0]
        else:
            print(f"🆕 NUEVO EMPLEADO DETECTADO (ID {user_id}). Guardando en BD...")
            sql_insert = "INSERT INTO usuarios (zk_id, nombre_completo) VALUES (%s, %s)"
            cursor.execute(sql_insert, (user_id, nombre_zk_cortado))
            conn.commit()
            nombre_final = nombre_zk_cortado

    except Exception as e:
        print(f"⚠️ Error al sincronizar usuario: {e}")
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()
    
    return nombre_final


def registrar_evento(user_id, nombre):
    """
    Lógica inteligente:
    - Si es usuario normal: 1 ticket al día, luego DUPLICADO.
    - Si es VIP: 1 ticket normal al día, luego TICKET EXTRA (ilimitados).
    """
    conn = None
    tipo_evento = "ERROR"
    es_vip = str(user_id) in IDS_VIPS  # Verificamos si es VIP

    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        ahora = datetime.now()
        fecha_hoy = ahora.date()

        # Verificar si ya comió hoy
        query = "SELECT COUNT(*) FROM registros WHERE user_id = %s AND fecha = %s AND (descripcion = 'TICKET ALMUERZO' OR descripcion = 'TICKET EXTRA')"
        cursor.execute(query, (user_id, fecha_hoy))
        (conteo,) = cursor.fetchone()

        if conteo == 0:
            # PRIMERA VEZ DEL DÍA (Para todos, VIP o Normal)
            tipo_evento = "TICKET ALMUERZO"
        else:
            # YA COMIÓ HOY
            if es_vip:
                tipo_evento = "TICKET EXTRA" # VIPs pueden sacar más
            else:
                tipo_evento = "INTENTO DE DUPLICADO"    # Mortales solo 1

        # Guardamos en BD lo que haya pasado
        sql_insert = "INSERT INTO registros (user_id, nombre, fecha, hora, descripcion) VALUES (%s, %s, %s, %s, %s)"
        val_insert = (user_id, nombre, fecha_hoy, ahora.time(), tipo_evento)
        cursor.execute(sql_insert, val_insert)
        conn.commit()
        
        print(f"✅ [BD] REGISTRADO: {nombre} -> {tipo_evento}")
        return tipo_evento

    except Exception as e:
        print(f"❌ [BD] Error: {e}")
        return "ERROR"
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()
def sincronizar_usuarios_db(zk_conn):
    """
    Descarga usuarios del ZK, los compara con la BD y guarda SOLO los nuevos.
    Devuelve un diccionario actualizado {id: nombre} para usar en memoria.
    """
    print("🔄 Sincronizando usuarios (Biométrico -> Base de Datos)...")
    
    conn_db = None
    nuevos_agregados = 0
    
    try:
        # 1. Obtener usuarios del Biométrico
        # zk_conn.disable_device() # Descomentar si hay mucho tráfico
        users_device = zk_conn.get_users()
        # zk_conn.enable_device()
        
        # 2. Obtener IDs existentes en MySQL (Para no insertar repetidos)
        conn_db = mysql.connector.connect(**DB_CONFIG)
        cursor = conn_db.cursor()
        
        cursor.execute("SELECT zk_id FROM usuarios")
        # Creamos un CONJUNTO (Set) de IDs. Es mucho más rápido buscar aquí.
        # Convertimos a string para asegurar compatibilidad.
        ids_en_bd = {str(row[0]) for row in cursor.fetchall()}
        
        # 3. Recorrer y Comparar
        for u in users_device:
            uid_str = str(u.user_id)
            nombre_u = u.name
            
            if uid_str not in ids_en_bd:
                # ¡Es nuevo! Guardar en BD
                sql = "INSERT INTO usuarios (zk_id, nombre_completo) VALUES (%s, %s)"
                cursor.execute(sql, (uid_str, nombre_u))
                ids_en_bd.add(uid_str) # Lo agregamos al set para no repetirlo en este mismo ciclo
                nuevos_agregados += 1
                print(f"   [+] Nuevo usuario importado: ID {uid_str} - {nombre_u}")
        
        conn_db.commit()
        
        if nuevos_agregados > 0:
            print(f"✅ Sincronización terminada. Se agregaron {nuevos_agregados} usuarios nuevos.")
        else:
            print("✅ Base de datos al día. No hubo usuarios nuevos.")

        # 4. Retornar el mapa actualizado para que Python lo use en memoria
        return {str(x.user_id): x.name for x in users_device}

    except Exception as e:
        print(f"❌ Error en sincronización: {e}")
        return {} # Retornar vacío en caso de error grave
    finally:
        if conn_db and conn_db.is_connected():
            cursor.close()
            conn_db.close()

def imprimir_ticket_valido(nombre, user_id):
    # TICKET NORMAL (CON NOMBRE)
    p = None
    try:
        p = Network(IP_IMPRESORA)
        p.set(align='center')
        try: p.image(ARCHIVO_LOGO) 
        except: pass 

        p.set(align='center', bold=True, double_height=True)
        p.text("DETCUADOR S.A.\n")
        p.set(align='center', bold=False, double_height=False)
        p.text("CONTROL DE COMEDOR\n")
        p.text("--------------------------------\n")
        
        fecha = datetime.now().strftime('%d/%m/%Y %H:%M')
        p.set(align='left')
        p.text(f"FECHA: {fecha}\n")
        
        p.text("COLABORADOR:\n")
        lineas_nombre = textwrap.wrap(nombre, width=24) 
        for linea in lineas_nombre:
            p.set(align='left', bold=True)
            p.text(f"{linea}\n")
        
        p.text("--------------------------------\n")
        p.set(align='center', bold=True, invert=True)
        p.text(" VALIDO POR 1 ALMUERZO \n\n")
        p.set(align='center', bold=False, invert=False)
        p.text(" Powered by John Alexander Garcia")
        p.set(align='center', bold=False, invert=False)
        
        p.text("\n\n\n")
        p.cut()
        print(f"🖨️ [IMP] Ticket ALMUERZO enviado.")
    except Exception as e:
        print(f"❌ [IMP] Error impresora: {e}")
    finally:
        if p: p.close()


def imprimir_ticket_extra(nombre_vip):
    # TICKET VIP (SIN NOMBRE, ESPACIO EN BLANCO)
    p = None
    try:
        p = Network(IP_IMPRESORA)
        p.set(align='center')
        try: p.image(ARCHIVO_LOGO) 
        except: pass 

        p.set(align='center', bold=True)
        p.text("DETCUADOR S.A.\n")
        p.text("TICKET EXTRA\n") # Título diferente
        p.text("--------------------------------\n")
        
        fecha = datetime.now().strftime('%d/%m/%Y %H:%M')
        p.set(align='left')
        p.text(f"AUTORIZA: {nombre_vip}\n") # Quién sacó el ticket
        p.text(f"FECHA:    {fecha}\n")
        
        p.text("\nPARA EL COLABORADOR:\n\n")
        p.set(align='center', bold=True, double_height=True)
        p.text("______________________\n") # Espacio para escribir
        p.set(align='center', bold=False, double_height=False)
        p.text("(Escribir Nombre)\n")
        
        p.text("--------------------------------\n")
        p.set(align='center', bold=True, invert=True)
        p.text(" VALIDO POR 1 ALMUERZO \n\n")
        p.set(align='center', bold=False, invert=False)        
        p.text(" Powered by John Alexander Garcia")
        p.set(align='center', bold=False, invert=False)
        
        p.text("\n\n\n")
        p.cut()
        print(f"🖨️ [IMP] Ticket EXTRA enviado.")
    except Exception as e:
        print(f"❌ [IMP] Error impresora: {e}")
    finally:
        if p: p.close()

def imprimir_ticket_duplicado(nombre, user_id):
    p = None
    try:
        p = Network(IP_IMPRESORA)
        p.set(align='center')
        
        p.text("\n")
        p.set(align='center', bold=True)
        p.text("=== ALERTA DE SISTEMA ===\n")
        p.text("=== TICKET NO VALIDO ===\n")
        p.text("--------------------------------\n")
        
        fecha = datetime.now().strftime('%d/%m/%Y %H:%M')
        p.set(align='left', bold=False)
        p.text(f"FECHA: {fecha}\n")
                    
        p.text("--------------------------------\n")
        p.set(align='center', bold=True, invert=True)
        p.text(" ACCESO DUPLICADO \n") 
        p.set(align='center', bold=False, invert=False)
        
        p.text("\n")
        p.set(align='center', bold=True)
        p.text("CASO PERDIDA CONTACTAR\n")
        p.text("CON RRHH\n\n")
        p.text(" Powered by John Alexander Garcia")
        p.set(align='center', bold=False, invert=False)
        
        p.text("\n\n") 
        p.cut()
        print(f"🖨️ [IMP] Ticket DUPLICADO enviado.")
    except Exception as e:
        print(f"❌ [IMP] Error impresora: {e}")
    finally:
        if p: p.close()


# ==========================================
#  MAIN
# ==========================================

def main():
    print("--- SISTEMA AUDITOR DE COMEDOR 24/7 ---")
    
    global memoria_papel
    memoria_papel = {}
    ultimo_dia = datetime.now().day

    # 1. Verificación inicial de impresora
    print("🔍 Verificando estado inicial...")
    verificar_estado_impresora()

    # 2. Hilo de monitoreo (segundo plano)
    hilo = threading.Thread(target=tarea_monitoreo_periodico, daemon=True)
    hilo.start()

    while True:
        zk = ZK(IP_BIOMETRICO, port=PUERTO_ZK, timeout=60)
        conn = None
        try:
            print(f"\n🔄 Conectando a Biométrico {IP_BIOMETRICO}...")
            conn = zk.connect()
            print(".: CONECTADO :.")
            
            # --- SINCRONIZACIÓN INICIAL ---
            # Al conectar, descargamos y guardamos en BD lo que falte
            user_map_zk = sincronizar_usuarios_db(conn)
            
            print(".: ESPERANDO HUELLAS :.")
            
            for event in conn.live_capture():
                if event is None: continue
                if event.user_id is None: continue

                # A. Verificar Impresora
                estado_imp = verificar_estado_impresora()
                if estado_imp == "OFFLINE":
                    print("⚠️ IMPRESORA APAGADA/OFFLINE - Se registrará pero NO imprimirá.")
                elif estado_imp == "SIN_PAPEL":
                    print("⛔ SIN PAPEL - Se registrará pero NO imprimirá.")
                elif estado_imp == "TAPA_ABIERTA":
                    print("⚠️ TAPA ABIERTA - Cierre para imprimir.")

                # B. Reset Diario
                hoy = datetime.now()
                if hoy.day != ultimo_dia:
                    memoria_papel = {}
                    ultimo_dia = hoy.day
                    print("🧹 Nuevo día: Memoria reiniciada.")

                # C. Obtener Usuario
                user_id_str = str(event.user_id)
                nombre_zk = user_map_zk.get(user_id_str, "Desconocido")
                
                # --- AUTO-REFRESCO INTELIGENTE ---
                # Si a pesar de la sync inicial sale desconocido (ej: lo registraron hace 1 minuto)
                if nombre_zk == "Desconocido":
                    print(f"⚠️ ID {user_id_str} desconocido. Ejecutando resincronización...")
                    # Volvemos a llamar a la función de sync
                    user_map_zk = sincronizar_usuarios_db(conn)
                    # Buscamos de nuevo
                    nombre_zk = user_map_zk.get(user_id_str, "Desconocido")
                
                # Buscamos nombre "bonito" en BD (por si lo editaste manualmente en MySQL)
                nombre_completo = obtener_nombre_real(event.user_id, nombre_zk)
                print(f"\n--> Asistencia: {nombre_completo}")
                
                # D. Registrar e Imprimir
                resultado = registrar_evento(event.user_id, nombre_completo)

                # Si impresora falla, no imprimimos
                if estado_imp in ["OFFLINE", "SIN_PAPEL", "TAPA_ABIERTA", "ERROR_MECANICO"]:
                    print(f"❌ OMITIENDO IMPRESIÓN por estado: {estado_imp}")
                else:
                    if resultado == "TICKET ALMUERZO":
                        imprimir_ticket_valido(nombre_completo, event.user_id)
                    elif resultado == "TICKET EXTRA":
                        print(">>> IMPRIMIENDO TICKET EXTRA (VIP)...")
                        imprimir_ticket_extra(nombre_completo)
                    elif resultado == "DUPLICADO":
                        print(f"🚫 DUPLICADO: {nombre_completo} (Guardado en BD, sin ticket)")

                print("--- Esperando siguiente ---")
                sys.stdout.flush() 

        except KeyboardInterrupt:
            print("\n Apagando...")
            break 
        except Exception as e:
            print(f"\n⚠️ Error conexión Biométrico: {e}")
            time.sleep(5)
        finally:
            if conn:
                try: conn.disconnect()
                except: pass

if __name__ == "__main__":
    main()