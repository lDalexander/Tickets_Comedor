"""
Reporte diario de control de tiempo de almuerzo, por correo (SMTP).

Envía una tabla con la salida al almuerzo, el retorno y el tiempo consumido de cada
colaborador, más tres bloques al final:
    ⚠️  Excedieron el tiempo permitido
    ❌  No marcaron el retorno (y ya se les pasó el tiempo)
    ⏳  Aún en almuerzo (dentro de su tiempo al momento del envío)

El tercer bloque existe porque el correo sale a las 14:30 y el comedor cierra a las
14:00: quien sacó ticket a las 13:55 todavía está en su derecho de 30 minutos y no
debe aparecer como incumplimiento.

Uso:
    python send_lunch_report.py                      # hoy
    python send_lunch_report.py --fecha 2026-08-12   # una fecha concreta
    python send_lunch_report.py --dry-run            # imprime, no envía
    python send_lunch_report.py --to a@b.com,c@d.com # destinatarios puntuales

Lo dispara comedor-lunch-report.timer (lunes a viernes 14:30).
"""
import argparse
import csv
import io
import os
import smtplib
import sys
import tempfile
from datetime import date, datetime
from email.message import EmailMessage

# Ubicar el CWD en el directorio del script para que encuentre el .env
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SCRIPT_DIR)
sys.path.insert(0, SCRIPT_DIR)

from dotenv import load_dotenv  # noqa: E402
load_dotenv()

from src.database import Database  # noqa: E402

# ---------------------------------------------------------------------------
# Estado efectivo de la sesión.
#
# OJO: esta expresión está duplicada en backend/repositories/almuerzoRepository.js
# (constante SQL_ESTADO_EFECTIVO). Es la misma regla de negocio consumida desde dos
# lenguajes; si cambia una, hay que cambiar la otra. El panel web es la referencia.
#
# El primer %s recibe el límite en segundos (permitidos + tolerancia).
# ---------------------------------------------------------------------------
SQL_SESIONES = """
    SELECT s.user_id, s.nombre, s.hora_salida, s.hora_retorno, s.numero_ticket,
           s.tipo_ticket, s.cierre_manual, s.origen,
           COALESCE(
               s.segundos_usados,
               CASE WHEN s.fecha = CURDATE()
                    THEN TIMESTAMPDIFF(SECOND, TIMESTAMP(s.fecha, s.hora_salida), NOW())
               END
           ) AS segundos,
           CASE
               WHEN s.hora_retorno IS NOT NULL THEN s.estado
               WHEN s.fecha < CURDATE() THEN 'SIN_RETORNO'
               WHEN TIMESTAMPDIFF(SECOND, TIMESTAMP(s.fecha, s.hora_salida), NOW()) > %s
                   THEN 'EXCEDIDO_EN_CURSO'
               ELSE 'EN_ALMUERZO'
           END AS estado_efectivo
      FROM almuerzo_sesiones s
     WHERE s.fecha = %s
     ORDER BY s.hora_salida ASC
"""

ETIQUETA = {
    'A_TIEMPO':          'A tiempo',
    'EXCEDIDO':          'Excedió el tiempo',
    'EN_ALMUERZO':       'En almuerzo',
    'EXCEDIDO_EN_CURSO': 'Sin marcar (tiempo vencido)',
    'SIN_RETORNO':       'No marcó retorno',
}

COLOR = {
    'A_TIEMPO':          '#059669',
    'EXCEDIDO':          '#dc2626',
    'EN_ALMUERZO':       '#d97706',
    'EXCEDIDO_EN_CURSO': '#ea580c',
    'SIN_RETORNO':       '#6b7280',
}

FONDO = {
    'A_TIEMPO':          '#ecfdf5',
    'EXCEDIDO':          '#fef2f2',
    'EN_ALMUERZO':       '#fffbeb',
    'EXCEDIDO_EN_CURSO': '#fff7ed',
    'SIN_RETORNO':       '#f9fafb',
}

DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
         'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']


def fecha_larga(f: date) -> str:
    return f"{DIAS[f.weekday()]} {f.day} de {MESES[f.month - 1]} de {f.year}"


def mmss(segundos) -> str:
    """900 -> '15:00'. Guion si no hay dato."""
    if segundos is None:
        return '—'
    s = int(segundos)
    if s < 0:
        return '—'
    return f"{s // 60}:{s % 60:02d}"


