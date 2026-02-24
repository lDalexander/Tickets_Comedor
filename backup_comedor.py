#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════╗
║            BACKUP COMEDOR - RESPALDO QUINCENAL               ║
║  Respaldo completo + Envío por correo + Purga de BD          ║
║  Se ejecuta los días 1 y 15 de cada mes a las 15:00          ║
╚══════════════════════════════════════════════════════════════╝

FLUJO:
  0. Verificar si hay registros antiguos (>15 días). Si no hay, NO ejecutar.
  1. mysqldump → /tmp/comedor_backup_FECHA.sql
  2. tar -czf  → /tmp/comedor_backup_FECHA.tar.gz (excluye node_modules y venv)
  3. Enviar .tar.gz por email SMTP (Outlook)
  4. SOLO si el email fue exitoso → DELETE registros > 15 días
  5. Limpiar archivos temporales de /tmp

USO MANUAL:
  cd /home/john/comedor/Tickets_Comedor
  python3 backup_comedor.py

CRON (días 1 y 15 de cada mes a las 15:00 hora Ecuador):
  0 15 1,15 * * cd /home/john/comedor/Tickets_Comedor && /usr/bin/python3 backup_comedor.py >> /tmp/backup_comedor.log 2>&1
"""

import os
import sys
import subprocess
import smtplib
import logging
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders

# ============================================================
# CONFIGURACIÓN
# ============================================================

# Base de Datos
DB_HOST     = "localhost"
DB_USER     = "admin"
DB_PASSWORD = "3012"
DB_NAME     = "control_comedor"
DB_PORT     = "3306"

# SMTP (Outlook)
SMTP_SERVER = "smtp-mail.outlook.com"
SMTP_PORT   = 587
SMTP_USER   = "no-reply@detcuador.com"
SMTP_PASS   = "D3tcuador2025@"
EMAIL_DEST = ["agarcia@detcuador.com", "ksuarez@detcuador.com"]

# Archivos temporales
FECHA_STR   = datetime.now().strftime("%Y%m%d_%H%M")
SQL_FILE    = f"/tmp/comedor_backup_{FECHA_STR}.sql"
TAR_FILE    = f"/tmp/comedor_backup_{FECHA_STR}.tar.gz"

# Retención: conservar los últimos N días en la BD
DIAS_RETENCION = 15

# Tamaño máximo del adjunto (20 MB en bytes)
MAX_ATTACH_BYTES = 20 * 1024 * 1024

# ============================================================
# LOGGING
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger("backup_comedor")


# ============================================================
# PASO 0: VERIFICAR SI HAY DATOS PARA RESPALDAR
# ============================================================
def paso0_verificar_datos():
    """
    Verifica si existen registros con más de 15 días de antigüedad.
    Si NO hay datos antiguos, no tiene sentido ejecutar el backup ni la purga.
    Retorna True si hay datos para procesar, False si no.
    """
    log.info("═" * 50)
    log.info("PASO 0: Verificando si hay registros antiguos para respaldar...")

    try:
        import mysql.connector

        conn = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            port=int(DB_PORT)
        )
        cursor = conn.cursor()

        cursor.execute(
            "SELECT COUNT(*) FROM registros WHERE fecha < DATE_SUB(CURDATE(), INTERVAL %s DAY)",
            (DIAS_RETENCION,)
        )
        cantidad = cursor.fetchone()[0]

        cursor.close()
        conn.close()

        if cantidad == 0:
            log.info("ℹ️ No hay registros con más de %d días. No es necesario ejecutar el backup.", DIAS_RETENCION)
            return False

        log.info(f"✅ Se encontraron {cantidad} registros antiguos (>{DIAS_RETENCION} días). Procediendo con backup...")
        return True

    except ImportError:
        log.error("❌ mysql-connector-python no está instalado.")
        return False
    except Exception as e:
        log.error(f"❌ Error al verificar datos: {e}")
        return False


# ============================================================
# PASO 1: RESPALDO DE BASE DE DATOS (mysqldump)
# ============================================================
def paso1_mysqldump():
    """Exporta la BD control_comedor completa a un archivo .sql"""
    log.info("═" * 50)
    log.info("PASO 1: Exportando base de datos con mysqldump...")

    cmd = [
        "mysqldump",
        f"--host={DB_HOST}",
        f"--port={DB_PORT}",
        f"--user={DB_USER}",
        f"--password={DB_PASSWORD}",
        "--single-transaction",   # No bloquear tablas (InnoDB)
        "--routines",             # Incluir procedimientos almacenados
        "--triggers",             # Incluir triggers
        "--events",               # Incluir eventos
        "--result-file", SQL_FILE,
        DB_NAME,
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            log.error(f"mysqldump falló (código {result.returncode}): {result.stderr.strip()}")
            return False

        size_mb = os.path.getsize(SQL_FILE) / (1024 * 1024)
        log.info(f"✅ Dump exitoso: {SQL_FILE} ({size_mb:.2f} MB)")
        return True

    except FileNotFoundError:
        log.error("❌ mysqldump no encontrado. ¿Está instalado mysql-client?")
        return False
    except subprocess.TimeoutExpired:
        log.error("❌ mysqldump excedió el tiempo límite de 5 minutos.")
        return False
    except Exception as e:
        log.error(f"❌ Error inesperado en mysqldump: {e}")
        return False


# ============================================================
# PASO 2: COMPRESIÓN CON TAR (excluyendo node_modules y venv)
# ============================================================
def paso2_comprimir():
    """Crea un .tar.gz con el .sql y el proyecto, excluyendo carpetas pesadas."""
    log.info("═" * 50)
    log.info("PASO 2: Comprimiendo respaldo...")

    cmd = [
        "tar", "-czf", TAR_FILE,
        "--exclude=./frontend/node_modules",
        "--exclude=./backend/node_modules",
        "--exclude=./venv",
        "--exclude=./backend/python_core/venv",
        "--exclude=./.git",
        "--exclude=./Backup_Version_Actual",
        "--exclude=*.tar.gz",
        "--exclude=*.log",
        "-C", os.path.dirname(SQL_FILE), os.path.basename(SQL_FILE),  # Incluir el .sql
        "-C", os.getcwd(), ".",                                        # Incluir el proyecto
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            log.error(f"tar falló (código {result.returncode}): {result.stderr.strip()}")
            return False

        size_mb = os.path.getsize(TAR_FILE) / (1024 * 1024)
        log.info(f"✅ Compresión exitosa: {TAR_FILE} ({size_mb:.2f} MB)")

        if os.path.getsize(TAR_FILE) > MAX_ATTACH_BYTES:
            log.warning(f"⚠️ ADVERTENCIA: El archivo pesa {size_mb:.2f} MB, excede el límite de 20 MB para correo.")
            log.warning("   El correo podría ser rechazado por el servidor SMTP.")

        return True

    except subprocess.TimeoutExpired:
        log.error("❌ tar excedió el tiempo límite de 10 minutos.")
        return False
    except Exception as e:
        log.error(f"❌ Error inesperado en tar: {e}")
        return False


# ============================================================
# PASO 3: ENVÍO POR CORREO ELECTRÓNICO (SMTP)
# ============================================================
def paso3_enviar_email():
    """Envía el .tar.gz como adjunto por SMTP. Retorna True SOLO si el servidor aceptó el mensaje."""
    log.info("═" * 50)
    log.info("PASO 3: Enviando respaldo por correo electrónico...")

    try:
        # Verificar que el archivo existe y tiene contenido
        if not os.path.exists(TAR_FILE) or os.path.getsize(TAR_FILE) == 0:
            log.error("❌ El archivo .tar.gz no existe o está vacío.")
            return False

        size_mb = os.path.getsize(TAR_FILE) / (1024 * 1024)

        # Construir mensaje
        msg = MIMEMultipart()
        msg["From"]    = SMTP_USER
        msg["To"]      = ", ".join(EMAIL_DEST)
        msg["Subject"] = f"🗄️ Backup Comedor - {datetime.now().strftime('%d/%m/%Y %H:%M')}"

        body = (
            f"Respaldo quincenal automático del Sistema de Comedor.\n\n"
            f"📅 Fecha: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}\n"
            f"📦 Archivo: {os.path.basename(TAR_FILE)}\n"
            f"📏 Tamaño: {size_mb:.2f} MB\n"
            f"🗃️ Contenido: Base de datos completa + código fuente\n\n"
            f"⚠️ IMPORTANTE: Si este correo fue recibido correctamente, los registros\n"
            f"   de la tabla 'registros' con más de {DIAS_RETENCION} días de antigüedad\n"
            f"   han sido purgados de la base de datos.\n\n"
            f"--- Generado automáticamente por backup_comedor.py ---"
        )
        msg.attach(MIMEText(body, "plain"))

        # Adjuntar archivo
        log.info(f"   Adjuntando {os.path.basename(TAR_FILE)} ({size_mb:.2f} MB)...")
        with open(TAR_FILE, "rb") as f:
            part = MIMEBase("application", "gzip")
            part.set_payload(f.read())
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", f"attachment; filename={os.path.basename(TAR_FILE)}")
            msg.attach(part)

        # Enviar
        log.info(f"   Conectando a {SMTP_SERVER}:{SMTP_PORT}...")
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=120)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)

        # sendmail retorna un diccionario de destinatarios fallidos.
        # Si está vacío, TODOS los destinatarios recibieron el mensaje.
        rechazados = server.sendmail(SMTP_USER, EMAIL_DEST, msg.as_string())
        server.quit()

        if rechazados:
            log.error(f"❌ El servidor rechazó el envío a: {rechazados}")
            return False

        log.info(f"✅ Correo enviado exitosamente a {', '.join(EMAIL_DEST)}")
        return True

    except smtplib.SMTPAuthenticationError:
        log.error("❌ Error de autenticación SMTP. Verifica usuario/contraseña.")
        return False
    except smtplib.SMTPRecipientsRefused:
        log.error(f"❌ Destinatario(s) rechazado(s) por el servidor.")
        return False
    except smtplib.SMTPDataError as e:
        log.error(f"❌ Servidor SMTP rechazó los datos (¿archivo muy grande?): {e}")
        return False
    except smtplib.SMTPException as e:
        log.error(f"❌ Error SMTP general: {e}")
        return False
    except ConnectionRefusedError:
        log.error(f"❌ No se pudo conectar a {SMTP_SERVER}:{SMTP_PORT}. ¿Hay conexión a internet?")
        return False
    except TimeoutError:
        log.error("❌ Timeout al conectar al servidor SMTP.")
        return False
    except Exception as e:
        log.error(f"❌ Error inesperado al enviar email: {e}")
        return False


# ============================================================
# PASO 4: PURGA DE REGISTROS ANTIGUOS (SOLO SI email OK)
# ============================================================
def paso4_purgar_registros():
    """
    DELICADO: Borra registros con más de 15 días de antigüedad.
    También purga menu_diario con más de 7 días.
    SOLO se ejecuta si el email fue enviado exitosamente.
    """
    log.info("═" * 50)
    log.info(f"PASO 4: Purgando tablas antiguas...")

    try:
        import mysql.connector

        conn = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            port=int(DB_PORT)
        )
        cursor = conn.cursor()

        # --- 4a: Purga de REGISTROS (>15 días) ---
        cursor.execute(
            "SELECT COUNT(*) FROM registros WHERE fecha < DATE_SUB(CURDATE(), INTERVAL %s DAY)",
            (DIAS_RETENCION,)
        )
        cantidad_reg = cursor.fetchone()[0]

        if cantidad_reg > 0:
            log.info(f"   📋 registros: Eliminando {cantidad_reg} registros (>{DIAS_RETENCION} días)...")
            cursor.execute(
                "DELETE FROM registros WHERE fecha < DATE_SUB(CURDATE(), INTERVAL %s DAY)",
                (DIAS_RETENCION,)
            )
            conn.commit()
            log.info(f"   ✅ registros: {cursor.rowcount} eliminados.")
        else:
            log.info(f"   ✅ registros: Sin datos antiguos para purgar.")

        # --- 4b: Purga de MENU_DIARIO (>7 días) ---
        cursor.execute(
            "SELECT COUNT(*) FROM menu_diario WHERE fecha < DATE_SUB(CURDATE(), INTERVAL 7 DAY)"
        )
        cantidad_menu = cursor.fetchone()[0]

        if cantidad_menu > 0:
            log.info(f"   🍽️ menu_diario: Eliminando {cantidad_menu} registros (>7 días)...")
            cursor.execute(
                "DELETE FROM menu_diario WHERE fecha < DATE_SUB(CURDATE(), INTERVAL 7 DAY)"
            )
            conn.commit()
            log.info(f"   ✅ menu_diario: {cursor.rowcount} eliminados.")
        else:
            log.info(f"   ✅ menu_diario: Sin datos antiguos para purgar.")

        cursor.close()
        conn.close()
        log.info("✅ Purga de tablas completada.")
        return True

    except ImportError:
        log.error("❌ mysql-connector-python no está instalado.")
        return False
    except mysql.connector.Error as e:
        log.error(f"❌ Error de MySQL al purgar: {e}")
        return False
    except Exception as e:
        log.error(f"❌ Error inesperado al purgar: {e}")
        return False


# ============================================================
# PASO 5: LIMPIEZA DE ARCHIVOS TEMPORALES
# ============================================================
def paso5_limpiar_temporales():
    """Elimina los archivos .sql y .tar.gz de /tmp."""
    log.info("═" * 50)
    log.info("PASO 5: Limpiando archivos temporales...")

    for archivo in [SQL_FILE, TAR_FILE]:
        try:
            if os.path.exists(archivo):
                os.remove(archivo)
                log.info(f"   🗑️ Eliminado: {archivo}")
        except OSError as e:
            log.warning(f"   ⚠️ No se pudo eliminar {archivo}: {e}")

    log.info("✅ Limpieza completada.")


# ============================================================
# MAIN - ORQUESTADOR
# ============================================================
def main():
    inicio = datetime.now()
    log.info("╔══════════════════════════════════════════════════════════╗")
    log.info("║       BACKUP COMEDOR - RESPALDO QUINCENAL              ║")
    log.info(f"║       {inicio.strftime('%d/%m/%Y %H:%M:%S')}                               ║")
    log.info("╚══════════════════════════════════════════════════════════╝")
    log.info(f"Directorio de trabajo: {os.getcwd()}")
    log.info("")

    # PASO 0: Verificar si hay datos para respaldar
    if not paso0_verificar_datos():
        log.info("")
        log.info("ℹ️ Enviando notificación de que no hay datos para respaldar...")
        try:
            msg = MIMEMultipart()
            msg["From"]    = SMTP_USER
            msg["To"]      = ", ".join(EMAIL_DEST)
            msg["Subject"] = f"ℹ️ Backup Comedor - Sin registros antiguos ({datetime.now().strftime('%d/%m/%Y')})"
            body = (
                f"El respaldo quincenal programado se ejecutó el {datetime.now().strftime('%d/%m/%Y a las %H:%M:%S')},\n"
                f"pero NO se realizó respaldo ni purga porque no se encontraron registros\n"
                f"con más de {DIAS_RETENCION} días de antigüedad en la tabla 'registros'.\n\n"
                f"Esto es normal si el último respaldo ya limpió los datos antiguos.\n\n"
                f"NO RESPONDER - GENERADO AUTOMÁTICAMENTE\n"
                f"NO TE OLVIDES DE PREGUNTAR AL ADMINISTRADOR DEL SISTEMA COMO FUNCIONA"
            )
            msg.attach(MIMEText(body, "plain"))
            server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=60)
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, EMAIL_DEST, msg.as_string())
            server.quit()
            log.info(f"✅ Notificación enviada a {', '.join(EMAIL_DEST)}")
        except Exception as e:
            log.warning(f"⚠️ No se pudo enviar la notificación: {e}")

        log.info("")
        log.info("╔══════════════════════════════════════════════════════════╗")
        log.info("║   ℹ️ BACKUP NO NECESARIO - Sin registros antiguos       ║")
        log.info("╚══════════════════════════════════════════════════════════╝")
        sys.exit(0)

    # PASO 1: mysqldump
    if not paso1_mysqldump():
        log.error("🛑 ABORTANDO: No se pudo generar el dump de la BD.")
        paso5_limpiar_temporales()
        sys.exit(1)

    # PASO 2: Comprimir
    if not paso2_comprimir():
        log.error("🛑 ABORTANDO: No se pudo comprimir el respaldo.")
        paso5_limpiar_temporales()
        sys.exit(1)

    # PASO 3: Enviar email
    email_enviado = paso3_enviar_email()

    if not email_enviado:
        log.error("🛑 EMAIL FALLÓ: NO se purgará la base de datos.")
        log.error("   Los archivos temporales se conservan en /tmp para revisión manual.")
        log.error(f"   SQL: {SQL_FILE}")
        log.error(f"   TAR: {TAR_FILE}")
        sys.exit(1)

    # PASO 4: Purgar BD (SOLO si email fue exitoso)
    log.info("")
    log.info("📧 Email confirmado como enviado → Procediendo con purga segura...")
    paso4_purgar_registros()

    # PASO 5: Limpiar temporales
    paso5_limpiar_temporales()

    # Resumen final
    duracion = (datetime.now() - inicio).total_seconds()
    log.info("")
    log.info("╔══════════════════════════════════════════════════════════╗")
    log.info("║         ✅ BACKUP COMPLETADO EXITOSAMENTE              ║")
    log.info(f"║         Duración: {duracion:.1f} segundos                          ║")
    log.info("╚══════════════════════════════════════════════════════════╝")


if __name__ == "__main__":
    main()
