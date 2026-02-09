
import os
import textwrap
from datetime import datetime
from dotenv import load_dotenv
from escpos.printer import Network

# Load environment variables
load_dotenv()

# Configuration
IP_IMPRESORA = os.getenv('IP_IMPRESORA', '150.36.200.9')
ARCHIVO_LOGO = "logo_grande.png"

def print_normal_ticket(user_id, name):
    print(f"🖨️  Imprimiendo Ticket NORMAL para {name} (ID: {user_id})...")
    p = None
    try:
        p = Network(IP_IMPRESORA)
        p.set(align='center')
        
        # Intentar imprimir logo si existe
        if os.path.exists(ARCHIVO_LOGO):
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
        
        lineas_nombre = textwrap.wrap(name, width=24) 
        for linea in lineas_nombre:
            p.set(align='left', bold=True)
            p.text(f"{linea}\n")

        p.text("\n")
        
        # TIPO DE MENU
        p.set(align='center', bold=True, invert=False) 
        p.text("  TIPO: NORMAL  \n")
        
        p.text("--------------------------------\n")
        p.set(align='center', bold=True, invert=True)
        p.text(" VALIDO POR 1 ALMUERZO \n\n")
        p.set(align='center', bold=False, invert=False)
        p.text(" Powered by John Alexander Garcia")
        p.text("\n\n\n")
        p.cut()
        print("✅ Ticket Normal enviado correctamente.")

    except Exception as e:
        print(f"❌ Error imprimiendo ticket normal: {e}")
    finally:
        if p: p.close()

def print_test_ticket(user_id, name):
    print(f"🖨️  Imprimiendo Ticket DE PRUEBA para {name} (ID: {user_id})...")
    p = None
    try:
        p = Network(IP_IMPRESORA)
        p.set(align='center')
        
        if os.path.exists(ARCHIVO_LOGO):
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
        
        lineas_nombre = textwrap.wrap(name, width=24) 
        for linea in lineas_nombre:
            p.set(align='left', bold=True)
            p.text(f"{linea}\n")

        p.text("\n")
        
        # === SECCION MODIFICADA PARA PRUEBA ===
        p.set(align='center', bold=True, invert=True) 
        p.text("  *** MODO DE PRUEBA ***  \n")
        p.set(align='center', bold=True, invert=False)
        p.text("\n")
        p.text("NO VALIDO PARA ALMUERZO\n")
        p.text("SOLO VERIFICACION\n")
        p.text("DE SISTEMA\n")
        
        p.text("--------------------------------\n")
        p.set(align='center', bold=False, invert=False)
        p.text(" Powered by John Alexander Garcia")
        p.text("\n\n\n")
        p.cut()
        print("✅ Ticket de Prueba enviado correctamente.")

    except Exception as e:
        print(f"❌ Error imprimiendo ticket de prueba: {e}")
    finally:
        if p: p.close()

if __name__ == "__main__":
    # ID y Nombre de ejemplo (Usuario 33)
    TEST_USER_ID = "33"
    TEST_USER_NAME = "PRUEBA SISTEMA (33)"

    print("--- INICIANDO PRUEBA DE IMPRESION ---")
    
    # 1. Imprimir Ticket Normal
    print_normal_ticket(TEST_USER_ID, TEST_USER_NAME)
    
    # 2. Imprimir Ticket de Prueba (No valido)
    print_test_ticket(TEST_USER_ID, TEST_USER_NAME)
    
    print("--- PRUEBA FINALIZADA ---")