def hhmm(valor) -> str:
    """timedelta o time de MySQL -> 'HH:MM'."""
    if valor is None:
        return '—'
    total = int(valor.total_seconds()) if hasattr(valor, 'total_seconds') else \
        valor.hour * 3600 + valor.minute * 60 + valor.second
    return f"{total // 3600:02d}:{(total % 3600) // 60:02d}"


class ReporteAlmuerzo:
    def __init__(self, db: Database, fecha: date):
        self.db = db
        self.fecha = fecha
        self.config = self._leer_config()
        self.permitidos = self._entero('almuerzo_minutos_permitidos', 30)
        self.tolerancia = self._entero('almuerzo_tolerancia_minutos', 0)
        self.limite_seg = (self.permitidos + self.tolerancia) * 60
        self.filas = self._leer_sesiones()

    def _leer_config(self):
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT clave, valor FROM configuracion")
            return {c: v for c, v in cursor.fetchall()}
        finally:
            conn.close()

    def _entero(self, clave, defecto):
        try:
            return int(str(self.config.get(clave, defecto)).strip())
        except (TypeError, ValueError):
            return defecto

    def _leer_sesiones(self):
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(SQL_SESIONES, (self.limite_seg, self.fecha))
            return cursor.fetchall()
        finally:
            conn.close()

    # ── Agrupaciones ──────────────────────────────────────────────────────
    def por_estado(self, *estados):
        return [f for f in self.filas if f['estado_efectivo'] in estados]

    @property
    def excedidos(self):
        return self.por_estado('EXCEDIDO')

    @property
    def sin_marcar(self):
        return self.por_estado('EXCEDIDO_EN_CURSO', 'SIN_RETORNO')

    @property
    def en_almuerzo(self):
        return self.por_estado('EN_ALMUERZO')

    @property
    def retornaron(self):
        return [f for f in self.filas if f['hora_retorno'] is not None]

    @property
    def promedio_seg(self):
        cerrados = [int(f['segundos']) for f in self.retornaron if f['segundos'] is not None]
        return round(sum(cerrados) / len(cerrados)) if cerrados else None

    def exceso_seg(self, fila):
        if fila['segundos'] is None:
            return None
        return max(0, int(fila['segundos']) - self.permitidos * 60)

    @property
    def hay_inferidos(self):
        return any(f['origen'] == 'BACKFILL' for f in self.filas)

    # ── Salidas ───────────────────────────────────────────────────────────
    def asunto(self):
        n = len(self.excedidos)
        icono = '⚠️' if n else '✅'
        detalle = f'{n} excedieron el tiempo' if n else 'sin excesos'
        return f"{icono} Control de Almuerzo {self.fecha.isoformat()} — {detalle}"

    def csv_bytes(self):
        buffer = io.StringIO()
        w = csv.writer(buffer, delimiter=';')
        w.writerow(['Fecha', 'ID', 'Colaborador', 'Ticket', 'Salida', 'Retorno',
                    'Tiempo (mm:ss)', 'Minutos', 'Estado', 'Origen', 'Cierre manual'])
        for f in self.filas:
            w.writerow([
                self.fecha.isoformat(), f['user_id'], f['nombre'], f['numero_ticket'] or '',
                hhmm(f['hora_salida']), hhmm(f['hora_retorno']), mmss(f['segundos']),
                '' if f['segundos'] is None else int(f['segundos']) // 60,
                ETIQUETA.get(f['estado_efectivo'], f['estado_efectivo']),
                'Inferido' if f['origen'] == 'BACKFILL' else 'Biométrico',
                'Sí' if f['cierre_manual'] else 'No',
            ])
        # BOM para que Excel reconozca UTF-8 y no rompa los acentos
        return buffer.getvalue().encode('utf-8-sig')

    def texto_plano(self):
        """Alternativa para clientes sin HTML."""
        lineas = [
            f"CONTROL DE TIEMPO DE ALMUERZO — {self.fecha.isoformat()}",
            f"Límite: {self.permitidos} minutos"
            + (f" (+{self.tolerancia} de tolerancia)" if self.tolerancia else " (estricto)"),
            "",
            f"Salidas registradas: {len(self.filas)}",
            f"Retornos marcados:   {len(self.retornaron)}",
            f"Excedieron:          {len(self.excedidos)}",
            f"Sin marcar retorno:  {len(self.sin_marcar)}",
            f"Aún en almuerzo:     {len(self.en_almuerzo)}",
            f"Promedio:            {mmss(self.promedio_seg)}",
            "",
            "DETALLE",
        ]
        for f in self.filas:
            lineas.append(
                f"  {f['nombre'][:34]:<34} {hhmm(f['hora_salida'])} → {hhmm(f['hora_retorno'])}"
                f"  {mmss(f['segundos']):>7}  {ETIQUETA.get(f['estado_efectivo'], '')}"
            )
        if self.excedidos:
            lineas += ["", "EXCEDIERON EL TIEMPO"]
            for f in self.excedidos:
                lineas.append(f"  {f['nombre'][:34]:<34} {mmss(f['segundos'])} (+{mmss(self.exceso_seg(f))})")
        if self.sin_marcar:
            lineas += ["", "NO MARCARON EL RETORNO"]
            for f in self.sin_marcar:
                lineas.append(f"  {f['nombre'][:34]:<34} salió {hhmm(f['hora_salida'])}")
        if self.en_almuerzo:
            lineas += ["", "AÚN EN ALMUERZO (dentro de su tiempo)"]
            for f in self.en_almuerzo:
                lineas.append(f"  {f['nombre'][:34]:<34} salió {hhmm(f['hora_salida'])} ({mmss(f['segundos'])})")
        return "\n".join(lineas)

    def html(self):
        # Estilos inline y layout con tablas: Outlook no soporta flex/grid ni <style> externo
        def celda(contenido, extra=''):
            return f'<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;{extra}">{contenido}</td>'

        def encabezados(cols):
            th = ''.join(
                f'<th style="padding:9px 10px;text-align:left;background:#0f172a;color:#94a3b8;'
                f'font-size:11px;text-transform:uppercase;letter-spacing:.5px;font-weight:600;">{c}</th>'
                for c in cols
            )
            return f'<tr>{th}</tr>'

        def tarjeta(valor, etiqueta, color):
            return (
                f'<td style="padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;'
                f'border-radius:8px;text-align:center;">'
                f'<div style="font-size:22px;font-weight:800;color:{color};line-height:1.1;">{valor}</div>'
                f'<div style="font-size:11px;color:#6b7280;text-transform:uppercase;'
                f'letter-spacing:.4px;">{etiqueta}</div></td>'
            )

        # ── Detalle ──
        filas_html = ''
        for f in self.filas:
            estado = f['estado_efectivo']
            exceso = self.exceso_seg(f) if estado == 'EXCEDIDO' else None
            marca_inferido = (
                ' <span style="font-size:10px;color:#9ca3af;" title="Dato reconstruido del histórico">'
                '(inferido)</span>' if f['origen'] == 'BACKFILL' else ''
            )
            marca_manual = (
                ' <span style="font-size:10px;color:#6366f1;">(manual)</span>'
                if f['cierre_manual'] else ''
            )
            filas_html += (
                f'<tr style="background:{FONDO.get(estado, "#ffffff")};">'
                + celda(f"{f['nombre']}{marca_inferido}{marca_manual}", 'font-size:13px;color:#111827;')
                + celda(f['numero_ticket'] or '—', 'font-size:12px;color:#6b7280;')
                + celda(hhmm(f['hora_salida']), 'font-size:13px;color:#374151;white-space:nowrap;')
                + celda(hhmm(f['hora_retorno']), 'font-size:13px;color:#374151;white-space:nowrap;')
                + celda(
                    mmss(f['segundos']) + (
                        f' <span style="color:#dc2626;font-size:11px;">(+{mmss(exceso)})</span>'
                        if exceso else ''
                    ),
                    f'font-size:13px;font-weight:700;color:{COLOR.get(estado, "#374151")};white-space:nowrap;'
                )
                + celda(ETIQUETA.get(estado, estado),
                        f'font-size:12px;color:{COLOR.get(estado, "#374151")};white-space:nowrap;')
                + '</tr>'
            )

        def bloque(titulo, filas, color, fondo, descripcion, formato):
            if not filas:
                return ''
            items = ''.join(
                f'<tr>'
                f'<td style="padding:5px 10px;font-size:13px;color:#111827;">{f["nombre"]}</td>'
                f'<td style="padding:5px 10px;font-size:13px;color:{color};font-weight:600;'
                f'white-space:nowrap;text-align:right;">{formato(f)}</td>'
                f'</tr>'
                for f in filas
            )
            return (
                f'<div style="margin-top:22px;padding:14px 16px;background:{fondo};'
                f'border-left:4px solid {color};border-radius:6px;">'
                f'<div style="font-size:14px;font-weight:700;color:{color};margin-bottom:2px;">'
                f'{titulo} ({len(filas)})</div>'
                f'<div style="font-size:12px;color:#6b7280;margin-bottom:8px;">{descripcion}</div>'
                f'<table style="width:100%;border-collapse:collapse;">{items}</table>'
                f'</div>'
            )

        limite_txt = (f"{self.permitidos} minutos"
                      + (f" + {self.tolerancia} de tolerancia" if self.tolerancia else " (límite estricto)"))

        nota_inferidos = (
            '<p style="margin:16px 0 0;font-size:11px;color:#9ca3af;line-height:1.5;">'
            'Las filas marcadas <strong>(inferido)</strong> se reconstruyeron a partir de segundas '
            'marcaciones registradas antes de que existiera el control de tiempo. Sirven como '
            'referencia de tendencia, no como medición en vivo.</p>'
        ) if self.hay_inferidos else ''

        return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#f3f4f6;">
