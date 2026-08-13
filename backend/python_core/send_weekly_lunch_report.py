"""
Reporte SEMANAL acumulado de tiempo de almuerzo, por correo (SMTP).

A diferencia del diario, que lista sesiones, este agrupa POR PERSONA y suma el
tiempo de más de toda la semana: quien se pasó 5 minutos cada día aparece con 25
minutos acumulados, aunque ningún día individual parezca grave.

Semana = sábado a viernes (7 días), terminando en el viernes del envío. Se eligió
así porque en la planta se almuerza todos los días: de este modo ningún día queda
fuera de un reporte semanal ni se cuenta dos veces.

Uso:
    python send_weekly_lunch_report.py                      # semana que cierra hoy
    python send_weekly_lunch_report.py --hasta 2026-08-14   # semana que cierra ese día
    python send_weekly_lunch_report.py --dias 5             # otro tamaño de ventana
    python send_weekly_lunch_report.py --dry-run
    python send_weekly_lunch_report.py --to jefe@detcuador.com

Lo dispara comedor-weekly-lunch-report.timer (viernes 15:00).
"""
import argparse
import csv
import io
import os
import sys
from datetime import date, datetime, timedelta

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SCRIPT_DIR)
sys.path.insert(0, SCRIPT_DIR)

from src.database import Database  # noqa: E402
# Se reutilizan los helpers de formato y el envío SMTP del reporte diario:
# misma identidad visual y una sola implementación de SMTP.
from send_lunch_report import (  # noqa: E402
    enviar, mmss, hhmm, fecha_larga, DIAS, MESES,
)

DIAS_SEMANA_POR_DEFECTO = 7

# ---------------------------------------------------------------------------
# Acumulado por persona.
#
# El exceso se mide contra los minutos permitidos (no contra el límite con
# tolerancia): la tolerancia decide SI un día cuenta como incumplimiento, pero el
# tiempo de más que se reporta es el real sobre los 30 minutos. Mismo criterio
# que el bloque "excedieron" del reporte diario.
#
# Primer %s = límite en segundos (permitidos + tolerancia)
# Segundo   = permitidos en segundos
# ---------------------------------------------------------------------------
SQL_ACUMULADO = """
    SELECT s.user_id,
           MAX(s.nombre) AS nombre,
           MAX(u.zona)   AS zona,
           COUNT(*)                                            AS dias_con_salida,
           COALESCE(SUM(s.hora_retorno IS NOT NULL), 0)        AS dias_con_retorno,
           COALESCE(SUM(s.hora_retorno IS NULL), 0)            AS dias_sin_marcar,
           -- COALESCE obligatorio: SUM() devuelve NULL si ningún día del grupo
           -- tiene retorno marcado (segundos_usados NULL en todos)
           COALESCE(SUM(s.segundos_usados > %s), 0)            AS dias_excedidos,
           COALESCE(SUM(CASE WHEN s.segundos_usados > %s
                    THEN s.segundos_usados - %s ELSE 0 END), 0) AS exceso_total,
           MAX(s.segundos_usados)                              AS peor_dia,
           ROUND(AVG(s.segundos_usados))                       AS promedio,
           COALESCE(SUM(s.origen = 'BACKFILL'), 0)             AS dias_inferidos
      FROM almuerzo_sesiones s
      LEFT JOIN usuarios u ON u.zk_id = s.user_id
     WHERE s.fecha BETWEEN %s AND %s
       {filtro_origen}
     GROUP BY s.user_id
     ORDER BY exceso_total DESC, dias_excedidos DESC, nombre ASC
"""

# Totales por día, para ver la evolución de la semana
SQL_POR_DIA = """
    SELECT s.fecha,
           COUNT(*)                                            AS salidas,
           COALESCE(SUM(s.hora_retorno IS NOT NULL), 0)        AS retornos,
           COALESCE(SUM(s.segundos_usados > %s), 0)            AS excedidos,
           COALESCE(SUM(CASE WHEN s.segundos_usados > %s
                    THEN s.segundos_usados - %s ELSE 0 END), 0) AS exceso_total
      FROM almuerzo_sesiones s
     WHERE s.fecha BETWEEN %s AND %s
       {filtro_origen}
     GROUP BY s.fecha
     ORDER BY s.fecha ASC
"""

