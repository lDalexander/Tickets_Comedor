"""
Cierra las sesiones de almuerzo que quedaron abiertas (nadie marcó el retorno)
y las deja en estado SIN_RETORNO.

Uso:
    python cerrar_sesiones_almuerzo.py              # todos los días anteriores a hoy
    python cerrar_sesiones_almuerzo.py 2026-08-12   # solo esa fecha

Lo invoca el mantenimiento diario (daily_maintenance.sh, 05:00). Es idempotente:
correrlo dos veces no cambia nada la segunda vez.
"""
import os
import sys
import logging

# Ubicar el CWD en el directorio del script para que encuentre el .env
script_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(script_dir)
sys.path.insert(0, script_dir)

from src.database import Database  # noqa: E402

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


def main() -> int:
    fecha = sys.argv[1] if len(sys.argv) > 1 else None
    try:
        db = Database()
    except Exception as e:
        print(f"❌ No se pudo conectar a la base de datos: {e}")
        return 1

    cerradas = db.cerrar_sesiones_colgadas(fecha)
    objetivo = f"del {fecha}" if fecha else "de días anteriores"
    if cerradas:
        print(f"⚠️  {cerradas} sesión(es) de almuerzo {objetivo} sin marcación de retorno (SIN_RETORNO).")
    else:
        print(f"✅ Sin sesiones de almuerzo colgadas {objetivo}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
