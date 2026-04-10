from escpos.printer import Network
import sys

ip = "150.36.200.9"
print(f"Test hacia la impresora {ip}...")
try:
    p = Network(ip, port=9100, timeout=10)
    p.set(align='center')
    p.text("PRUEBA DE CONEXION DESDE TEST_PRINT.PY\n")
    p.text("Si puedes leer esto, la impresora funciona bien.\n")
    p.text("\n\n\n")
    p.cut()
    p.close()
    print("Comandos enviados exitosamente. ¿Salió papel?")
except Exception as e:
    print("Excepción atrapada al enviar datos:")
    print(e)
