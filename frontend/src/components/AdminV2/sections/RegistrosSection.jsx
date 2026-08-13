import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import axios from 'axios';
import { Printer, Calendar, Filter, CheckCircle, XCircle, Trash2, Edit2, X, Save, Download, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZES = [20, 50, 100, 250];

const fetcher = url => axios.get(url).then(r => r.data);

const TICKET_TYPES = [
    'TICKET ALMUERZO',
    'TICKET DIETA',
    'TICKET GERENCIA',
    'TICKET EXTRA',
    'TICKET VISITA',
    'TICKET TERCERO',
    'INTENTO DE DUPLICADO',
];

const TYPE_COLORS = {
    GERENCIA:   { bg: 'rgba(139,92,246,0.15)',  color: '#a78bfa', label: 'Gerencia'   },
    VISITA:     { bg: 'rgba(249,115,22,0.15)',   color: '#fb923c', label: 'Visita'     },
    DIETA:      { bg: 'rgba(16,185,129,0.15)',   color: '#6ee7b7', label: 'Dieta'      },
    EXTRA:      { bg: 'rgba(245,158,11,0.15)',   color: '#fbbf24', label: 'Extra'      },
    TERCERO:    { bg: 'rgba(244,114,182,0.15)',  color: '#f472b6', label: 'Tercero'    },
    DUPLICADO:  { bg: 'rgba(239,68,68,0.12)',    color: '#f87171', label: 'Duplicado'  },
    NORMAL:     { bg: 'rgba(56,189,248,0.15)',   color: '#7dd3fc', label: 'Normal'     },
};

function getBadge(type) {
    const t = (type || '').toUpperCase();
    if (t.includes('GERENCIA'))  return TYPE_COLORS.GERENCIA;
    if (t.includes('VISITA'))    return TYPE_COLORS.VISITA;
    if (t.includes('DIETA'))     return TYPE_COLORS.DIETA;
    if (t.includes('EXTRA'))     return TYPE_COLORS.EXTRA;
    if (t.includes('TERCERO'))   return TYPE_COLORS.TERCERO;
    if (t.includes('DUPLICADO')) return TYPE_COLORS.DUPLICADO;
    return TYPE_COLORS.NORMAL;
}

function formatTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) return timeStr || '—';
    try {
        return new Date(`${dateStr}T${timeStr}`).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
    } catch { return timeStr; }
}

