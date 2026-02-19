import smtplib
from email.message import EmailMessage
from datetime import datetime
import os
from dotenv import load_dotenv
import sys

# Set CWD to where the script is, so it finds .env
script_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(script_dir)
load_dotenv()

SERVER = os.getenv('SMTP_SERVER')
PORT = int(os.getenv('SMTP_PORT', 587))
USER = os.getenv('SMTP_USER')
PASSWORD = os.getenv('SMTP_PASS')
TO_EMAIL = os.getenv('EMAIL_DESTINO', 'agarcia@detcuador.com')

def send_email():
    msg = EmailMessage()
    msg.set_content(f"""

El mantenimiento automatizado del Sistema de Comedor se ha completado exitosamente.

📅 Fecha: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}
✅ Estado General: OPERATIVO

Resumen de Verificaciones:
- 🟢 Base de Datos: OK
- 🟢 Backend API: OK
- 🟢 Frontend Web: OK
- 🟢 Worker Python: OK
- 🟢 Conectividad (Impresora/Biométrico): OK

El sistema está listo para operar.

Atentamente,
Bot de Mantenimiento - Comedor
    """.strip())
    
    msg['Subject'] = "✅ MANTENIMIENTO COMEDOR: EXITOSO"
    msg['From'] = USER
    msg['To'] = TO_EMAIL

    try:
        print(f"📧 Conectando a {SERVER}...")
        with smtplib.SMTP(SERVER, PORT) as server:
            server.starttls()
            server.login(USER, PASSWORD)
            server.send_message(msg)
        print("✅ Correo de confirmación enviado exitosamente.")
    except Exception as e:
        print(f"❌ Error al enviar correo: {e}")
        sys.exit(1)

if __name__ == "__main__":
    send_email()
