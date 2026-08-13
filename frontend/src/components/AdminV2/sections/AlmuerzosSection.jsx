import React, { useState } from 'react';
import useSWR from 'swr';
import axios from 'axios';
import {
    Timer, Calendar, Filter, Search, Download, CheckCircle2, AlertTriangle,
    HelpCircle, Coffee, Users, Clock, X, Save, ChevronLeft, ChevronRight,
} from 'lucide-react';

const PAGE_SIZES = [20, 50, 100, 250];
const hoyISO = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD en hora local

// ──────────────────────────────────────────────────
// Paleta por estado. Debe coincidir con los estados que
// devuelve almuerzoRepository (SQL_ESTADO_EFECTIVO).
// ──────────────────────────────────────────────────
const ESTADOS = {
    A_TIEMPO:          { bg: 'rgba(16,185,129,0.15)',  color: '#6ee7b7', label: 'A tiempo' },
    EXCEDIDO:          { bg: 'rgba(239,68,68,0.15)',   color: '#f87171', label: 'Excedió' },
    EN_ALMUERZO:       { bg: 'rgba(245,158,11,0.15)',  color: '#fbbf24', label: 'En almuerzo' },
    EXCEDIDO_EN_CURSO: { bg: 'rgba(249,115,22,0.15)',  color: '#fb923c', label: 'Sin marcar · vencido' },
    SIN_RETORNO:       { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8', label: 'No marcó' },
};

const badgeEstado = estado => ESTADOS[estado] || ESTADOS.SIN_RETORNO;

/** Excedente sobre el límite, en texto ("+7:25"). Null si no excede. */
function excedente(segundos, minutosPermitidos) {
    if (segundos == null || minutosPermitidos == null) return null;
    const extra = segundos - minutosPermitidos * 60;
    if (extra <= 0) return null;
    return `+${Math.floor(extra / 60)}:${String(extra % 60).padStart(2, '0')}`;
}

// ──────────────────────────────────────────────────
// Tarjeta de resumen
// ──────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, hint }) {
    return (
        <div style={{
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '1rem',
            padding: '1rem 1.15rem',
            display: 'flex', alignItems: 'center', gap: '0.9rem',
        }}>
            <div style={{
                width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
                background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Icon size={18} color={color} />
            </div>
            <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {label}
                </p>
                <p style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: '#f1f5f9', lineHeight: 1.15 }}>
                    {value ?? <span style={{ fontSize: '1rem', color: '#475569' }}>—</span>}
                </p>
                {hint && <p style={{ margin: 0, fontSize: '0.7rem', color: '#475569' }}>{hint}</p>}
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────
// Modal de cierre manual (solo superadmin)
// ──────────────────────────────────────────────────
function CierreManualModal({ fila, onClose, onSave }) {
    const [hora, setHora] = useState('');
    const [observacion, setObservacion] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');

    const guardar = async () => {
        if (!hora) { setError('Indica la hora de retorno.'); return; }
        setGuardando(true);
        setError('');
        try {
            await onSave(fila.id, { horaRetorno: hora, observacion });
            onClose();
        } catch (err) {
            setError(err?.response?.data?.error || 'No se pudo cerrar la sesión.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.75)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '1rem', zIndex: 1000,
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '1rem', padding: '1.5rem', width: '100%', maxWidth: '420px',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.1rem' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#f1f5f9', fontWeight: 700 }}>
                            Registrar retorno manual
                        </h3>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                            {fila.nombre} · salió {fila.horaSalida}
                        </p>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}>
                        <X size={18} />
                    </button>
                </div>

                <label style={labelSt}>Hora de retorno</label>
                <input type="time" value={hora} onChange={e => setHora(e.target.value)} style={inputSt} />

                <label style={{ ...labelSt, marginTop: '0.85rem' }}>Motivo (opcional)</label>
                <input
                    type="text"
                    value={observacion}
                    onChange={e => setObservacion(e.target.value)}
                    placeholder="Ej: olvidó marcar en el biométrico"
                    maxLength={200}
                    style={inputSt}
                />

                <p style={{ margin: '0.85rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                    La sesión quedará marcada como cierre manual y el estado se calculará con el
                    límite vigente, igual que si hubiera marcado en el biométrico.
                </p>

                {error && (
                    <p style={{ margin: '0.85rem 0 0', fontSize: '0.8rem', color: '#f87171' }}>{error}</p>
                )}

                <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.25rem' }}>
                    <button onClick={onClose} disabled={guardando} style={btnSecundarioSt}>
                        Cancelar
                    </button>
                    <button onClick={guardar} disabled={guardando} style={btnPrimarioSt(guardando)}>
                        <Save size={14} />
                        {guardando ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────
// Sección principal
// ──────────────────────────────────────────────────
export default function AlmuerzosSection({ authHeaders, user }) {
    const [rango, setRango] = useState({ desde: hoyISO(), hasta: hoyISO() });
    const [estado, setEstado] = useState('');
    const [busqueda, setBusqueda] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [descargando, setDescargando] = useState(false);
    const [filaCierre, setFilaCierre] = useState(null);

    const esSuperadmin = user?.rol === 'superadmin';
    const esHoy = rango.desde === hoyISO() && rango.hasta === hoyISO();

    const fetcher = url => axios.get(url, { headers: authHeaders }).then(r => r.data);

    const params = new URLSearchParams();
    params.set('desde', rango.desde);
    params.set('hasta', rango.hasta);
    if (estado) params.set('estado', estado);
    if (busqueda.trim()) params.set('q', busqueda.trim());
    params.set('page', page);
    params.set('pageSize', pageSize);

    const paramsResumen = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta });

    // Solo el día en curso necesita refresco automático: es el único con
    // sesiones abiertas cuyo cronómetro avanza.
    const refresco = esHoy ? 30000 : 0;

    const { data: resp, isLoading, mutate } = useSWR(
        `/api/almuerzos?${params}`, fetcher, { keepPreviousData: true, refreshInterval: refresco }
    );
    const { data: resumen, mutate: mutateResumen } = useSWR(
        `/api/almuerzos/resumen?${paramsResumen}`, fetcher, { refreshInterval: refresco }
    );

    const filas = resp?.data ?? [];
    const total = resp?.total ?? 0;
    const totalPaginas = Math.max(1, Math.ceil(total / pageSize));
    const primero = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const ultimo = Math.min(page * pageSize, total);

    const aplicarFiltro = (cambios) => { setPage(1); cambios(); };

    const descargarExcel = async () => {
        setDescargando(true);
        try {
            const respuesta = await fetch(`/api/almuerzos/excel?${paramsResumen}`, { headers: authHeaders });
            if (!respuesta.ok) {
                alert('Error al generar el reporte. Revisa los logs del servidor.');
                return;
            }
            const blob = await respuesta.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const disp = respuesta.headers.get('content-disposition') || '';
            const match = disp.match(/filename="?([^"]+)"?/);
            a.download = match ? match[1] : `control_almuerzo_${rango.desde}.xlsx`;
            a.href = url;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch {
            alert('Error de red al descargar el reporte.');
        } finally {
            setDescargando(false);
        }
    };

    const cerrarManual = async (id, datos) => {
        await axios.post(`/api/almuerzos/${id}/cerrar-manual`, datos, { headers: authHeaders });
        mutate();
        mutateResumen();
    };

    const limitePermitido = resumen?.minutosPermitidos;

    return (
        <div>
            {/* Aviso si el control está apagado en configuración */}
            {resumen && resumen.controlActivo === false && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: '0.7rem 1rem', marginBottom: '1.25rem',
                    background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                    borderRadius: '0.6rem', color: '#fbbf24', fontSize: '0.82rem',
                }}>
                    <AlertTriangle size={15} />
                    El control de tiempo está <strong>desactivado</strong> en Configuración
                    (<code>almuerzo_control_activo</code>): no se están registrando salidas ni retornos nuevos.
                </div>
            )}

            {/* Tarjetas de resumen */}
            <div className="resumen-grid" style={{ marginBottom: '1.5rem' }}>
                <StatCard icon={Users} label="Salidas" value={resumen?.salidas} color="#38bdf8"
                    hint={resumen ? `${resumen.retornos} retornos marcados` : null} />
                <StatCard icon={CheckCircle2} label="A tiempo" value={resumen?.aTiempo} color="#10b981"
                    hint={limitePermitido ? `≤ ${limitePermitido} min` : null} />
                <StatCard icon={AlertTriangle} label="Excedieron" value={resumen?.excedidos} color="#ef4444"
                    hint={limitePermitido ? `> ${limitePermitido} min` : null} />
                <StatCard icon={HelpCircle} label="Sin marcar" value={resumen?.sinMarcar} color="#94a3b8"
                    hint="no registraron retorno" />
                <StatCard icon={Coffee} label="En almuerzo" value={resumen?.enAlmuerzo} color="#f59e0b"
                    hint="dentro de su tiempo" />
                <StatCard icon={Clock} label="Promedio" value={resumen?.promedioDuracion} color="#a78bfa"
                    hint={resumen?.maximoDuracion ? `máximo ${resumen.maximoDuracion}` : null} />
            </div>

            {/* Filtros */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center',
                marginBottom: '1.25rem', padding: '0.9rem 1.1rem',
                background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '0.75rem',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Calendar size={14} color="#64748b" />
                    <input type="date" value={rango.desde} max={rango.hasta}
                        onChange={e => aplicarFiltro(() => setRango(p => ({ ...p, desde: e.target.value })))}
                        style={filterInputSt} />
                    <span style={{ color: '#475569', fontSize: '0.8rem' }}>a</span>
                    <input type="date" value={rango.hasta} min={rango.desde}
                        onChange={e => aplicarFiltro(() => setRango(p => ({ ...p, hasta: e.target.value })))}
                        style={filterInputSt} />
                </div>

                {!esHoy && (
                    <button
                        onClick={() => aplicarFiltro(() => setRango({ desde: hoyISO(), hasta: hoyISO() }))}
                        style={{
                            background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)',
                            borderRadius: '0.4rem', color: '#7dd3fc', padding: '0.3rem 0.65rem',
                            cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                        }}
                    >
                        Hoy
                    </button>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Filter size={14} color="#64748b" />
                    <select value={estado} onChange={e => aplicarFiltro(() => setEstado(e.target.value))} style={filterInputSt}>
                        <option value="">Todos los estados</option>
                        {Object.entries(ESTADOS).map(([clave, cfg]) => (
                            <option key={clave} value={clave}>{cfg.label}</option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Search size={14} color="#64748b" />
                    <input
                        type="text"
                        value={busqueda}
                        onChange={e => aplicarFiltro(() => setBusqueda(e.target.value))}
                        placeholder="Nombre o ID"
                        style={{ ...filterInputSt, width: '150px' }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.78rem', color: '#475569' }}>Mostrar</span>
                    <select value={pageSize} onChange={e => aplicarFiltro(() => setPageSize(Number(e.target.value)))} style={filterInputSt}>
                        {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                </div>

                <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                    {isLoading ? 'Cargando...' : `${total} registro(s)`}
                </span>

                <button
                    onClick={descargarExcel}
                    disabled={descargando}
                    title="Descarga el detalle del rango más una hoja de resumen"
                    style={{
                        marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.4rem 0.9rem',
                        background: descargando ? 'rgba(16,185,129,0.05)' : 'rgba(16,185,129,0.12)',
                        border: '1px solid rgba(16,185,129,0.3)', borderRadius: '0.4rem',
                        color: descargando ? '#475569' : '#10b981',
                        cursor: descargando ? 'not-allowed' : 'pointer',
                        fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap',
                    }}
                >
                    <Download size={13} />
                    {descargando ? 'Generando...' : 'Excel'}
                </button>
            </div>

            {/* Tabla */}
            <div style={{ overflowX: 'auto', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.07)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{ background: 'rgba(15,23,42,0.8)' }}>
                            {['Colaborador', 'ID', 'Fecha', 'Salida', 'Retorno', 'Tiempo', 'Estado', ...(esSuperadmin ? [''] : [])].map((h, i) => (
                                <th key={h || `acc${i}`} style={thSt}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filas.map(fila => {
                            const badge = badgeEstado(fila.estado);
                            const extra = fila.estado === 'EXCEDIDO' ? excedente(fila.segundos, limitePermitido) : null;
                            const enCurso = fila.estado === 'EN_ALMUERZO' || fila.estado === 'EXCEDIDO_EN_CURSO';
                            return (
                                <tr key={fila.id}
                                    style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                                    <td style={{ ...tdSt, color: '#f1f5f9', maxWidth: '230px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {fila.nombre}
                                        {fila.cierreManual && (
                                            <span title={fila.observacion || 'Cierre manual'}
                                                style={{ marginLeft: '0.4rem', fontSize: '0.68rem', color: '#818cf8', fontWeight: 600 }}>
                                                ✎ manual
                                            </span>
                                        )}
                                        {fila.origen === 'BACKFILL' && (
                                            <span
                                                title="Dato inferido del histórico: se reconstruyó a partir de una segunda marcación anterior a que existiera el control de tiempo. No es una medición en vivo."
                                                style={{ marginLeft: '0.4rem', fontSize: '0.68rem', color: '#64748b', fontWeight: 600, borderBottom: '1px dotted #475569', cursor: 'help' }}>
                                                inferido
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ ...tdSt, color: '#64748b' }}>{fila.userId}</td>
                                    <td style={{ ...tdSt, color: '#94a3b8', whiteSpace: 'nowrap' }}>{fila.fecha}</td>
                                    <td style={{ ...tdSt, color: '#94a3b8', whiteSpace: 'nowrap' }}>{fila.horaSalida || '—'}</td>
                                    <td style={{ ...tdSt, color: fila.horaRetorno ? '#94a3b8' : '#475569', whiteSpace: 'nowrap' }}>
                                        {fila.horaRetorno || '—'}
                                    </td>
                                    <td style={{ ...tdSt, whiteSpace: 'nowrap', fontWeight: 600, color: badge.color }}>
                                        {fila.duracion || '—'}
                                        {enCurso && fila.duracion && (
                                            <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 400 }}> en curso</span>
                                        )}
                                        {extra && (
                                            <span style={{ fontSize: '0.7rem', color: '#f87171', fontWeight: 600 }}> ({extra})</span>
                                        )}
                                    </td>
                                    <td style={tdSt}>
                                        <span style={{
                                            background: badge.bg, color: badge.color,
                                            padding: '0.2rem 0.55rem', borderRadius: '999px',
                                            fontSize: '0.73rem', fontWeight: 600, whiteSpace: 'nowrap',
                                        }}>
                                            {badge.label}
                                        </span>
                                    </td>
                                    {esSuperadmin && (
                                        <td style={tdSt}>
                                            {!fila.horaRetorno && (
                                                <button
                                                    onClick={() => setFilaCierre(fila)}
                                                    title="Registrar el retorno manualmente"
                                                    style={{
                                                        background: 'rgba(129,140,248,0.12)',
                                                        border: '1px solid rgba(129,140,248,0.3)',
                                                        borderRadius: '0.4rem', color: '#a5b4fc',
                                                        padding: '0.25rem 0.55rem', cursor: 'pointer',
                                                        fontSize: '0.73rem', fontWeight: 600, whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    Cerrar
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                        {!isLoading && filas.length === 0 && (
                            <tr>
                                <td colSpan={esSuperadmin ? 8 : 7} style={{ padding: '2rem', textAlign: 'center', color: '#475569', fontSize: '0.875rem' }}>
                                    <Timer size={20} style={{ opacity: 0.4, display: 'block', margin: '0 auto 0.5rem' }} />
                                    Sin salidas a almuerzo registradas para este filtro
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Paginación */}
            {total > pageSize && (
                <div style={{
                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
                    gap: '0.75rem', marginTop: '1rem',
                }}>
                    <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                        Mostrando {primero}–{ultimo} de {total}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <button onClick={() => setPage(p => p - 1)} disabled={page <= 1} style={navBtnSt(page <= 1)}>
                            <ChevronLeft size={14} /> Anterior
                        </button>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8', padding: '0 0.5rem' }}>
                            {page} / {totalPaginas}
                        </span>
                        <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPaginas} style={navBtnSt(page >= totalPaginas)}>
                            Siguiente <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            )}

            {filaCierre && (
                <CierreManualModal
                    fila={filaCierre}
                    onClose={() => setFilaCierre(null)}
                    onSave={cerrarManual}
                />
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────
// Estilos
// ──────────────────────────────────────────────────
const thSt = {
    padding: '0.85rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '0.75rem',
    textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', whiteSpace: 'nowrap',
};

const tdSt = { padding: '0.8rem 1rem' };

const filterInputSt = {
    padding: '0.38rem 0.6rem',
    background: 'rgba(15,23,42,0.6)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '0.4rem',
    color: '#f1f5f9',
    fontSize: '0.85rem',
    outline: 'none',
};

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

const labelSt = {
    display: 'block', marginBottom: '0.35rem',
    fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600,
};

const btnSecundarioSt = {
    flex: 1, padding: '0.6rem',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '0.5rem', color: '#94a3b8',
    cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
};

const btnPrimarioSt = (ocupado) => ({
    flex: 1, padding: '0.6rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
    background: ocupado ? 'rgba(16,185,129,0.05)' : 'linear-gradient(135deg,#0ea5e9,#6366f1)',
    border: 'none', borderRadius: '0.5rem',
    color: ocupado ? '#475569' : 'white',
    cursor: ocupado ? 'not-allowed' : 'pointer',
    fontSize: '0.85rem', fontWeight: 700,
});

const navBtnSt = (deshabilitado) => ({
    display: 'flex', alignItems: 'center', gap: '0.2rem',
    padding: '0.35rem 0.6rem',
    background: deshabilitado ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '0.4rem',
    color: deshabilitado ? '#334155' : '#94a3b8',
    cursor: deshabilitado ? 'not-allowed' : 'pointer',
    fontSize: '0.8rem',
});
