import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import axios from 'axios';
import {
    Factory, Search, Save, Check, AlertTriangle, Users, Timer, TimerOff, Info,
} from 'lucide-react';

const SIN_ZONA = 'SIN_ZONA';

/** Color por zona, para que el ojo distinga las áreas de un vistazo. */
const COLOR_ZONA = {
    BODEGA:          '#f59e0b',
    LOGISTICA:       '#0ea5e9',
    SOLIDO:          '#10b981',
    LIQUIDO:         '#06b6d4',
    SOPLADO:         '#a78bfa',
    MANTENIMIENTO:   '#f472b6',
    ADMINISTRATIVOS: '#94a3b8',
};
const colorZona = zona => COLOR_ZONA[zona] || '#64748b';

function Badge({ zona, controlada }) {
    if (!zona) {
        return (
            <span style={{
                background: 'rgba(239,68,68,0.12)', color: '#fca5a5',
                padding: '0.15rem 0.5rem', borderRadius: '999px',
                fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap',
            }}>
                sin asignar
            </span>
        );
    }
    const color = colorZona(zona);
    return (
        <span style={{
            background: `${color}20`, color,
            padding: '0.15rem 0.5rem', borderRadius: '999px',
            fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap',
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
        }}>
            {controlada && <Timer size={11} />}
            {zona}
        </span>
    );
}

