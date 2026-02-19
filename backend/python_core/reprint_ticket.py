
import argparse
import sys
from src.printer import TicketPrinter
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

def main():
    parser = argparse.ArgumentParser(description='Reprint Ticket')
    parser.add_argument('--name', required=True)
    parser.add_argument('--date', required=False) # Optional for visitor
    parser.add_argument('--time', required=False) # Optional for visitor
    parser.add_argument('--type', required=True)
    parser.add_argument('--ticket_number', required=False) # Optional for visitor logic
    parser.add_argument('--autoriza', required=False) # New argument for manual tickets

    args = parser.parse_args()
    
    try:
        printer = TicketPrinter()
        if args.type == "TICKET VISITA":
            printer.imprimir_ticket_visitante(args.name, args.autoriza, args.ticket_number)
        else:
            printer.reimprimir_ticket(args.name, args.date, args.time, args.type, args.ticket_number)
    except Exception as e:
        print(f"❌ Error al reimprimir: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
