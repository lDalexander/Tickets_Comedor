
import socket
import os
import logging
import textwrap
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from escpos.printer import Network
from dotenv import load_dotenv

load_dotenv()

class TicketPrinter:
    """
    Clase encargada de gestionar la impresora de tickets ESC/POS.
    Maneja la conexión, verificación de estado (papel, errores) y
    la generación de los diferentes tipos de tickets.
    """

    def __init__(self):
        # --- CONFIGURACIÓN DE DISPOSITIVOS ---
        self.IP_IMPRESORA = os.getenv('IP_IMPRESORA', '150.36.200.9')
        self.ARCHIVO_LOGO = "logo_grande.png" # Se asume en root del script
        
        # Estado interno
        self.estado_anterior = "DESCONOCIDO"

        # --- CONFIGURACIÓN DE CORREO (SMTP) ---
        self.SMTP_SERVER   = os.getenv('SMTP_SERVER', 'smtp-mail.outlook.com')
        self.SMTP_PORT     = int(os.getenv('SMTP_PORT', 587))
        self.SMTP_USER     = os.getenv('SMTP_USER', 'no-reply@detcuador.com')
        self.SMTP_PASS     = os.getenv('SMTP_PASS')
        self.EMAIL_DESTINO = os.getenv('EMAIL_DESTINO', 'agarcia@detcuador.com')

        # --- CONCURRENCY ---
        self.email_executor = ThreadPoolExecutor(max_workers=2)

    def _send_email_sync(self, asunto: str, mensaje: str) -> None:
        """Síncrono: Envía el correo."""
        try:
            msg = MIMEMultipart()
            msg['From'] = self.SMTP_USER
            msg['To'] = self.EMAIL_DESTINO
            msg['Subject'] = f"🤖 MONITOR IMP. DE TICKETS: {asunto}"
            msg.attach(MIMEText(mensaje, 'plain'))

            with smtplib.SMTP(self.SMTP_SERVER, self.SMTP_PORT) as server:
                server.starttls()
                server.login(self.SMTP_USER, self.SMTP_PASS)
                server.sendmail(self.SMTP_USER, self.EMAIL_DESTINO, msg.as_string())
            
            logging.info(f"📧 [EMAIL] Enviado: {asunto}")

        except Exception as e:
            logging.error(f"❌ [EMAIL] Error enviando correo: {e}")

    def enviar_correo(self, asunto: str, mensaje: str) -> None:
        """Asíncrono: Encola el envío de correo en un hilo separado."""
        self.email_executor.submit(self._send_email_sync, asunto, mensaje)

    def verificar_estado(self):
        """
        Consulta el estado físico de la impresora (papel, tapa, errores).
        Retorna el estado actual (OK, SIN_PAPEL, OFFLINE, etc).
        Envía alertas por correo si el estado cambia a error.
        """
        nuevo_estado = "OK"
        mensaje_error = ""
        asunto_error = ""
        
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(5)
            s.connect((self.IP_IMPRESORA, 9100))
            
            # Comandos ESC/POS para consultar estatus
            s.send(b'\x10\x04\x02') # DLE EOT 2 (Status impresora)
            resp_error = s.recv(1)
            s.send(b'\x10\x04\x04') # DLE EOT 4 (Status papel)
            resp_papel = s.recv(1)
            s.close()
            
            if not resp_error or not resp_papel:
                raise Exception("Respuesta vacía")

            byte_error = ord(resp_error)
            byte_papel = ord(resp_papel)

            tapa_abierta  = (byte_error & 0x04) > 0
            error_general = (byte_error & 0x40) > 0
            sin_papel     = (byte_papel & 0x60) > 0
            poco_papel    = (byte_papel & 0x0C) > 0

            if tapa_abierta:
                nuevo_estado = "TAPA_ABIERTA"
                asunto_error = "⚠️ ALERTA: TAPA ABIERTA"
                mensaje_error = "La tapa está abierta."
            elif sin_papel:
                nuevo_estado = "SIN_PAPEL"
                asunto_error = "⛔ ALERTA: SIN PAPEL"
                mensaje_error = "La impresora no tiene papel."
            elif error_general:
                nuevo_estado = "ERROR_MECANICO"
                asunto_error = "❌ ALERTA: FALLA MECANICA"
                mensaje_error = "Posible atasco."
            elif poco_papel:
                nuevo_estado = "POCO_PAPEL"
            else:
                nuevo_estado = "OK"

        except Exception as e:
            nuevo_estado = "OFFLINE"
            asunto_error = "🔌 ALERTA: IMPRESORA APAGADA/OFFLINE"
            mensaje_error = "No se detecta conexión."
            if self.estado_anterior != "OFFLINE":
                 logging.error(f"Error conexión impresora: {e}")

        # Notificación de cambios de estado
        if nuevo_estado != self.estado_anterior:
            if nuevo_estado not in ["OK", "POCO_PAPEL"]:
                msg = f"🚨 CAMBIO A ESTADO CRÍTICO: {nuevo_estado}"
                print(msg)
                logging.warning(msg)
                self.enviar_correo(asunto_error, mensaje_error)
            
            elif nuevo_estado == "OK" and self.estado_anterior not in ["OK", "DESCONOCIDO", "POCO_PAPEL"]:
                msg = "✅ IMPRESORA RECUPERADA."
                print(msg)
                logging.info(msg)
                self.enviar_correo("🟢 IMPRESORA ONLINE Y LISTA", "Sistema operativo.")

            self.estado_anterior = nuevo_estado
        
        return nuevo_estado

    def _conectar(self):
        """Helper privado para iniciar conexión ESC/POS."""
        p = Network(self.IP_IMPRESORA)
        return p

    def _imprimir_header(self, p, ticket_number):
        """Imprime la cabecera común de los tickets."""
        p.set(align='center')
        try: 
            if os.path.exists(self.ARCHIVO_LOGO):
                p.image(self.ARCHIVO_LOGO)
        except: pass 

        p.set(align='center', bold=True, double_height=True)
        p.text("DETCUADOR S.A.\n")
        p.set(align='center', bold=False, double_height=False)
        p.text("CONTROL DE COMEDOR\n")
        p.set(align='center', bold=True)
        p.text(f"N: {ticket_number}\n")
        p.set(align='center', bold=False)
        p.text("--------------------------------\n")

    def _imprimir_footer(self, p):
        """Imprime el pie de página común."""
        p.text("--------------------------------\n")
        p.set(align='center', bold=True, invert=True)
        p.text(" VALIDO POR 1 ALMUERZO \n\n")
        p.set(align='center', bold=False, invert=False)
        p.text("Desarrollado por: John Garcia\n")
        p.text("Version: 3.2.1\n")
        p.text("\n\n\n")
        p.cut()

    def imprimir_ticket_valido(self, nombre, user_id, ticket_number, es_dieta=False, es_especial=False, sin_sopa=False, sin_arroz=False):
        """Imprime un ticket válido de Almuerzo/Dieta/Gerencia."""
        p = None
        try:
            p = self._conectar()
            self._imprimir_header(p, ticket_number)
            
            # Fecha local
            fecha = datetime.now().strftime('%d/%m/%Y %H:%M')
            p.set(align='left')
            p.text(f"FECHA: {fecha}\n")
            p.text("COLABORADOR:\n")
            
            lineas_nombre = textwrap.wrap(nombre, width=24) 
            for linea in lineas_nombre:
                p.set(align='left', bold=True)
                p.text(f"{linea}\n")

            p.text("\n")
            
            # Tipo y Restricciones
            if es_especial:
                p.set(align='center', bold=True, invert=True) 
                p.text("  >>> TIPO: GERENCIA <<<  \n")
            elif es_dieta:
                p.set(align='center', bold=True, invert=True) 
                p.text("  >>> MENU: DIETA <<<  \n")
            else:
                p.set(align='center', bold=True, invert=False) 
                p.text("  TIPO: NORMAL  \n")
            
            p.set(align='center', bold=False, invert=False)
            
            if sin_sopa or sin_arroz:
                p.text("\n")
                p.set(align='center', bold=False, double_height=True)
                if sin_sopa: p.text("SIN SOPA\n")
                if sin_arroz: p.text("SIN ARROZ\n")
                p.set(align='center', bold=False, double_height=False)
                
            self._imprimir_footer(p)
            print(f"🖨️ [IMP] Ticket enviado para {nombre}.")

        except Exception as e:
            logging.error(f"Error impresora: {e}")
        finally:
            if p: p.close()

    def imprimir_ticket_extra(self, nombre_vip, ticket_number):
        """Imprime un ticket EXTRA para VIPs que ya almorzaron."""
        p = None
        try:
            p = self._conectar()
            p.set(align='center')
            try: 
                if os.path.exists(self.ARCHIVO_LOGO): p.image(self.ARCHIVO_LOGO) 
            except: pass 

            p.set(align='center', bold=True)
            p.text("DETCUADOR S.A.\n")
            p.text("TICKET EXTRA\n")
            p.set(align='center', bold=True)
            p.text(f"N: {ticket_number}\n")
            p.set(align='center', bold=False)
            p.text("--------------------------------\n")
            
            fecha = datetime.now().strftime('%d/%m/%Y %H:%M')
            p.set(align='left')
            p.text(f"AUTORIZA: {nombre_vip}\n")
            p.text(f"FECHA:    {fecha}\n")
            
            p.text("\nPARA EL COLABORADOR:\n\n")
            p.set(align='center', bold=True, double_height=True)
            p.text("______________________\n")
            p.set(align='center', bold=False, double_height=False)
            p.text("(Escribir Nombre)\n")
            
            self._imprimir_footer(p)
            print(f"🖨️ [IMP] Ticket EXTRA enviado.")
        except Exception as e:
            logging.error(f"Error impresión ticket extra: {e}")
        finally:
            if p: p.close()

    def imprimir_ticket_mantenimiento(self):
        p = None
        try:
            p = self._conectar()
            p.hw("INIT") 
            p.set(align='center')
            p.text("\n\n")
            p.set(align='center', bold=True, double_height=True, double_width=True, invert=True)
            p.text(" ALERTA \n")
            p.set(align='center', bold=True, invert=False, double_height=True, double_width=False)
            p.text("\nTENEMOS INCONVENIENTES\n")
            p.set(align='center', bold=True, invert=False, double_height=False)
            p.text("REALIZANDO MANTENIMIENTO\n")
            p.text("AUTOMATICO...\n\n")
            p.set(align='center', bold=True, double_height=True)
            p.text("ESPERE 5 MINUTOS Y\nVUELVA A INTENTAR\n")
            p.text("\n\n\n")
            p.cut()
        except: pass
        finally:
            if p: p.close()

    def reimprimir_ticket(self, name, date_str, time_str, ticket_type, ticket_number):
        """Función específica para la reimpresión desde Panel Admin."""
        # Combina lógica de valido y extra según el tipo
        p = None
        try:
            print(f"🖨️  Reimprimiendo ticket para {name}...")
            p = self._conectar()
            p.set(align='center')
            try: 
                if os.path.exists(self.ARCHIVO_LOGO): p.image(self.ARCHIVO_LOGO) 
            except: pass 

            p.set(align='center', bold=True, double_height=True)
            p.text("DETCUADOR S.A.\n")
            p.set(align='center', bold=False, double_height=False)
            p.text("CONTROL DE COMEDOR\n")
            p.set(align='center', bold=True)
            p.text(f"N: {ticket_number}\n")
            p.set(align='center', bold=False)
            p.text("--------------------------------\n")
            
            timestamp = f"{date_str} {time_str}"
            p.set(align='left')

            if ticket_type == "TICKET EXTRA":
                 p.text(f"AUTORIZA: {name}\n")
                 p.text(f"FECHA:    {timestamp}\n")
                 p.text("\nPARA EL COLABORADOR:\n\n")
                 p.set(align='center', bold=True, double_height=True)
                 p.text("______________________\n")
                 p.set(align='center', bold=False, double_height=False)
                 p.text("(Escribir Nombre)\n")
            else:
                p.text(f"FECHA: {timestamp}\n")
                p.text("COLABORADOR:\n")
                lineas_nombre = textwrap.wrap(name, width=24) 
                for linea in lineas_nombre:
                    p.set(align='left', bold=True)
                    p.text(f"{linea}\n")
                p.text("\n")
                
                if ticket_type == "TICKET GERENCIA":
                    p.set(align='center', bold=True, invert=True) 
                    p.text("  >>> TIPO: GERENCIA <<<  \n")
                elif ticket_type == "TICKET DIETA":
                    p.set(align='center', bold=True, invert=True) 
                    p.text("  >>> MENU: DIETA <<<  \n")
                else: 
                    p.set(align='center', bold=True, invert=False) 
                    p.text("  TIPO: NORMAL  \n")
            
            self._imprimir_footer(p)
            print("✅ Ticket reimpreso.")

        except Exception as e:
            logging.error(f"Error reimprimiendo: {e}")
        finally:
            if p: p.close()

    def imprimir_ticket_visitante(self, nombre_visitante, nombre_autoriza, ticket_number):
        """Imprime un ticket manual para visita/proveedor."""
        p = None
        try:
            p = self._conectar()
            p.set(align='center')
            try: 
                if os.path.exists(self.ARCHIVO_LOGO): p.image(self.ARCHIVO_LOGO) 
            except: pass 

            p.set(align='center', bold=True, double_height=True)
            p.text("DETCUADOR S.A.\n")
            p.set(align='center', bold=False, double_height=False)
            p.text("CONTROL DE COMEDOR\n")
            p.set(align='center', bold=True)
            p.text("TICKET VISITA\n")
            p.text(f"N: {ticket_number}\n")
            p.set(align='center', bold=False)
            p.text("--------------------------------\n")
            
            fecha = datetime.now().strftime('%d/%m/%Y %H:%M')
            p.set(align='left')
            p.text(f"VISITANTE: {nombre_visitante}\n")
            p.text(f"FECHA:     {fecha}\n")
            p.text("\n")
            p.set(align='left', bold=True, invert=True)
            p.text(f" IMPRESO POR: {nombre_autoriza} \n")
            p.set(align='left', bold=False, invert=False)
            
            p.text("\n\n")
            # Firma removida a petición del usuario
            
            self._imprimir_footer(p)
            print(f"🖨️ [IMP] Ticket VISITA #{ticket_number} enviado.")

        except Exception as e:
            logging.error(f"Error impresión ticket visita: {e}")
        finally:
            if p: p.close()