export default function ZonasSection({ authHeaders, user }) {
    const [filtroZona, setFiltroZona] = useState('');
    const [busqueda, setBusqueda] = useState('');
    const [seleccion, setSeleccion] = useState(new Set());
    const [zonaDestino, setZonaDestino] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [aviso, setAviso] = useState(null);
    const [controladasLocal, setControladasLocal] = useState(null);
    const [sinZonaLocal, setSinZonaLocal] = useState(null);

    const esSuperadmin = user?.rol === 'superadmin';
    const fetcher = url => axios.get(url, { headers: authHeaders }).then(r => r.data);

    const { data: config, mutate: mutateConfig } = useSWR('/api/almuerzos/zonas', fetcher);

    const paramsEmpleados = new URLSearchParams();
    if (filtroZona) paramsEmpleados.set('zona', filtroZona);
    if (busqueda.trim()) paramsEmpleados.set('q', busqueda.trim());
    const { data: empleados, isLoading, mutate: mutateEmpleados } = useSWR(
        `/api/almuerzos/empleados?${paramsEmpleados}`, fetcher, { keepPreviousData: true }
    );

    const zonas = config?.zonas ?? [];
    const filas = empleados?.data ?? [];

    // Las zonas controladas se editan en local y se confirman con "Guardar":
    // cambiar a quién se le mide el almuerzo en toda la planta no debe pasar
    // por un clic accidental en una casilla.
    const controladas = useMemo(() => (
        controladasLocal ?? new Set(zonas.filter(z => z.controlada).map(z => z.zona))
    ), [controladasLocal, zonas]);

    const controlarSinZona = sinZonaLocal ?? config?.controlarSinZona ?? true;
    const hayCambiosConfig = controladasLocal !== null || sinZonaLocal !== null;

    const alternarZona = (zona) => {
        const copia = new Set(controladas);
        if (copia.has(zona)) copia.delete(zona); else copia.add(zona);
        setControladasLocal(copia);
    };

    const guardarConfig = async () => {
        setGuardando(true);
        setAviso(null);
        try {
            await axios.put('/api/almuerzos/zonas', {
                controladas: [...controladas],
                controlarSinZona,
            }, { headers: authHeaders });
            setControladasLocal(null);
            setSinZonaLocal(null);
            await mutateConfig();
            setAviso({ tipo: 'ok', texto: 'Zonas controladas actualizadas. El worker lo aplica en menos de un minuto.' });
        } catch (err) {
            setAviso({ tipo: 'error', texto: err?.response?.data?.error || 'No se pudo guardar la configuración.' });
        } finally {
            setGuardando(false);
        }
    };

    const descartarConfig = () => {
        setControladasLocal(null);
        setSinZonaLocal(null);
        setAviso(null);
    };

    const alternarSeleccion = (zkId) => {
        const copia = new Set(seleccion);
        if (copia.has(zkId)) copia.delete(zkId); else copia.add(zkId);
        setSeleccion(copia);
    };

    const seleccionarTodos = () => {
        setSeleccion(seleccion.size === filas.length ? new Set() : new Set(filas.map(f => f.zkId)));
    };

    const asignarZona = async (quitar = false) => {
        if (seleccion.size === 0) return;
        if (!quitar && !zonaDestino) {
            setAviso({ tipo: 'error', texto: 'Elige la zona que quieres asignar.' });
            return;
        }
        setGuardando(true);
        setAviso(null);
        try {
            const { data } = await axios.put('/api/almuerzos/empleados/zona', {
                zkIds: [...seleccion],
                zona: quitar ? null : zonaDestino,
            }, { headers: authHeaders });
            setSeleccion(new Set());
            await Promise.all([mutateEmpleados(), mutateConfig()]);
            setAviso({
                tipo: 'ok',
                texto: quitar
                    ? `Zona quitada a ${data.actualizados} persona(s).`
                    : `${data.actualizados} persona(s) asignada(s) a ${data.zona}.`,
            });
        } catch (err) {
            setAviso({ tipo: 'error', texto: err?.response?.data?.error || 'No se pudo asignar la zona.' });
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div>
            {/* Explicación */}
            <div style={{
                display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
                padding: '0.85rem 1.1rem', marginBottom: '1.25rem',
                background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.2)',
                borderRadius: '0.7rem',
            }}>
                <Info size={16} color="#38bdf8" style={{ flexShrink: 0, marginTop: '1px' }} />
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.55 }}>
                    La zona define <strong style={{ color: '#e2e8f0' }}>a quién se le controla el tiempo de almuerzo</strong>.
                    Solo las zonas con el ícono <Timer size={11} style={{ verticalAlign: 'middle' }} /> se contabilizan;
                    al resto se le imprime el ticket con normalidad pero no se le mide el tiempo.
                    Es independiente del rol (Operativo / Administrativo) que se usa para la selección de menú.
                </p>
            </div>

            {aviso && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.7rem 1rem', marginBottom: '1rem', borderRadius: '0.6rem',
                    fontSize: '0.83rem', fontWeight: 500,
                    background: aviso.tipo === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${aviso.tipo === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    color: aviso.tipo === 'ok' ? '#6ee7b7' : '#fca5a5',
                }}>
                    {aviso.tipo === 'ok' ? <Check size={15} /> : <AlertTriangle size={15} />}
                    {aviso.texto}
                </div>
            )}

            {/* ── Qué zonas se controlan ── */}
            <div style={{
                background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '1rem', padding: '1.15rem 1.35rem', marginBottom: '1.5rem',
            }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
                    <Factory size={17} color="#f472b6" />
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#f1f5f9' }}>
                        Zonas con control de tiempo
                    </h3>
                    {!esSuperadmin && (
                        <span style={{ fontSize: '0.73rem', color: '#64748b' }}>
                            (solo un superadmin puede modificarlo)
                        </span>
                    )}
                </div>

                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.6rem',
                }}>
                    {zonas.map(({ zona, empleados: cuantos }) => {
                        const activa = controladas.has(zona);
                        const color = colorZona(zona);
                        return (
                            <label
                                key={zona}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                                    padding: '0.65rem 0.85rem', borderRadius: '0.6rem',
                                    background: activa ? `${color}14` : 'rgba(15,23,42,0.5)',
                                    border: `1px solid ${activa ? `${color}45` : 'rgba(255,255,255,0.07)'}`,
                                    cursor: esSuperadmin ? 'pointer' : 'not-allowed',
                                    opacity: esSuperadmin ? 1 : 0.65,
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={activa}
                                    disabled={!esSuperadmin}
                                    onChange={() => alternarZona(zona)}
                                    style={{ accentColor: color, width: '15px', height: '15px', cursor: 'inherit' }}
                                />
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontSize: '0.83rem', fontWeight: 700, color: activa ? color : '#94a3b8' }}>
                                        {zona}
                                    </div>
                                    <div style={{ fontSize: '0.71rem', color: '#64748b' }}>
                                        {cuantos} {cuantos === 1 ? 'persona' : 'personas'}
                                        {activa ? ' · se contabiliza' : ' · sin control'}
                                    </div>
                                </div>
                                {activa
                                    ? <Timer size={14} color={color} />
                                    : <TimerOff size={14} color="#475569" />}
                            </label>
                        );
                    })}
                </div>

                {/* Sin zona asignada */}
                <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center',
                    marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <label style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        fontSize: '0.82rem', color: '#94a3b8',
                        cursor: esSuperadmin ? 'pointer' : 'not-allowed',
                    }}>
                        <input
                            type="checkbox"
                            checked={controlarSinZona}
                            disabled={!esSuperadmin}
                            onChange={e => setSinZonaLocal(e.target.checked)}
                            style={{ accentColor: '#38bdf8', width: '15px', height: '15px', cursor: 'inherit' }}
                        />
                        Controlar también a quien <strong style={{ color: '#e2e8f0' }}>no tiene zona asignada</strong>
                        {config?.sinZona > 0 && (
                            <span style={{ color: '#fca5a5', fontWeight: 600 }}>
                                ({config.sinZona} sin clasificar)
                            </span>
                        )}
                    </label>

                    {hayCambiosConfig && esSuperadmin && (
                        <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
                            <button onClick={descartarConfig} disabled={guardando} style={btnSecundarioSt}>
                                Descartar
                            </button>
                            <button onClick={guardarConfig} disabled={guardando} style={btnPrimarioSt(guardando)}>
                                <Save size={13} />
                                {guardando ? 'Guardando...' : 'Guardar cambios'}
                            </button>
                        </div>
                    )}
                </div>

                {config?.huerfanas?.length > 0 && (
                    <p style={{ margin: '0.9rem 0 0', fontSize: '0.76rem', color: '#fbbf24' }}>
                        <AlertTriangle size={12} style={{ verticalAlign: 'middle' }} />{' '}
                        Hay zonas asignadas que no están en el catálogo:{' '}
                        {config.huerfanas.map(h => `${h.zona} (${h.empleados})`).join(', ')}.
                        No aparecen en el selector; se corrigen editando <code>almuerzo_zonas_disponibles</code> en Configuración.
                    </p>
                )}
            </div>

            {/* ── Asignación por persona ── */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center',
                marginBottom: '1rem', padding: '0.9rem 1.1rem',
                background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '0.75rem',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Search size={14} color="#64748b" />
                    <input
                        type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                        placeholder="Nombre o ID" style={{ ...filterInputSt, width: '160px' }}
                    />
                </div>

                <select value={filtroZona} onChange={e => setFiltroZona(e.target.value)} style={filterInputSt}>
                    <option value="">Todas las zonas</option>
                    <option value={SIN_ZONA}>Sin asignar{config?.sinZona ? ` (${config.sinZona})` : ''}</option>
                    {zonas.map(z => <option key={z.zona} value={z.zona}>{z.zona}</option>)}
                </select>

                <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                    {isLoading ? 'Cargando...' : `${filas.length} empleado(s)`}
                </span>

                {seleccion.size > 0 && (
                    <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto',
                    }}>
                        <span style={{ fontSize: '0.78rem', color: '#7dd3fc', fontWeight: 600 }}>
                            {seleccion.size} seleccionado(s) →
                        </span>
                        <select value={zonaDestino} onChange={e => setZonaDestino(e.target.value)} style={filterInputSt}>
                            <option value="">Elegir zona...</option>
                            {zonas.map(z => <option key={z.zona} value={z.zona}>{z.zona}</option>)}
                        </select>
                        <button onClick={() => asignarZona(false)} disabled={guardando} style={btnPrimarioSt(guardando)}>
                            <Check size={13} /> Asignar
                        </button>
                        <button onClick={() => asignarZona(true)} disabled={guardando} style={btnSecundarioSt}>
                            Quitar zona
                        </button>
                    </div>
                )}
            </div>

            {/* Tabla de empleados */}
            <div style={{ overflowX: 'auto', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.07)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{ background: 'rgba(15,23,42,0.8)' }}>
                            <th style={{ ...thSt, width: '38px' }}>
                                <input
                                    type="checkbox"
                                    checked={filas.length > 0 && seleccion.size === filas.length}
                                    onChange={seleccionarTodos}
                                    title="Seleccionar todos los visibles"
                                    style={{ accentColor: '#38bdf8', width: '15px', height: '15px', cursor: 'pointer' }}
                                />
                            </th>
                            {['Colaborador', 'ID', 'Rol', 'Zona', 'Control de tiempo'].map(h => (
                                <th key={h} style={thSt}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filas.map(fila => {
                            const seleccionado = seleccion.has(fila.zkId);
                            const zonaControlada = fila.zona
                                ? controladas.has(String(fila.zona).toUpperCase())
                                : controlarSinZona;
                            return (
                                <tr key={fila.zkId}
                                    onClick={() => alternarSeleccion(fila.zkId)}
                                    style={{
                                        borderTop: '1px solid rgba(255,255,255,0.04)',
                                        background: seleccionado ? 'rgba(56,189,248,0.07)' : 'transparent',
                                        cursor: 'pointer',
                                    }}>
                                    <td style={tdSt}>
                                        <input
                                            type="checkbox" checked={seleccionado}
                                            onChange={() => alternarSeleccion(fila.zkId)}
                                            onClick={e => e.stopPropagation()}
                                            style={{ accentColor: '#38bdf8', width: '15px', height: '15px', cursor: 'pointer' }}
                                        />
                                    </td>
                                    <td style={{ ...tdSt, color: '#f1f5f9', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {fila.nombre}
                                    </td>
                                    <td style={{ ...tdSt, color: '#64748b' }}>{fila.zkId}</td>
                                    <td style={{ ...tdSt, color: '#94a3b8', fontSize: '0.8rem' }}>{fila.role || '—'}</td>
                                    <td style={tdSt}>
                                        <Badge zona={fila.zona} controlada={zonaControlada} />
                                    </td>
                                    <td style={tdSt}>
                                        <span style={{
                                            fontSize: '0.78rem', fontWeight: 600,
                                            color: zonaControlada ? '#6ee7b7' : '#64748b',
                                        }}>
                                            {zonaControlada ? 'Sí se contabiliza' : 'No se contabiliza'}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                        {!isLoading && filas.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#475569', fontSize: '0.875rem' }}>
                                    <Users size={20} style={{ opacity: 0.4, display: 'block', margin: '0 auto 0.5rem' }} />
                                    Sin empleados para este filtro
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────
// Estilos
// ──────────────────────────────────────────────────
const thSt = {
    padding: '0.8rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '0.75rem',
    textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', whiteSpace: 'nowrap',
};

const tdSt = { padding: '0.7rem 1rem' };

const filterInputSt = {
    padding: '0.38rem 0.6rem',
    background: 'rgba(15,23,42,0.6)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '0.4rem',
    color: '#f1f5f9',
    fontSize: '0.85rem',
    outline: 'none',
};

const btnSecundarioSt = {
    padding: '0.4rem 0.8rem',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '0.4rem', color: '#94a3b8',
    cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
};

const btnPrimarioSt = (ocupado) => ({
    display: 'flex', alignItems: 'center', gap: '0.35rem',
    padding: '0.4rem 0.85rem',
    background: ocupado ? 'rgba(16,185,129,0.05)' : 'linear-gradient(135deg,#0ea5e9,#6366f1)',
    border: 'none', borderRadius: '0.4rem',
    color: ocupado ? '#475569' : 'white',
    cursor: ocupado ? 'not-allowed' : 'pointer',
    fontSize: '0.8rem', fontWeight: 700,
});
