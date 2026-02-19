
import argparse
import sys
import textwrap
import os
from datetime import datetime
from dotenv import load_dotenv
from escpos.printer import Network

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
IP_IMPRESORA = os.getenv('IP_IMPRESORA', '150.36.200.9')
ARCHIVO_LOGO = os.path.join(os.path.dirname(__file__), "logo_grande.png")

def reprint_ticket(name, date_str, time_str, ticket_type, ticket_number):
    print(f"🖨️  Reimprimiendo ticket para {name} ({date_str} {time_str})...")
    p = None
    try:
        p = Network(IP_IMPRESORA)
        p.set(align='center')
        
        # Logo
        if os.path.exists(ARCHIVO_LOGO):
            try: p.image(ARCHIVO_LOGO)
            except: pass 

        p.set(align='center', bold=True, double_height=True)
        p.text("DETCUADOR S.A.\n")
        p.set(align='center', bold=False, double_height=False)
        p.text("CONTROL DE COMEDOR\n")
        p.set(align='center', bold=True)
        p.text(f"N: {ticket_number}\n")
        p.set(align='center', bold=False)
        p.text("--------------------------------\n")
        
        # Combine date and time for display
        # The user wants "same one from yesterday that they took at the same time"
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
            
            # TIPO DE MENU
            if ticket_type == "TICKET GERENCIA":
                p.set(align='center', bold=True, invert=True) 
                p.text("  >>> TIPO: GERENCIA <<<  \n")
            elif ticket_type == "TICKET DIETA":
                p.set(align='center', bold=True, invert=True) 
                p.text("  >>> MENU: DIETA <<<  \n")
            else: # TICKET ALMUERZO or others
                p.set(align='center', bold=True, invert=False) 
                p.text("  TIPO: NORMAL  \n")
        
        p.set(align='center', bold=False, invert=False)
        p.text("--------------------------------\n")
        
        p.set(align='center', bold=True, invert=True)

        p.set(align='center', bold=False, invert=False)
        p.text(" VALIDO POR 1 ALMUERZO \n\n")
        
        p.set(align='center', bold=False, invert=False)
        p.text("Desarrollado por: John Garcia\n")
        p.text("Version: 3.0\n")

        p.text("\n\n\n")
        p.cut()
        print("✅ Ticket reimpreso correctamente.")

    except Exception as e:
        print(f"❌ Error imprimiendo ticket: {e}")
        sys.exit(1)
    finally:
        if p: p.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Reprint Ticket')
    parser.add_argument('--name', required=True)
    parser.add_argument('--date', required=True)
    parser.add_argument('--time', required=True)
    parser.add_argument('--type', required=True)
    parser.add_argument('--ticket_number', required=True)

    args = parser.parse_args()
    
    reprint_ticket(args.name, args.date, args.time, args.type, args.ticket_number)