<div style="max-width:820px;margin:0 auto;padding:24px 16px;font-family:'Segoe UI',Arial,sans-serif;">

  <div style="background:#0f172a;padding:20px 24px;border-radius:10px 10px 0 0;">
    <div style="font-size:11px;color:#38bdf8;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;">
      DETCUADOR S.A. — Sistema de Comedor
    </div>
    <div style="font-size:21px;color:#f1f5f9;font-weight:800;margin-top:4px;">
      Control de tiempo de almuerzo
    </div>
    <div style="font-size:13px;color:#94a3b8;margin-top:4px;text-transform:capitalize;">
      {fecha_larga(self.fecha)}
    </div>
  </div>

  <div style="background:#ffffff;padding:20px 24px;border:1px solid #e5e7eb;border-top:none;">

    <table style="width:100%;border-collapse:separate;border-spacing:6px 0;margin-bottom:6px;">
      <tr>
        {tarjeta(len(self.filas), 'Salidas', '#0f172a')}
        {tarjeta(len(self.retornaron), 'Retornaron', '#0369a1')}
        {tarjeta(len(self.excedidos), 'Excedieron', '#dc2626')}
        {tarjeta(len(self.sin_marcar), 'Sin marcar', '#6b7280')}
        {tarjeta(mmss(self.promedio_seg), 'Promedio', '#7c3aed')}
      </tr>
    </table>
    <p style="margin:10px 0 18px;font-size:12px;color:#6b7280;">
      Tiempo concedido: <strong>{limite_txt}</strong>. El conteo va desde la marcación
      que imprime el ticket hasta la marcación de retorno.
    </p>

    <table style="width:100%;border-collapse:collapse;">
      {encabezados(['Colaborador', 'Ticket', 'Salida', 'Retorno', 'Tiempo', 'Estado'])}
      {filas_html or '<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;font-size:13px;">Sin salidas a almuerzo registradas este día</td></tr>'}
    </table>

    {bloque('⚠️ Excedieron el tiempo', self.excedidos, '#dc2626', '#fef2f2',
            f'Retornaron después de los {self.permitidos} minutos concedidos.',
            lambda f: f"{mmss(f['segundos'])} (+{mmss(self.exceso_seg(f))})")}

    {bloque('❌ No marcaron el retorno', self.sin_marcar, '#6b7280', '#f9fafb',
            'Registraron su salida pero no marcaron al volver, y su tiempo ya venció.',
            lambda f: f"salió {hhmm(f['hora_salida'])}")}

    {bloque('⏳ Aún en almuerzo', self.en_almuerzo, '#d97706', '#fffbeb',
            'Al momento de este envío siguen dentro de su tiempo. No son incumplimiento.',
            lambda f: f"salió {hhmm(f['hora_salida'])} · {mmss(f['segundos'])}")}

    {nota_inferidos}
  </div>

  <div style="background:#f9fafb;padding:12px 24px;border:1px solid #e5e7eb;border-top:none;
              border-radius:0 0 10px 10px;font-size:11px;color:#9ca3af;">
    Generado automáticamente el {datetime.now().strftime('%d/%m/%Y a las %H:%M')}.
    El detalle completo está en el panel de administración, sección Almuerzos.
    Se adjunta el listado en CSV.
  </div>