# Los datos BACKFILL se reconstruyeron de segundas marcaciones anteriores al
# módulo y hay casos de 2 horas que evidentemente no eran retornos de almuerzo.
# En un reporte diario, que solo lista lo del día, ese ruido se ve en contexto;
# en el semanal, que ordena personas por tiempo acumulado, colocaría a alguien
# al tope del ranking por un dato inventado. Por eso el semanal los excluye
# salvo que se pidan explícitamente.
FILTRO_SOLO_BIOMETRICO = "AND s.origen = 'BIOMETRICO'"


def horas_min(segundos) -> str:
    """5400 -> '1 h 30 min'. Para totales grandes, donde mm:ss no se lee bien."""
    if segundos is None:
        return '—'
    s = int(segundos)
    if s <= 0:
        return '0 min'
    horas, resto = divmod(s, 3600)
    minutos = resto // 60
    if horas and minutos:
        return f"{horas} h {minutos} min"
    if horas:
        return f"{horas} h"
    return f"{minutos} min"


class ReporteSemanal:
    def __init__(self, db: Database, hasta: date, dias: int = DIAS_SEMANA_POR_DEFECTO,
                 incluir_inferidos: bool = False):
        self.db = db
        self.hasta = hasta
        self.dias = dias
        self.desde = hasta - timedelta(days=dias - 1)
        self.fecha = hasta                      # lo usa enviar() como referencia
        self.incluir_inferidos = incluir_inferidos
        self.filtro_origen = '' if incluir_inferidos else FILTRO_SOLO_BIOMETRICO
        self.config = self._leer_config()
        self.permitidos = self._entero('almuerzo_minutos_permitidos', 30)
        self.tolerancia = self._entero('almuerzo_tolerancia_minutos', 0)
        self.limite_seg = (self.permitidos + self.tolerancia) * 60
        self.permitidos_seg = self.permitidos * 60
        self.personas = self._leer_acumulado()
        self.por_dia = self._leer_por_dia()

    # ── Carga ─────────────────────────────────────────────────────────────
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

    def _leer_acumulado(self):
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(SQL_ACUMULADO.format(filtro_origen=self.filtro_origen), (
                self.limite_seg, self.limite_seg, self.permitidos_seg,
                self.desde, self.hasta,
            ))
            return cursor.fetchall()
        finally:
            conn.close()

    def _leer_por_dia(self):
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(SQL_POR_DIA.format(filtro_origen=self.filtro_origen), (
                self.limite_seg, self.limite_seg, self.permitidos_seg,
                self.desde, self.hasta,
            ))
            return cursor.fetchall()
        finally:
            conn.close()

    # ── Agrupaciones ──────────────────────────────────────────────────────
    @property
    def con_exceso(self):
        """Personas con tiempo de más acumulado, de mayor a menor."""
        return [p for p in self.personas if int(p['exceso_total'] or 0) > 0]

    @property
    def sin_marcar(self):
        """Personas que dejaron algún día sin marcar el retorno."""
        return sorted(
            [p for p in self.personas if int(p['dias_sin_marcar'] or 0) > 0],
            key=lambda p: -int(p['dias_sin_marcar'] or 0)
        )

    @property
    def exceso_total_semana(self):
        return sum(int(p['exceso_total'] or 0) for p in self.personas)

    @property
    def dias_excedidos_semana(self):
        return sum(int(p['dias_excedidos'] or 0) for p in self.personas)

    @property
    def total_sin_marcar(self):
        """Marcaciones de retorno que faltaron en toda la semana."""
        return sum(int(p['dias_sin_marcar'] or 0) for p in self.personas)

    @property
    def total_salidas(self):
        return sum(int(p['dias_con_salida'] or 0) for p in self.personas)

    @property
    def total_marcadas(self):
        """Retornos efectivamente marcados en la semana."""
        return sum(int(p['dias_con_retorno'] or 0) for p in self.personas)

    @property
    def pct_marcacion(self):
        """Porcentaje de cumplimiento de la marcación de retorno."""
        if self.total_salidas == 0:
            return None
        return round(self.total_marcadas * 100 / self.total_salidas)

    @property
    def por_marcaciones(self):
        """Todas las personas ordenadas por marcaciones faltantes, de más a menos."""
        return sorted(
            self.personas,
            key=lambda p: (-int(p['dias_sin_marcar'] or 0), (p['nombre'] or ''))
        )

    @property
    def hay_inferidos(self):
        return any(int(p['dias_inferidos'] or 0) > 0 for p in self.personas)

    @property
    def inferidos_excluidos(self):
        """Cuántas sesiones del rango quedaron fuera por ser dato reconstruido."""
        if self.incluir_inferidos:
            return 0
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT COUNT(*) FROM almuerzo_sesiones "
                "WHERE fecha BETWEEN %s AND %s AND origen = 'BACKFILL'",
                (self.desde, self.hasta)
            )
            return int(cursor.fetchone()[0] or 0)
        except Exception:
            return 0
        finally:
            conn.close()

    def rango_texto(self):
        return f"{self.desde.isoformat()} a {self.hasta.isoformat()}"

    # ── Salidas ───────────────────────────────────────────────────────────
    @property
    def nombre_base(self):
        return f"control_almuerzo_semana_{self.desde.isoformat()}_a_{self.hasta.isoformat()}"

    def asunto(self):
        n = len(self.con_exceso)
        partes = []
        if n:
            partes.append(f"{n} persona(s), {horas_min(self.exceso_total_semana)} de más")
        if self.total_sin_marcar:
            partes.append(f"{self.total_sin_marcar} marcación(es) faltante(s)")
        if not partes:
            return f"✅ Resumen semanal de almuerzos ({self.rango_texto()}) — todo en orden"
        icono = '📊' if n else '⚠️'
        return f"{icono} Resumen semanal de almuerzos ({self.rango_texto()}) — {' · '.join(partes)}"

    def resumen_consola(self):
        return (f"Personas: {len(self.personas)} | con exceso: {len(self.con_exceso)} | "
                f"exceso total: {horas_min(self.exceso_total_semana)} | "
                f"días sin marcar: {self.total_sin_marcar}")

    def csv_bytes(self):
        buffer = io.StringIO()
        w = csv.writer(buffer, delimiter=';')
        w.writerow(['Desde', 'Hasta', 'ID', 'Colaborador', 'Zona',
                    'Dias con salida', 'Dias con retorno', 'Dias sin marcar',
                    'Dias excedidos', 'Exceso total (mm:ss)', 'Exceso total (min)',
                    'Peor dia (mm:ss)', 'Promedio (mm:ss)'])
        for p in self.personas:
            exceso = int(p['exceso_total'] or 0)
            w.writerow([
                self.desde.isoformat(), self.hasta.isoformat(),
                p['user_id'], p['nombre'], p['zona'] or '(sin zona)',
                p['dias_con_salida'], p['dias_con_retorno'], p['dias_sin_marcar'],
                p['dias_excedidos'], mmss(exceso), exceso // 60,
                mmss(p['peor_dia']), mmss(p['promedio']),
            ])
        # BOM para que Excel reconozca UTF-8 y no rompa los acentos
        return buffer.getvalue().encode('utf-8-sig')

    def texto_plano(self):
        limite_txt = (f"{self.permitidos} min"
                      + (f" (+{self.tolerancia} tolerancia)" if self.tolerancia else " estrictos"))
        pct = self.pct_marcacion
        lineas = [
            f"RESUMEN SEMANAL DE ALMUERZOS — {self.rango_texto()} ({self.dias} días)",
            f"Tiempo permitido por día: {limite_txt}",
            "",
            f"Personas con salidas registradas: {len(self.personas)}",
            f"Salidas a almuerzo:               {self.total_salidas}",
            f"Retornos marcados:                {self.total_marcadas}"
            + (f"  ({pct}% de las salidas)" if pct is not None else ""),
            f"MARCACIONES FALTANTES:            {self.total_sin_marcar}",
            f"Personas que excedieron algún día: {len(self.con_exceso)}",
            f"Días excedidos en total:           {self.dias_excedidos_semana}",
            f"Tiempo de más acumulado:          {horas_min(self.exceso_total_semana)}",
            "",
        ]
        if self.con_exceso:
            lineas.append("TIEMPO DE MÁS ACUMULADO (de mayor a menor)")
            for p in self.con_exceso:
                lineas.append(
                    f"  {(p['nombre'] or '')[:32]:<32} {mmss(p['exceso_total']):>8} de más"
                    f"  ({p['dias_excedidos']} de {p['dias_con_salida']} días excedidos,"
                    f" marcó {p['dias_con_retorno']}/{p['dias_con_salida']})"
                )
        else:
            lineas.append("Ninguna persona excedió el tiempo esta semana.")

        if self.personas:
            lineas += ["", "MARCACIONES DE RETORNO POR PERSONA (salidas / marcadas / faltantes)"]
            for p in self.por_marcaciones:
                faltan = int(p['dias_sin_marcar'] or 0)
                marca = '  <-- faltan marcaciones' if faltan else ''
                lineas.append(
                    f"  {(p['nombre'] or '')[:32]:<32} "
                    f"{p['dias_con_salida']:>2} / {p['dias_con_retorno']:>2} / {faltan:>2}{marca}"
                )

        if self.total_sin_marcar:
            lineas += [
                "",
                f"AVISO: faltaron {self.total_sin_marcar} marcaciones de retorno de "
                f"{self.total_salidas} salidas registradas. Sin la segunda marcación no "
                f"hay tiempo que medir en esos días.",
            ]

        if self.por_dia:
            lineas += ["", "EVOLUCIÓN DE LA SEMANA"]
            for d in self.por_dia:
                f = d['fecha']
                lineas.append(
                    f"  {f.isoformat()} {DIAS[f.weekday()][:3]}  "
                    f"salidas: {d['salidas']:>3}  excedidos: {d['excedidos']:>3}  "
                    f"de más: {horas_min(d['exceso_total'])}"
                )
        return "\n".join(lineas)

    def html(self):
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
                f'<div style="font-size:20px;font-weight:800;color:{color};line-height:1.15;">{valor}</div>'
                f'<div style="font-size:11px;color:#6b7280;text-transform:uppercase;'
                f'letter-spacing:.4px;">{etiqueta}</div></td>'
            )

        # ── Ranking de tiempo acumulado ──
        filas_exceso = ''
        for posicion, p in enumerate(self.con_exceso, 1):
            exceso = int(p['exceso_total'] or 0)
            # Barra proporcional al mayor exceso: hace visible de un golpe quién se destaca
            mayor = int(self.con_exceso[0]['exceso_total'] or 1)
            ancho = max(4, round(exceso * 100 / mayor))
            marca_inferido = (
                ' <span style="font-size:10px;color:#9ca3af;">(inferido)</span>'
                if int(p['dias_inferidos'] or 0) > 0 else ''
            )
            filas_exceso += (
                f'<tr style="background:{"#fef2f2" if posicion <= 3 else "#ffffff"};">'
                + celda(f'<strong style="color:#6b7280;">{posicion}.</strong>', 'width:28px;font-size:12px;')
                + celda(f"{p['nombre']}{marca_inferido}", 'font-size:13px;color:#111827;')
                + celda(p['zona'] or '<span style="color:#dc2626;">sin zona</span>',
                        'font-size:11px;color:#6b7280;white-space:nowrap;')
                + celda(f'<strong style="color:#dc2626;">{mmss(exceso)}</strong>'
                        f'<div style="margin-top:3px;background:#e5e7eb;border-radius:3px;height:5px;width:100%;">'
                        f'<div style="background:#dc2626;height:5px;border-radius:3px;width:{ancho}%;"></div></div>',
                        'font-size:13px;min-width:110px;')
                + celda(f"{p['dias_excedidos']} de {p['dias_con_salida']}",
                        'font-size:12px;color:#6b7280;white-space:nowrap;text-align:center;')
                + celda(
                    f"{p['dias_con_retorno']}/{p['dias_con_salida']}" + (
                        f' <span style="color:#dc2626;font-weight:700;">'
                        f'(faltan {p["dias_sin_marcar"]})</span>'
                        if int(p['dias_sin_marcar'] or 0) else ''
                    ),
                    'font-size:12px;color:#6b7280;white-space:nowrap;text-align:center;')
                + celda(mmss(p['peor_dia']), 'font-size:12px;color:#6b7280;white-space:nowrap;')
                + celda(mmss(p['promedio']), 'font-size:12px;color:#6b7280;white-space:nowrap;')
                + '</tr>'
            )

        # ── Marcaciones de retorno por persona (todas) ──
        filas_marcaciones = ''
        for p in self.por_marcaciones:
            salidas = int(p['dias_con_salida'] or 0)
            marcadas = int(p['dias_con_retorno'] or 0)
            faltan = int(p['dias_sin_marcar'] or 0)
            # Barra de cumplimiento: proporción de retornos marcados sobre salidas
            pct = round(marcadas * 100 / salidas) if salidas else 0
            color_barra = '#059669' if faltan == 0 else ('#d97706' if pct >= 50 else '#dc2626')
            filas_marcaciones += (
                f'<tr style="background:{"#ffffff" if faltan == 0 else "#fff7ed"};">'
                + celda(p['nombre'], 'font-size:13px;color:#111827;')
                + celda(p['zona'] or '<span style="color:#dc2626;">sin zona</span>',
                        'font-size:11px;color:#6b7280;white-space:nowrap;')
                + celda(salidas, 'font-size:12px;color:#6b7280;text-align:center;')
                + celda(f'<strong style="color:{color_barra};">{marcadas}</strong>',
                        'font-size:12px;text-align:center;')
                + celda(
                    f'<strong style="color:#dc2626;">{faltan}</strong>' if faltan
                    else '<span style="color:#059669;">0</span>',
                    'font-size:12px;text-align:center;')
                + celda(
                    f'<div style="background:#e5e7eb;border-radius:3px;height:6px;width:100%;">'
                    f'<div style="background:{color_barra};height:6px;border-radius:3px;width:{pct}%;"></div>'
                    f'</div>'
                    f'<div style="font-size:10px;color:#9ca3af;margin-top:2px;">{pct}%</div>',
                    'min-width:90px;')
                + '</tr>'
            )

        # ── Días sin marcar ──
        bloque_sin_marcar = ''
        if self.sin_marcar:
            items = ''.join(
                f'<tr>'
                f'<td style="padding:5px 10px;font-size:13px;color:#111827;">{p["nombre"]}</td>'
                f'<td style="padding:5px 10px;font-size:13px;color:#6b7280;text-align:right;'
                f'white-space:nowrap;">{p["dias_sin_marcar"]} de {p["dias_con_salida"]} días</td>'
                f'</tr>'
                for p in self.sin_marcar
            )
            bloque_sin_marcar = (
                f'<div style="margin-top:22px;padding:14px 16px;background:#f9fafb;'
                f'border-left:4px solid #6b7280;border-radius:6px;">'
                f'<div style="font-size:14px;font-weight:700;color:#374151;margin-bottom:2px;">'
                f'❌ No marcaron el retorno ({len(self.sin_marcar)})</div>'
                f'<div style="font-size:12px;color:#6b7280;margin-bottom:8px;">'
                f'Días en que registraron su salida pero no marcaron al volver. '
                f'Sin la segunda marcación no hay tiempo que medir.</div>'
                f'<table style="width:100%;border-collapse:collapse;">{items}</table>'
                f'</div>'
            )

        # ── Evolución diaria ──
        filas_dia = ''
        for d in self.por_dia:
            f = d['fecha']
            filas_dia += (
                '<tr>'
                + celda(f'{DIAS[f.weekday()].capitalize()} {f.day}/{f.month}',
                        'font-size:12px;color:#374151;white-space:nowrap;')
                + celda(d['salidas'], 'font-size:12px;color:#6b7280;text-align:center;')
                + celda(d['retornos'], 'font-size:12px;color:#6b7280;text-align:center;')
                + celda(d['excedidos'],
                        f'font-size:12px;text-align:center;font-weight:600;'
                        f'color:{"#dc2626" if d["excedidos"] else "#6b7280"};')
                + celda(horas_min(d['exceso_total']), 'font-size:12px;color:#6b7280;white-space:nowrap;')
                + '</tr>'
            )

        limite_txt = (f"{self.permitidos} minutos"
                      + (f" + {self.tolerancia} de tolerancia" if self.tolerancia else " (límite estricto)"))

        # Aviso destacado de marcaciones faltantes: sin la segunda marcación no se
        # puede medir el tiempo de ese día, así que es el dato que más urge corregir.
        pct = self.pct_marcacion
        if self.total_sin_marcar:
            aviso_marcaciones = (
                f'<div style="margin:14px 0 4px;padding:12px 16px;background:#fef2f2;'
                f'border-left:4px solid #dc2626;border-radius:6px;">'
                f'<div style="font-size:13px;font-weight:700;color:#dc2626;">'
                f'⚠️ Faltaron {self.total_sin_marcar} marcaciones de retorno esta semana</div>'
                f'<div style="font-size:12px;color:#6b7280;margin-top:3px;">'
                f'Se registraron {self.total_salidas} salidas a almuerzo y solo '
                f'{self.total_marcadas} retornos ({pct}%). En los días sin segunda marcación '
                f'no hay tiempo que medir, así que ese almuerzo no entra en el acumulado.</div>'
                f'</div>'
            )
        elif self.total_salidas:
            aviso_marcaciones = (
                f'<div style="margin:14px 0 4px;padding:12px 16px;background:#ecfdf5;'
                f'border-left:4px solid #059669;border-radius:6px;">'
                f'<div style="font-size:13px;font-weight:700;color:#059669;">'
                f'✅ Todas las salidas tienen su marcación de retorno</div>'
                f'<div style="font-size:12px;color:#6b7280;margin-top:3px;">'
                f'{self.total_marcadas} de {self.total_salidas} salidas con retorno marcado.</div>'
                f'</div>'
            )
        else:
            aviso_marcaciones = ''

        if self.hay_inferidos:
            nota_inferidos = (
                '<p style="margin:16px 0 0;font-size:11px;color:#9ca3af;line-height:1.5;">'
                'Las filas marcadas <strong>(inferido)</strong> incluyen días reconstruidos a partir '
                'de segundas marcaciones registradas antes de que existiera el control de tiempo. '
                'Sirven como referencia de tendencia, no como medición en vivo.</p>'
            )
        else:
            excluidas = self.inferidos_excluidos
            nota_inferidos = (
                f'<p style="margin:16px 0 0;font-size:11px;color:#9ca3af;line-height:1.5;">'
                f'Se excluyeron <strong>{excluidas}</strong> día-persona del histórico reconstruido '
                f'(anteriores al control de tiempo): contienen segundas marcaciones que no eran '
                f'retornos de almuerzo y distorsionarían el acumulado.</p>'
            ) if excluidas else ''

        sin_datos = (
            '<tr><td colspan="8" style="padding:24px;text-align:center;color:#059669;font-size:13px;">'
            'Ninguna persona excedió el tiempo permitido esta semana.</td></tr>'
        )

        return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#f3f4f6;">
