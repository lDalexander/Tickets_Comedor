const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { logError } = require('../utils/logger');
const pool = db.pool.promise();
const { exec } = require('child_process');
const path = require('path');
const fs   = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');

const JWT_SECRET = process.env.ADMIN_JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL: ADMIN_JWT_SECRET no configurada. El servidor no puede arrancar.');
    process.exit(1);
}

// --- MIDDLEWARE DE AUTENTICACIÓN ---
const checkAuth = (level) => (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.adminUser = decoded;
            if (level === 'superadmin' && decoded.rol !== 'superadmin') {
                return res.status(403).json({ error: 'Se requiere acceso superadmin' });
            }
            return next();
        } catch {
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }
    }

    return res.status(403).json({ error: 'Unauthorized Access' });
};

// --- LOGIN JWT ---
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Credenciales requeridas' });
    }
    try {
        const [rows] = await pool.query(
            "SELECT * FROM usuarios_impresion_manual WHERE username = ? AND activo = 1",
            [username]
        );
        if (rows.length === 0) {
            // Mensaje genérico: no revelar si el usuario existe
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }
        const user = rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }
        // El acceso al panel requiere el permiso 'admin' o 'superadmin'.
        const permisos = String(user.permisos || '').split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
        const esSuperadmin = permisos.includes('superadmin');
        if (!permisos.includes('admin') && !esSuperadmin) {
            return res.status(401).json({ error: 'Usuario sin permisos de administrador' });
        }
        const rolToken = esSuperadmin ? 'superadmin' : 'admin';
        const token = jwt.sign(
            { id: user.id, nombre: user.nombre_real, rol: rolToken, permisos },
            JWT_SECRET,
            { expiresIn: '8h' }
        );
        logger.info(`Admin login: ${user.username} (ID: ${user.id})`);
        res.json({ success: true, token, user: { id: user.id, nombre: user.nombre_real, rol: rolToken, permisos } });
    } catch (error) {
        logger.error('Admin login error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// --- RUTAS ADMIN ---

router.get('/tables', checkAuth('admin'), async (req, res) => {
    try {
        const [rows] = await pool.query('SHOW TABLES');
        res.json(rows.map(r => Object.values(r)[0]));
    } catch (error) {
        logError('admin/tables', error, req);
        res.status(500).json({ error: 'Error interno del servidor. Contacta al administrador.' });
    }
});

router.get('/schema/:table', checkAuth('admin'), async (req, res) => {
    try {
        const [rows] = await pool.query(`DESCRIBE ??`, [req.params.table]);
        res.json(rows);
    } catch (error) {
        logError('admin/schema', error, req);
        res.status(500).json({ error: 'Error interno del servidor. Contacta al administrador.' });
    }
});

router.get('/data/:table', checkAuth('admin'), async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT * FROM ?? ORDER BY 1 DESC LIMIT 2000`,
            [req.params.table]
        );
        res.json(rows);
    } catch (error) {
        logError('admin/data GET', error, req);
        res.status(500).json({ error: 'Error interno del servidor. Contacta al administrador.' });
    }
});

router.put('/data/:table/:pk/:val', checkAuth('admin'), async (req, res) => {
    try {
        const { table, pk, val } = req.params;
        const updates = req.body;

        if (table === 'usuarios_impresion_manual' && updates.password_hash) {
            if (updates.password_hash.length < 50) {
                updates.password_hash = await bcrypt.hash(updates.password_hash, 10);
            }
        }

        if (Object.keys(updates).length === 0) return res.json({ success: true });

        const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = Object.values(updates);
        await pool.query(`UPDATE ?? SET ${setClause} WHERE ?? = ?`, [table, ...values, pk, val]);
        res.json({ success: true });
    } catch (error) {
        logError('admin/data PUT', error, req);
        res.status(500).json({ error: 'Error interno del servidor. Contacta al administrador.' });
    }
});

router.delete('/data/:table/:pk/:val', checkAuth('admin'), async (req, res) => {
    try {
        const { table, pk, val } = req.params;
        // Un SUPER ADMIN no se puede borrar desde el panel (solo desde la BD).
        if (table === 'usuarios_impresion_manual') {
            const [rows] = await pool.query(`SELECT permisos FROM usuarios_impresion_manual WHERE ?? = ?`, [pk, val]);
            const permisos = String(rows[0]?.permisos || '').split(',').map(p => p.trim().toLowerCase());
            if (permisos.includes('superadmin')) {
                return res.status(403).json({ error: 'No se puede eliminar un SUPER ADMIN desde el panel. Hazlo directamente en la base de datos.' });
            }
        }
        await pool.query(`DELETE FROM ?? WHERE ?? = ?`, [table, pk, val]);
        res.json({ success: true });
    } catch (error) {
        logError('admin/data DELETE', error, req);
        res.status(500).json({ error: 'Error interno del servidor. Contacta al administrador.' });
    }
});

router.post('/data/:table', checkAuth('admin'), async (req, res) => {
    try {
        const { table } = req.params;
        const data = req.body;

        if (table === 'usuarios_impresion_manual' && data.password_hash) {
            data.password_hash = await bcrypt.hash(data.password_hash, 10);
        }

        const cols = Object.keys(data).join(', ');
        const placeholders = Object.keys(data).map(() => '?').join(', ');
        await pool.query(`INSERT INTO ?? (${cols}) VALUES (${placeholders})`, [table, ...Object.values(data)]);
        res.json({ success: true });
    } catch (error) {
        logError('admin/data POST', error, req);
        res.status(500).json({ error: 'Error interno del servidor. Contacta al administrador.' });
    }
});

router.post('/reprint', checkAuth('admin'), async (req, res) => {
    try {
        const { name, date, time, type, ticket_number } = req.body;
        if (!name || !date || !time || !type || !ticket_number) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const pythonScript = path.resolve(__dirname, '../python_core/reprint_ticket.py');
        const venvPython = path.resolve(__dirname, '../python_core/venv/bin/python');
        const args = [
            '--name', `"${name}"`,
            '--date', `"${date}"`,
            '--time', `"${time}"`,
            '--type', `"${type}"`,
            '--ticket_number', `"${ticket_number}"`
        ].join(' ');
        const command = `"${venvPython}" "${pythonScript}" ${args}`;
        logger.info(`Executing reprint: ${command}`);
        exec(command, (error, stdout, stderr) => {
            if (error) {
                logger.error(`Reprint Error: ${error.message}`, { stderr });
                return res.status(500).json({ error: 'Error al reimprimir el ticket. Revisa los logs.' });
            }
            if (stderr) logger.warn(`Reprint Stderr: ${stderr}`);
            res.json({ success: true, message: 'Ticket sent to printer' });
        });
    } catch (error) {
        logError('admin/reprint', error, req);
        res.status(500).json({ error: 'Error interno del servidor. Contacta al administrador.' });
    }
});

// ── REPORTE EXCEL COMPLETO (Admin) ─────────────────────────────────────────
// Genera un .xlsx con 3 hojas:
//   1. Registros  — todos los eventos (incluyendo duplicados) con ZK ID
//   2. Resumen    — totales por tipo y por día
//   3. Auditoría  — log_tickets_manuales con nombre del operador
router.get('/report/excel', checkAuth('admin'), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Rango de fechas: si no se provee, usar el día de hoy
        const desde = startDate || new Date().toISOString().slice(0, 10);
        const hasta = endDate   || new Date().toISOString().slice(0, 10);

        // ── 1. Todos los registros del rango (incluyendo duplicados) ──
        const registros = await db.query(
            `SELECT r.id, r.user_id, r.nombre, r.fecha, r.hora,
                    r.descripcion, r.numero_ticket
             FROM registros r
             WHERE r.fecha BETWEEN ? AND ?
             ORDER BY r.fecha ASC, r.hora ASC`,
            [desde, hasta]
        );

        // ── 2. Totales por tipo ──
        const totalesTipo = await db.query(
            `SELECT descripcion as tipo, COUNT(*) as total
             FROM registros
             WHERE fecha BETWEEN ? AND ?
             GROUP BY descripcion
             ORDER BY total DESC`,
            [desde, hasta]
        );

        // ── 3. Totales por día ──
        const totalesDia = await db.query(
            `SELECT fecha, COUNT(*) as total_registros,
                    SUM(descripcion NOT IN ('INTENTO DE DUPLICADO','Intento de Duplicado')) as total_validos,
                    SUM(descripcion IN ('INTENTO DE DUPLICADO','Intento de Duplicado'))     as total_duplicados
             FROM registros
             WHERE fecha BETWEEN ? AND ?
             GROUP BY fecha
             ORDER BY fecha ASC`,
            [desde, hasta]
        );

        // ── 4. Auditoría de tickets manuales ──
        const auditoria = await db.query(
            `SELECT l.id, l.nombre_visitante, l.fecha_impresion,
                    COALESCE(u.nombre_real, CONCAT('ID ',l.impreso_por_usuario_id)) AS operador
             FROM log_tickets_manuales l
             LEFT JOIN usuarios_impresion_manual u ON u.id = l.impreso_por_usuario_id
             WHERE DATE(l.fecha_impresion) BETWEEN ? AND ?
             ORDER BY l.fecha_impresion ASC`,
            [desde, hasta]
        );

        // ── Crear workbook ──────────────────────────────────────────────
        const wb = new ExcelJS.Workbook();
        wb.creator = 'SIGAC — DETCUADOR S.A.';
        wb.created = new Date();

        // Paleta de colores por tipo de ticket
        const COLOR_TIPO = {
            'TICKET ALMUERZO':        { fgColor: { argb: 'FFE0F0FF' } },
            'Ticket Almuerzo':        { fgColor: { argb: 'FFE0F0FF' } },
            'TICKET DIETA':           { fgColor: { argb: 'FFD1FAE5' } },
            'Ticket Dieta':           { fgColor: { argb: 'FFD1FAE5' } },
            'TICKET GERENCIA':        { fgColor: { argb: 'FFEDE9FE' } },
            'TICKET EXTRA':           { fgColor: { argb: 'FFFEF3C7' } },
            'Ticket Extra':           { fgColor: { argb: 'FFFEF3C7' } },
            'TICKET VISITA':          { fgColor: { argb: 'FFFFF7ED' } },
            'TICKET TERCERO':         { fgColor: { argb: 'FFFCE7F3' } },
            'INTENTO DE DUPLICADO':   { fgColor: { argb: 'FFFEE2E2' } },
            'Intento de Duplicado':   { fgColor: { argb: 'FFFEE2E2' } },
        };

        const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        const HEADER_FONT = { bold: true, color: { argb: 'FF94A3B8' }, size: 10 };
        const BORDER_THIN = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };

        function applyHeaderRow(row) {
            row.eachCell(cell => {
                cell.fill = HEADER_FILL;
                cell.font = HEADER_FONT;
                cell.border = BORDER_THIN;
                cell.alignment = { vertical: 'middle' };
            });
            row.height = 22;
        }

        // ── Datos del administrador y timestamp ──────────────────────────
        const adminName = req.adminUser?.nombre || 'Administrador';
        const ahora = new Date().toLocaleString('es-EC', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
        const LOGO_PATH = path.resolve(__dirname, '../assets/logo_sigac.png');

        // Inserta 6 filas de encabezado institucional en cualquier hoja
        function addReportHeader(ws, wb2, titulo) {
            // Primero addRow, LUEGO getRow para alturas — evita duplicar filas
            for (let i = 0; i < 6; i++) ws.addRow([]);

            ws.getRow(1).height = 50;
            ws.getRow(2).height = 18;
            ws.getRow(3).height = 18;
            ws.getRow(4).height = 18;
            ws.getRow(5).height = 18;
            ws.getRow(6).height = 8;

            // Logo — offset en EMUs (1 px = 9525 EMU) para control preciso de posición
            if (fs.existsSync(LOGO_PATH)) {
                const PX = 9525;
                const logoId = wb2.addImage({ filename: LOGO_PATH, extension: 'png' });
                ws.addImage(logoId, {
                    tl: {
                        nativeCol:    0,
                        nativeColOff: 25 * PX,   // ← píxeles desde borde izquierdo de col A
                        nativeRow:    0,
                        nativeRowOff: 17 * PX,   // ← píxeles desde borde superior de fila 1
                    },
                    ext: { width: 75, height: 75 },
                    editAs: 'oneCell',
                });
            }

            // Texto de identificación del reporte (columna C)
            ws.getCell('C1').value = 'SIGAC — Sistema de Gestión de Acceso al Comedor';
            ws.getCell('C1').font = { bold: true, size: 13, color: { argb: 'FF0F172A' } };
            ws.getCell('C1').alignment = { vertical: 'middle' };

            ws.getCell('C2').value = 'DETCUADOR S.A.';
            ws.getCell('C2').font = { bold: true, size: 10, color: { argb: 'FF475569' } };

            ws.getCell('C3').value = titulo;
            ws.getCell('C3').font = { italic: true, size: 10, color: { argb: 'FF64748B' } };

            ws.getCell('C4').value = `Período: ${desde}  al  ${hasta}`;
            ws.getCell('C4').font = { size: 10, color: { argb: 'FF475569' } };

            ws.getCell('C5').value = `Fecha de generación: ${ahora}   |   Generado por: ${adminName}`;
            ws.getCell('C5').font = { size: 10, color: { argb: 'FF475569' } };
        }

        // ═══════════════════════════════════════════════════════════════
        // HOJA 1 — Registros
        // ═══════════════════════════════════════════════════════════════
        const ws1 = wb.addWorksheet('Registros', { views: [{ state: 'frozen', ySplit: 7 }] });
        ws1.columns = [
            { key: 'id',            width: 8  },
            { key: 'user_id',       width: 10 },
            { key: 'nombre',        width: 32 },
            { key: 'fecha',         width: 14 },
            { key: 'hora',          width: 12 },
            { key: 'descripcion',   width: 26 },
            { key: 'numero_ticket', width: 12 },
            { key: 'estado',        width: 14 },
        ];

        addReportHeader(ws1, wb, 'Hoja 1 — Registros Completos (incluye intentos de duplicado)');

        applyHeaderRow(ws1.addRow(['ID', 'ZK ID', 'Colaborador', 'Fecha', 'Hora', 'Tipo', 'N° Ticket', 'Estado']));

        registros.forEach(r => {
            const esDuplicado = r.descripcion.toLowerCase().includes('duplicado');
            const row = ws1.addRow({
                id:            r.id,
                user_id:       r.user_id,
                nombre:        r.nombre,
                fecha:         r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : r.fecha,
                hora:          typeof r.hora === 'object' && r.hora !== null
                                    ? String(r.hora).slice(0, 8)
                                    : String(r.hora || '').slice(0, 8),
                descripcion:   r.descripcion,
                numero_ticket: r.numero_ticket ?? '—',
                estado:        esDuplicado ? 'Bloqueado' : 'Exitoso',
            });

            const fill = COLOR_TIPO[r.descripcion];
            if (fill) {
                row.eachCell(cell => {
                    cell.fill = { type: 'pattern', pattern: 'solid', ...fill };
                    cell.border = BORDER_THIN;
                });
            } else {
                row.eachCell(cell => { cell.border = BORDER_THIN; });
            }

            // Color del texto para la columna Estado
            const estadoCell = row.getCell('estado');
            estadoCell.font = { color: { argb: esDuplicado ? 'FFEF4444' : 'FF10B981' }, bold: true };
        });

        // Fila de totales al final
        const totalRow = ws1.addRow({
            id: '', user_id: '', nombre: `TOTAL: ${registros.length} registros`,
            fecha: '', hora: '', descripcion: '', numero_ticket: '', estado: '',
        });
        totalRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
            cell.font = { bold: true, color: { argb: 'FF38BDF8' } };
            cell.border = BORDER_THIN;
        });

        // ═══════════════════════════════════════════════════════════════
        // HOJA 2 — Resumen
        // ═══════════════════════════════════════════════════════════════
        const ws2 = wb.addWorksheet('Resumen');

        addReportHeader(ws2, wb, 'Hoja 2 — Resumen Estadístico');

        ws2.addRow([]);

        // Sub-título: por tipo
        ws2.addRow(['Totales por tipo de ticket']).eachCell(c => {
            c.font = { bold: true, size: 11 };
        });

        const hdrTipo = ws2.addRow(['Tipo de Ticket', 'Cantidad', '% del total']);
        applyHeaderRow(hdrTipo);
        ws2.getColumn(1).width = 30;
        ws2.getColumn(2).width = 14;
        ws2.getColumn(3).width = 16;

        const totalGeneral = totalesTipo.reduce((s, t) => s + Number(t.total), 0);
        totalesTipo.forEach(t => {
            const pct = totalGeneral > 0 ? ((t.total / totalGeneral) * 100).toFixed(1) + '%' : '0%';
            const row = ws2.addRow([t.tipo, Number(t.total), pct]);
            row.eachCell(cell => { cell.border = BORDER_THIN; });
        });

        // Fila total
        const totRow = ws2.addRow(['TOTAL', totalGeneral, '100%']);
        totRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
            cell.font = { bold: true };
            cell.border = BORDER_THIN;
        });

        ws2.addRow([]);

        // Sub-título: por día
        ws2.addRow(['Totales por día']).eachCell(c => {
            c.font = { bold: true, size: 11 };
        });

        const hdrDia = ws2.addRow(['Fecha', 'Total Registros', 'Tickets Válidos', 'Duplicados']);
        applyHeaderRow(hdrDia);

        totalesDia.forEach(d => {
            const row = ws2.addRow([
                d.fecha instanceof Date ? d.fecha.toISOString().slice(0, 10) : d.fecha,
                Number(d.total_registros),
                Number(d.total_validos),
                Number(d.total_duplicados),
            ]);
            row.eachCell(cell => { cell.border = BORDER_THIN; });
        });

        // ═══════════════════════════════════════════════════════════════
        // HOJA 3 — Auditoría de Impresiones Manuales
        // ═══════════════════════════════════════════════════════════════
        const ws3 = wb.addWorksheet('Auditoría Manual', { views: [{ state: 'frozen', ySplit: 7 }] });
        ws3.columns = [
            { key: 'id',               width: 8  },
            { key: 'nombre_visitante', width: 38 },
            { key: 'operador',         width: 24 },
            { key: 'fecha_impresion',  width: 22 },
        ];

        addReportHeader(ws3, wb, 'Hoja 3 — Auditoría de Impresiones Manuales');

        applyHeaderRow(ws3.addRow(['ID', 'Visitante / Beneficiario', 'Impreso por', 'Fecha y Hora']));

        auditoria.forEach(a => {
            const row = ws3.addRow({
                id:              a.id,
                nombre_visitante: a.nombre_visitante,
                operador:        a.operador,
                fecha_impresion: a.fecha_impresion
                                    ? new Date(a.fecha_impresion).toLocaleString('es-EC', {
                                        year: 'numeric', month: '2-digit', day: '2-digit',
                                        hour: '2-digit', minute: '2-digit'
                                      })
                                    : '—',
            });
            row.eachCell(cell => { cell.border = BORDER_THIN; });
        });

        if (auditoria.length === 0) {
            ws3.addRow({ id: '', nombre_visitante: 'Sin registros para el período seleccionado', operador: '', fecha_impresion: '' });
        }

        // ── Nombre del archivo con rango de fechas ──────────────────
        const filename = `reporte_admin_${desde}_a_${hasta}.xlsx`;

        const buffer = await wb.xlsx.writeBuffer();

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);

        logger.info(`Excel completo generado: ${filename} (${registros.length} registros, ${auditoria.length} manuales)`);

    } catch (error) {
        logError('admin/report/excel', error, req);
        res.status(500).json({ error: 'Error interno del servidor. Contacta al administrador.' });
    }
});

module.exports = router;