</div></body></html>"""


def enviar(reporte: ReporteAlmuerzo, destinos, dry_run=False):
    servidor = os.getenv('SMTP_SERVER', 'smtp-mail.outlook.com')
    puerto = int(os.getenv('SMTP_PORT', 587))
    usuario = os.getenv('SMTP_USER', 'no-reply@detcuador.com')
    clave = os.getenv('SMTP_PASS')

    msg = EmailMessage()
    msg['Subject'] = reporte.asunto()
    msg['From'] = usuario
    msg['To'] = ', '.join(destinos)
    msg.set_content(reporte.texto_plano())
    msg.add_alternative(reporte.html(), subtype='html')
    msg.add_attachment(
        reporte.csv_bytes(), maintype='text', subtype='csv',
        filename=f"control_almuerzo_{reporte.fecha.isoformat()}.csv"
    )

    if dry_run:
        print(f"[DRY-RUN] Asunto: {msg['Subject']}")
        print(f"[DRY-RUN] Para:   {msg['To']}")
        print(f"[DRY-RUN] Sesiones: {len(reporte.filas)} | "
              f"excedidos: {len(reporte.excedidos)} | "
              f"sin marcar: {len(reporte.sin_marcar)} | "
              f"en almuerzo: {len(reporte.en_almuerzo)}")
        # Fuera del repositorio: es un archivo de inspección, no un artefacto del proyecto
        destino_html = os.path.join(tempfile.gettempdir(),
                                    f"reporte_almuerzo_{reporte.fecha.isoformat()}.html")
        with open(destino_html, 'w', encoding='utf-8') as fh:
            fh.write(reporte.html())
        print(f"[DRY-RUN] HTML guardado en {destino_html}")
        print()
        print(reporte.texto_plano())
        return True

    if not clave:
        print("❌ SMTP_PASS no está configurada: no se puede enviar.")
        return False

    try:
        with smtplib.SMTP(servidor, puerto, timeout=30) as smtp:
            smtp.starttls()
            smtp.login(usuario, clave)
            smtp.send_message(msg)
        print(f"✅ Reporte de {reporte.fecha.isoformat()} enviado a {msg['To']}")
        return True
    except Exception as e:
        print(f"❌ Error al enviar el correo: {e}")
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description='Reporte diario de tiempo de almuerzo')
    parser.add_argument('--fecha', help='Fecha a reportar (YYYY-MM-DD). Por defecto hoy.')
    parser.add_argument('--to', help='Destinatarios separados por coma (ignora la configuración).')
    parser.add_argument('--dry-run', action='store_true', help='No envía: imprime y guarda el HTML.')
    parser.add_argument('--forzar', action='store_true',
                        help='Envía aunque almuerzo_email_activo esté en false.')
    args = parser.parse_args()

    if args.fecha:
        try:
            fecha = datetime.strptime(args.fecha, '%Y-%m-%d').date()
        except ValueError:
            print(f"❌ Fecha inválida: {args.fecha} (se espera YYYY-MM-DD)")
            return 1
    else:
        fecha = date.today()

    try:
        db = Database()
    except Exception as e:
        print(f"❌ No se pudo conectar a la base de datos: {e}")
        return 1

    reporte = ReporteAlmuerzo(db, fecha)

    activo = str(reporte.config.get('almuerzo_email_activo', 'true')).lower() == 'true'
    if not activo and not args.forzar and not args.dry_run:
        print("⏸️  almuerzo_email_activo está en false: no se envía. Usa --forzar para omitirlo.")
        return 0

    if args.to:
        destinos = [d.strip() for d in args.to.split(',') if d.strip()]
    else:
        crudo = reporte.config.get('almuerzo_email_destinos') or os.getenv('EMAIL_DESTINO', '')
        destinos = [d.strip() for d in str(crudo).split(',') if d.strip()]

    if not destinos:
        print("❌ Sin destinatarios: define almuerzo_email_destinos en la configuración.")
        return 1

    return 0 if enviar(reporte, destinos, dry_run=args.dry_run) else 1


if __name__ == "__main__":
    sys.exit(main())