<div style="max-width:860px;margin:0 auto;padding:24px 16px;font-family:'Segoe UI',Arial,sans-serif;">

  <div style="background:#0f172a;padding:20px 24px;border-radius:10px 10px 0 0;">
    <div style="font-size:11px;color:#38bdf8;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;">
      DETCUADOR S.A. — Sistema de Comedor
    </div>
    <div style="font-size:21px;color:#f1f5f9;font-weight:800;margin-top:4px;">
      Resumen semanal de tiempo de almuerzo
    </div>
    <div style="font-size:13px;color:#94a3b8;margin-top:4px;">
      {fecha_larga(self.desde)} &nbsp;→&nbsp; {fecha_larga(self.hasta)}
    </div>
  </div>

  <div style="background:#ffffff;padding:20px 24px;border:1px solid #e5e7eb;border-top:none;">

    <table style="width:100%;border-collapse:separate;border-spacing:6px 0;margin-bottom:6px;">
      <tr>
        {tarjeta(horas_min(self.exceso_total_semana), 'Tiempo de más', '#dc2626')}
        {tarjeta(len(self.con_exceso), 'Personas', '#ea580c')}
        {tarjeta(self.dias_excedidos_semana, 'Días excedidos', '#d97706')}
        {tarjeta(f'{self.total_marcadas}/{self.total_salidas}', 'Retornos marcados', '#0369a1')}
        {tarjeta(self.total_sin_marcar, 'Marcaciones faltantes',
                 '#dc2626' if self.total_sin_marcar else '#059669')}
      </tr>
    </table>

    {aviso_marcaciones}
    <p style="margin:10px 0 18px;font-size:12px;color:#6b7280;">
      Acumulado de <strong>{self.dias} días</strong> ({self.rango_texto()}).
      Tiempo concedido por día: <strong>{limite_txt}</strong>.
      El tiempo de más es la suma de todos los minutos que cada persona pasó
      del límite en la semana.
    </p>

    <h3 style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111827;">
      Tiempo de más acumulado por persona
    </h3>
    <table style="width:100%;border-collapse:collapse;">
      {encabezados(['#', 'Colaborador', 'Zona', 'Tiempo de más', 'Días excedidos', 'Marcó', 'Peor día', 'Promedio'])}
      {filas_exceso or sin_datos}
    </table>

    <h3 style="margin:24px 0 4px;font-size:14px;font-weight:700;color:#111827;">
      Marcaciones de retorno por persona
    </h3>
    <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">
      Días que cada persona salió a almorzar y en cuántos marcó su regreso.
      Los que tienen marcaciones faltantes aparecen primero.
    </p>
    <table style="width:100%;border-collapse:collapse;">
      {encabezados(['Colaborador', 'Zona', 'Salidas', 'Marcó', 'Faltan', 'Cumplimiento'])}
      {filas_marcaciones or '<tr><td colspan="6" style="padding:18px;text-align:center;color:#9ca3af;font-size:13px;">Sin salidas registradas en el rango</td></tr>'}
    </table>

    {bloque_sin_marcar}

    <h3 style="margin:22px 0 8px;font-size:14px;font-weight:700;color:#111827;">
      Evolución de la semana
    </h3>
    <table style="width:100%;border-collapse:collapse;">
      {encabezados(['Día', 'Salidas', 'Retornos', 'Excedidos', 'Tiempo de más'])}
      {filas_dia or '<tr><td colspan="5" style="padding:18px;text-align:center;color:#9ca3af;font-size:13px;">Sin datos en el rango</td></tr>'}
    </table>

    {nota_inferidos}
  </div>

  <div style="background:#f9fafb;padding:12px 24px;border:1px solid #e5e7eb;border-top:none;
              border-radius:0 0 10px 10px;font-size:11px;color:#9ca3af;">
    Generado automáticamente el {datetime.now().strftime('%d/%m/%Y a las %H:%M')}.
    El detalle día por día está en el panel de administración, sección Almuerzos.
    Se adjunta el acumulado en CSV.
  </div>