// ──────────────────────────────────────────────────
// Modal de edición
// ──────────────────────────────────────────────────
function EditModal({ row, onClose, onSave }) {
    const [form, setForm] = useState({
        nombre:        row.user        || '',
        descripcion:   row.type        || '',
        numero_ticket: row.numero_ticket != null ? String(row.numero_ticket) : '',
        fecha:         row.date        || '',
        hora:          row.time        || '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            await onSave(row.id, form);
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            {/* Overlay */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.75)',
                    zIndex: 100,
                }}
            />
            {/* Panel */}
            <div style={{
                position: 'fixed',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '100%', maxWidth: '460px',
                background: '#1e293b',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '1rem',
                padding: '1.5rem',
                zIndex: 101,
                boxShadow: '0 25px 50px rgba(0,0,0,0.6)',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#f1f5f9' }}>
                            Editar Registro
                        </h3>
                        <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#475569' }}>
                            ID #{row.id}
                        </p>
                    </div>
                    <button onClick={onClose}
                        style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '4px' }}>
                        <X size={18} />
                    </button>
                </div>

                {/* Campos */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <Field label="Nombre / Colaborador">
                        <input value={form.nombre} onChange={e => set('nombre', e.target.value)} style={inputSt} />
                    </Field>

                    <Field label="Tipo de Ticket">
                        <select value={form.descripcion} onChange={e => set('descripcion', e.target.value)} style={inputSt}>
                            {TICKET_TYPES.map(t => (
                                <option key={t} value={t} style={{ background: '#1e293b' }}>{t}</option>
                            ))}
                        </select>
                    </Field>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <Field label="N° Ticket">
                            <input
                                type="number" min="1" value={form.numero_ticket}
                                onChange={e => set('numero_ticket', e.target.value)}
                                style={inputSt}
                            />
                        </Field>
                        <Field label="Hora">
                            <input
                                type="time" value={form.hora ? String(form.hora).slice(0, 5) : ''}
                                onChange={e => set('hora', e.target.value)}
                                style={inputSt}
                            />
                        </Field>
                    </div>

                    <Field label="Fecha">
                        <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} style={inputSt} />
                    </Field>
                </div>

                {error && (
                    <p style={{ margin: '0.75rem 0 0', color: '#fca5a5', fontSize: '0.82rem' }}>
                        {error}
                    </p>
                )}

                {/* Botones */}
                <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
                    <button onClick={onClose}
                        style={{ padding: '0.55rem 1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem' }}>
                        Cancelar
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        style={{ padding: '0.55rem 1.1rem', background: saving ? 'rgba(56,189,248,0.3)' : 'linear-gradient(135deg,#0ea5e9,#6366f1)', border: 'none', borderRadius: '0.5rem', color: 'white', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </div>
        </>
    );
}

function Field({ label, children }) {
    return (
        <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#64748b', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {label}
            </label>
            {children}
        </div>
    );
}

// ──────────────────────────────────────────────────
// Sección principal
// ──────────────────────────────────────────────────
export default function RegistrosSection({ authHeaders }) {
    const [dateRange, setDateRange]     = useState({ start: '', end: '' });
    const [typeFilter, setTypeFilter]   = useState('');
    const [reprintMsg, setReprintMsg]   = useState({});
    const [editingRow, setEditingRow]   = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [pageSize, setPageSize]       = useState(20);
    const [page, setPage]               = useState(1);

    // Al cambiar filtros o tamaño de página, volver a la página 1.
    useEffect(() => { setPage(1); }, [dateRange.start, dateRange.end, typeFilter, pageSize]);

    const handleDownloadExcel = async () => {
        setDownloading(true);
        try {
            const params = new URLSearchParams();
            if (dateRange.start) params.set('startDate', dateRange.start);
            if (dateRange.end)   params.set('endDate',   dateRange.end);

            const response = await fetch(`/api/admin/report/excel?${params}`, {
                headers: authHeaders,
            });

            if (!response.ok) {
                alert('Error al generar el reporte. Revisa los logs del servidor.');
                return;
            }

            const blob = await response.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');

            // Intentar obtener el nombre de archivo del header Content-Disposition
            const disp = response.headers.get('content-disposition') || '';
            const match = disp.match(/filename="?([^"]+)"?/);
            a.download = match ? match[1] : `reporte_admin_${dateRange.start || 'hoy'}_${dateRange.end || 'hoy'}.xlsx`;

            a.href = url;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            alert('Error de red al descargar el reporte.');
        } finally {
            setDownloading(false);
        }
    };

    const params = new URLSearchParams();
    if (dateRange.start) params.append('startDate', dateRange.start);
    if (dateRange.end)   params.append('endDate',   dateRange.end);
    if (typeFilter)      params.append('type',      typeFilter);
    params.append('page',     page);
    params.append('pageSize', pageSize);
    const qs = `?${params}`;

    const { data: resp, isLoading, mutate } = useSWR(
        `/api/stats/history${qs}`,
        fetcher,
        { keepPreviousData: true }
    );

    const records    = resp?.data ?? [];
    const total      = resp?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const firstItem  = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const lastItem   = Math.min(page * pageSize, total);

    // ── Reimprimir ────────────────────────────────
    const handleReprint = async (row) => {
        try {
            await axios.post('/api/admin/reprint', {
                name:          row.user,
                date:          row.date,
                time:          row.time,
                type:          row.type,
                ticket_number: row.numero_ticket,
            }, { headers: authHeaders });
            setReprintMsg(p => ({ ...p, [row.id]: 'ok' }));
        } catch {
            setReprintMsg(p => ({ ...p, [row.id]: 'err' }));
        } finally {
            setTimeout(() => setReprintMsg(p => {
                const n = { ...p }; delete n[row.id]; return n;
            }), 3000);
        }
    };

    // ── Guardar edición ───────────────────────────
    const handleSave = async (id, form) => {
        const payload = {
            nombre:        form.nombre,
            descripcion:   form.descripcion,
            numero_ticket: form.numero_ticket ? parseInt(form.numero_ticket) : null,
            fecha:         form.fecha,
            hora:          form.hora,
        };
        await axios.put(
            `/api/admin/data/registros/id/${id}`,
            payload,
            { headers: authHeaders }
        );
        mutate(); // refresca la lista
    };

    // ── Borrar ────────────────────────────────────
    const handleDelete = async (row) => {
        const label = `${row.user} — ${row.date} — ${row.type}`;
        if (!window.confirm(`¿Eliminar este registro?\n\n${label}\n\nEsta acción no se puede deshacer.`)) return;
        try {
            await axios.delete(
                `/api/admin/data/registros/id/${row.id}`,
                { headers: authHeaders }
            );
            mutate(); // refresca la lista
        } catch {
            alert('Error al eliminar el registro');
        }
    };

    return (
        <div>
            {/* Filtros */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center',
                marginBottom: '1.25rem', padding: '0.9rem 1.1rem',
                background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '0.75rem',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Calendar size={14} color="#64748b" />
                    <input type="date" value={dateRange.start}
                        onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))}
                        style={filterInputSt} />
                    <span style={{ color: '#475569', fontSize: '0.8rem' }}>a</span>
                    <input type="date" value={dateRange.end}
                        onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))}
                        style={filterInputSt} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Filter size={14} color="#64748b" />
                    <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={filterInputSt}>
                        <option value="">Todos los tipos</option>
                        <option value="normal">Normal</option>
                        <option value="dieta">Dieta</option>
                        <option value="gerencia">Gerencia</option>
                        <option value="visita">Visita</option>
                        <option value="extra">Extra</option>
                        <option value="tercero">Tercero</option>
                    </select>
                </div>
                {(dateRange.start || dateRange.end || typeFilter) && (
                    <button onClick={() => { setDateRange({ start: '', end: '' }); setTypeFilter(''); }}
                        style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0.4rem', color: '#fca5a5', padding: '0.3rem 0.65rem', cursor: 'pointer', fontSize: '0.78rem' }}>
                        Limpiar
                    </button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.78rem', color: '#475569' }}>Mostrar</span>
                    <select
                        value={pageSize}
                        onChange={e => setPageSize(Number(e.target.value))}
                        style={filterInputSt}
                    >
                        {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                </div>
                <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                    {isLoading ? 'Cargando...' : `${total} registro(s)`}
                </span>
                <button
                    onClick={handleDownloadExcel}
                    disabled={downloading}
                    title="Descarga Excel completo: todos los registros + auditoría manual + resumen de totales"
                    style={{
                        marginLeft: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '0.4rem 0.9rem',
                        background: downloading ? 'rgba(16,185,129,0.05)' : 'rgba(16,185,129,0.12)',
                        border: '1px solid rgba(16,185,129,0.3)',
                        borderRadius: '0.4rem',
                        color: downloading ? '#475569' : '#10b981',
                        cursor: downloading ? 'not-allowed' : 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        transition: 'all 0.15s',
                        whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { if (!downloading) e.currentTarget.style.background = 'rgba(16,185,129,0.2)'; }}
                    onMouseLeave={e => { if (!downloading) e.currentTarget.style.background = 'rgba(16,185,129,0.12)'; }}
                >
                    <Download size={13} />
                    {downloading ? 'Generando...' : 'Excel Completo'}
                </button>
            </div>

            {/* Tabla */}
            <div style={{ overflowX: 'auto', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.07)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{ background: 'rgba(15,23,42,0.8)' }}>
                            {['N° Ticket', 'Colaborador', 'Fecha', 'Hora', 'Tipo', 'Estado', 'Acciones'].map(h => (
                                <th key={h} style={{ padding: '0.85rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {records.map(row => {
                            const badge   = getBadge(row.type);
                            const prtMsg  = reprintMsg[row.id];
                            const blocked = row.status === 'Bloqueado';
                            return (
                                <tr key={row.id}
                                    style={{ borderTop: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                                    <td style={{ padding: '0.8rem 1rem', color: '#94a3b8', fontWeight: '600' }}>
                                        {row.numero_ticket || '—'}
                                    </td>
                                    <td style={{ padding: '0.8rem 1rem', color: '#f1f5f9', maxWidth: '190px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {row.user}
                                    </td>
                                    <td style={{ padding: '0.8rem 1rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                        {row.date}
                                    </td>
                                    <td style={{ padding: '0.8rem 1rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                        {formatTime(row.date, row.time)}
                                    </td>
                                    <td style={{ padding: '0.8rem 1rem' }}>
                                        <span style={{ background: badge.bg, color: badge.color, padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.73rem', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                            {badge.label}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.8rem 1rem' }}>
                                        <span style={{ color: blocked ? '#ef4444' : '#10b981', fontWeight: '600', fontSize: '0.8rem' }}>
                                            {row.status}
                                        </span>
                                    </td>

                                    {/* ── Acciones ── */}
                                    <td style={{ padding: '0.8rem 1rem' }}>
                                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>

                                            {/* Reimprimir */}
                                            {prtMsg === 'ok' ? (
                                                <span title="Enviado"><CheckCircle size={15} color="#10b981" /></span>
                                            ) : prtMsg === 'err' ? (
                                                <span title="Error"><XCircle size={15} color="#ef4444" /></span>
                                            ) : (
                                                <ActionBtn
                                                    title={blocked ? 'No se reimprimen duplicados' : 'Reimprimir'}
                                                    disabled={blocked}
                                                    color="#38bdf8"
                                                    onClick={() => handleReprint(row)}
                                                >
                                                    <Printer size={13} />
                                                </ActionBtn>
                                            )}

                                            {/* Editar */}
                                            <ActionBtn
                                                title="Editar registro"
                                                color="#818cf8"
                                                onClick={() => setEditingRow(row)}
                                            >
                                                <Edit2 size={13} />
                                            </ActionBtn>

                                            {/* Borrar */}
                                            <ActionBtn
                                                title="Eliminar registro"
                                                color="#f87171"
                                                onClick={() => handleDelete(row)}
                                            >
                                                <Trash2 size={13} />
                                            </ActionBtn>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {!isLoading && records.length === 0 && (
                            <tr>
                                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#475569', fontSize: '0.875rem' }}>
                                    Sin registros para el filtro seleccionado
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Paginación */}
            {total > 0 && (
                <Pagination
                    page={page}
                    totalPages={totalPages}
                    firstItem={firstItem}
                    lastItem={lastItem}
                    total={total}
                    onChange={setPage}
                />
            )}

            {/* Modal de edición */}
            {editingRow && (
                <EditModal
                    row={editingRow}
                    onClose={() => setEditingRow(null)}
                    onSave={handleSave}
                />
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────
// Helpers de estilo
// ──────────────────────────────────────────────────
// Genera la lista de páginas a mostrar con elipsis: 1 … 4 5 [6] 7 8 … 20
function buildPageList(page, totalPages) {
    const delta = 2;
    const pages = [];
    const range = [];
    for (let i = Math.max(2, page - delta); i <= Math.min(totalPages - 1, page + delta); i++) {
        range.push(i);
    }
    if (totalPages >= 1) pages.push(1);
    if (range[0] > 2) pages.push('…');
    pages.push(...range);
    if (range[range.length - 1] < totalPages - 1) pages.push('…');
    if (totalPages > 1) pages.push(totalPages);
    return pages;
}

function Pagination({ page, totalPages, firstItem, lastItem, total, onChange }) {
    const pages = buildPageList(page, totalPages);
    const navBtn = (disabled) => ({
        display: 'flex', alignItems: 'center', gap: '0.2rem',
        padding: '0.35rem 0.6rem',
        background: disabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '0.4rem',
        color: disabled ? '#334155' : '#94a3b8',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '0.8rem',
    });
    return (
        <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
            gap: '0.75rem', marginTop: '1rem',
        }}>
            <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                Mostrando {firstItem}–{lastItem} de {total}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                <button onClick={() => onChange(page - 1)} disabled={page <= 1} style={navBtn(page <= 1)}>
                    <ChevronLeft size={14} /> Anterior
                </button>
                {pages.map((p, i) => p === '…' ? (
                    <span key={`e${i}`} style={{ color: '#475569', padding: '0 0.25rem', fontSize: '0.8rem' }}>…</span>
                ) : (
                    <button
                        key={p}
                        onClick={() => onChange(p)}
                        style={{
                            minWidth: '2rem',
                            padding: '0.35rem 0.5rem',
                            background: p === page ? 'linear-gradient(135deg,#0ea5e9,#6366f1)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${p === page ? 'transparent' : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: '0.4rem',
                            color: p === page ? 'white' : '#94a3b8',
                            fontWeight: p === page ? '700' : '500',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                        }}
                    >
                        {p}
                    </button>
                ))}
                <button onClick={() => onChange(page + 1)} disabled={page >= totalPages} style={navBtn(page >= totalPages)}>
                    Siguiente <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );
}

function ActionBtn({ children, title, onClick, disabled, color }) {
    return (
        <button
            onClick={disabled ? undefined : onClick}
            title={title}
            style={{
                background: disabled ? 'rgba(255,255,255,0.02)' : `${color}18`,
                border:     `1px solid ${disabled ? 'rgba(255,255,255,0.05)' : `${color}35`}`,
                borderRadius: '0.4rem',
                color:      disabled ? '#334155' : color,
                padding:    '0.3rem 0.45rem',
                cursor:     disabled ? 'not-allowed' : 'pointer',
                display:    'flex',
                alignItems: 'center',
                transition: 'opacity 0.15s',
            }}
        >
            {children}
        </button>
    );
}

const inputSt = {
    width: '100%', boxSizing: 'border-box',
    padding: '0.6rem 0.75rem',
    background: 'rgba(15,23,42,0.7)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '0.5rem',
    color: '#f1f5f9',
    fontSize: '0.875rem',
    outline: 'none',
};

const filterInputSt = {
    padding: '0.38rem 0.6rem',
    background: 'rgba(15,23,42,0.6)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '0.4rem',
    color: '#f1f5f9',
    fontSize: '0.85rem',
    outline: 'none',
};
