/**
 * API del control de tiempo de almuerzo.
 * Montado en /api/almuerzos (ver server.js). Todas las rutas exigen token de admin.
 */
const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const almuerzoRepo = require('../repositories/almuerzoRepository');
const { checkAuth } = require('../utils/authAdmin');
const { logError } = require('../utils/logger');

const ETIQUETA_ESTADO = {
    A_TIEMPO: 'A tiempo',
    EXCEDIDO: 'Excedió el tiempo',
    EN_ALMUERZO: 'En almuerzo',
    EXCEDIDO_EN_CURSO: 'Sin marcar (tiempo vencido)',
    SIN_RETORNO: 'No marcó retorno',
};

/** Segundos -> "32:07". Null cuando no hay dato. */
function formatearDuracion(segundos) {
    if (segundos === null || segundos === undefined) return null;
    const s = Number(segundos);
    if (!Number.isFinite(s) || s < 0) return null;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** TIME de MySQL ('12:45:49') -> 'HH:MM'. */
function formatearHora(valor) {
    if (!valor) return null;
    return String(valor).slice(0, 5);
}

/** Fecha de MySQL (Date o string) -> 'YYYY-MM-DD', sin desfase de zona horaria. */
function formatearFecha(valor) {
    if (!valor) return null;
    if (valor instanceof Date) {
        const mes = String(valor.getMonth() + 1).padStart(2, '0');
        const dia = String(valor.getDate()).padStart(2, '0');
        return `${valor.getFullYear()}-${mes}-${dia}`;
    }
    return String(valor).slice(0, 10);
}

function serializar(fila) {
    return {
        id: fila.id,
        userId: fila.user_id,
        nombre: fila.nombre,
        fecha: formatearFecha(fila.fecha),
        horaSalida: formatearHora(fila.hora_salida),
        horaRetorno: formatearHora(fila.hora_retorno),
        segundos: fila.segundos === null ? null : Number(fila.segundos),
        duracion: formatearDuracion(fila.segundos),
        estado: fila.estado_efectivo,
        estadoLabel: ETIQUETA_ESTADO[fila.estado_efectivo] || fila.estado_efectivo,
        tipoTicket: fila.tipo_ticket,
        numeroTicket: fila.numero_ticket,
        cierreManual: fila.cierre_manual === 1,
        observacion: fila.observacion,
        // BIOMETRICO = medido en vivo; BACKFILL = inferido del histórico (migración 005)
        origen: fila.origen || 'BIOMETRICO',
    };
}

// ── GET /api/almuerzos ─────────────────────────────────────────────────────
// Listado paginado. Filtros: fecha | desde+hasta, estado, q (nombre o ID).
router.get('/', checkAuth('admin'), async (req, res) => {
    try {
        const resultado = await almuerzoRepo.listar(req.query);
        res.json({
            data: resultado.data.map(serializar),
            total: resultado.total,
            page: resultado.page,
            pageSize: resultado.pageSize,
        });
    } catch (error) {
        logError('almuerzos/listar', error, req);
        res.status(500).json({ error: 'Error interno del servidor. Contacta al administrador.' });
    }
});

// ── GET /api/almuerzos/resumen ─────────────────────────────────────────────
router.get('/resumen', checkAuth('admin'), async (req, res) => {
    try {
        const resumen = await almuerzoRepo.resumen(req.query);
        res.json({
            ...resumen,
            promedioDuracion: formatearDuracion(resumen.promedioSegundos),
            maximoDuracion: formatearDuracion(resumen.maximoSegundos),
        });
    } catch (error) {
        logError('almuerzos/resumen', error, req);
        res.status(500).json({ error: 'Error interno del servidor. Contacta al administrador.' });
    }
});

// ── GET /api/almuerzos/excel ───────────────────────────────────────────────
router.get('/excel', checkAuth('admin'), async (req, res) => {
    try {
        const filas = await almuerzoRepo.listarRango(req.query);
        const resumen = await almuerzoRepo.resumen(req.query);
        const { desde, hasta } = resumen;

        const wb = new ExcelJS.Workbook();
        wb.creator = 'SIGAC — DETCUADOR S.A.';
        wb.created = new Date();

        const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        const HEADER_FONT = { bold: true, color: { argb: 'FF94A3B8' }, size: 10 };
        const COLOR_ESTADO = {
            A_TIEMPO:          'FFD1FAE5',
            EXCEDIDO:          'FFFEE2E2',
            EN_ALMUERZO:       'FFFEF3C7',
            EXCEDIDO_EN_CURSO: 'FFFFE4E6',
            SIN_RETORNO:       'FFE5E7EB',
        };

        // ── Hoja 1: detalle ──
        const ws = wb.addWorksheet('Control de Almuerzo');
        ws.columns = [
            { header: 'Fecha',        key: 'fecha',    width: 12 },
            { header: 'ID',           key: 'id',       width: 8 },
            { header: 'Colaborador',  key: 'nombre',   width: 38 },
            { header: 'Ticket',       key: 'ticket',   width: 9 },
            { header: 'Salida',       key: 'salida',   width: 10 },
            { header: 'Retorno',      key: 'retorno',  width: 10 },
            { header: 'Tiempo (min)', key: 'duracion', width: 13 },
            { header: 'Estado',       key: 'estado',   width: 28 },
            { header: 'Origen',       key: 'origen',   width: 12 },
            { header: 'Observación',  key: 'obs',      width: 34 },
        ];
        const encabezado = ws.getRow(1);
        encabezado.eachCell(celda => { celda.fill = HEADER_FILL; celda.font = HEADER_FONT; });
        encabezado.height = 22;
        ws.views = [{ state: 'frozen', ySplit: 1 }];

        filas.map(serializar).forEach(f => {
            const fila = ws.addRow({
                fecha: f.fecha,
                id: f.userId,
                nombre: f.nombre,
                ticket: f.numeroTicket ?? '—',
                salida: f.horaSalida ?? '—',
                retorno: f.horaRetorno ?? '—',
                duracion: f.duracion ?? '—',
                estado: f.estadoLabel + (f.cierreManual ? ' (cierre manual)' : ''),
                origen: f.origen === 'BACKFILL' ? 'Inferido' : 'Biométrico',
                obs: f.observacion ?? '',
            });
            const color = COLOR_ESTADO[f.estado];
            if (color) {
                fila.getCell('estado').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
            }
        });

        // ── Hoja 2: resumen ──
        const wsR = wb.addWorksheet('Resumen');
        wsR.columns = [
            { header: 'Concepto', key: 'concepto', width: 40 },
            { header: 'Valor',    key: 'valor',    width: 18 },
        ];
        const encabezadoR = wsR.getRow(1);
        encabezadoR.eachCell(celda => { celda.fill = HEADER_FILL; celda.font = HEADER_FONT; });
        [
            ['Rango', desde === hasta ? desde : `${desde} a ${hasta}`],
            ['Minutos permitidos', resumen.minutosPermitidos + (resumen.toleranciaMinutos ? ` (+${resumen.toleranciaMinutos} tolerancia)` : ' (estricto)')],
            ['Salidas registradas', resumen.salidas],
            ['Retornos marcados', resumen.retornos],
            ['Cumplieron el tiempo', resumen.aTiempo],
            ['Excedieron el tiempo', resumen.excedidos],
            ['Sin marcar retorno', resumen.sinMarcar],
            ['En almuerzo (en curso)', resumen.enAlmuerzo],
            ['Promedio de los que retornaron', formatearDuracion(resumen.promedioSegundos) ?? '—'],
            ['Tiempo máximo registrado', formatearDuracion(resumen.maximoSegundos) ?? '—'],
        ].forEach(([concepto, valor]) => wsR.addRow({ concepto, valor }));

        const nombreArchivo = desde === hasta
            ? `control_almuerzo_${desde}.xlsx`
            : `control_almuerzo_${desde}_a_${hasta}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
        await wb.xlsx.write(res);
        res.end();
    } catch (error) {
        logError('almuerzos/excel', error, req);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error generando el reporte.' });
        } else {
            res.end();
        }
    }
});

// ── POST /api/almuerzos/:id/cerrar-manual ──────────────────────────────────
// Corrige una sesión sin retorno (alguien olvidó marcar). Solo superadmin.
router.post('/:id/cerrar-manual', checkAuth('superadmin'), async (req, res) => {
    try {
        const { horaRetorno, observacion } = req.body || {};
        const resultado = await almuerzoRepo.cerrarManual(req.params.id, {
            horaRetorno,
            observacion: typeof observacion === 'string' ? observacion.slice(0, 200) : null,
            adminNombre: req.adminUser?.nombre,
        });
        if (!resultado.ok) {
            return res.status(400).json({ error: resultado.motivo });
        }
        res.json({
            success: true,
            estado: resultado.estado,
            duracion: formatearDuracion(resultado.segundos),
        });
    } catch (error) {
        logError('almuerzos/cerrar-manual', error, req);
        res.status(500).json({ error: 'Error interno del servidor. Contacta al administrador.' });
    }
});

module.exports = router;