</div></body></html>"""


def main() -> int:
    parser = argparse.ArgumentParser(description='Reporte semanal acumulado de tiempo de almuerzo')
    parser.add_argument('--hasta', help='Último día de la semana a reportar (YYYY-MM-DD). Por defecto hoy.')
    parser.add_argument('--dias', type=int, default=DIAS_SEMANA_POR_DEFECTO,
                        help=f'Tamaño de la ventana en días (por defecto {DIAS_SEMANA_POR_DEFECTO}).')
    parser.add_argument('--to', help='Destinatarios separados por coma (ignora la configuración).')
    parser.add_argument('--dry-run', action='store_true', help='No envía: imprime y guarda el HTML.')
    parser.add_argument('--forzar', action='store_true',
                        help='Envía aunque almuerzo_email_activo esté en false.')
    parser.add_argument('--incluir-inferidos', action='store_true',
                        help='Incluye los días reconstruidos del histórico (origen BACKFILL). '
                             'Por defecto se excluyen: contienen retornos que no eran retornos.')
    args = parser.parse_args()

    if args.hasta:
        try:
            hasta = datetime.strptime(args.hasta, '%Y-%m-%d').date()
        except ValueError:
            print(f"❌ Fecha inválida: {args.hasta} (se espera YYYY-MM-DD)")
            return 1
    else:
        hasta = date.today()

    if args.dias < 1 or args.dias > 60:
        print("❌ --dias debe estar entre 1 y 60")
        return 1

    try:
        db = Database()
    except Exception as e:
        print(f"❌ No se pudo conectar a la base de datos: {e}")
        return 1

    reporte = ReporteSemanal(db, hasta, args.dias, incluir_inferidos=args.incluir_inferidos)

    activo = str(reporte.config.get('almuerzo_email_activo', 'true')).lower() == 'true'
    if not activo and not args.forzar and not args.dry_run:
        print("⏸️  almuerzo_email_activo está en false: no se envía. Usa --forzar para omitirlo.")
        return 0

    if args.to:
        destinos = [d.strip() for d in args.to.split(',') if d.strip()]
    else:
        crudo = (reporte.config.get('almuerzo_email_destinos_semanal')
                 or reporte.config.get('almuerzo_email_destinos')
                 or os.getenv('EMAIL_DESTINO', ''))
        destinos = [d.strip() for d in str(crudo).split(',') if d.strip()]

    if not destinos:
        print("❌ Sin destinatarios: define almuerzo_email_destinos en la configuración.")
        return 1

    return 0 if enviar(reporte, destinos, dry_run=args.dry_run) else 1


if __name__ == "__main__":
    sys.exit(main())
