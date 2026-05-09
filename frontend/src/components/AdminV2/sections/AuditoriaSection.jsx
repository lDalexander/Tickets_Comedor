import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileText, RefreshCw } from 'lucide-react';

function formatDateTime(val) {
    if (!val) return '—';
    try {
        return new Date(val).toLocaleString('es-EC', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
    } catch { return String(val); }
}

export default function AuditoriaSection({ authHeaders }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [operators, setOperators] = useState({});

    const load = () => {
        setLoading(true);
        Promise.all([
            axios.get('/api/admin/data/log_tickets_manuales', { headers: authHeaders }),
            axios.get('/api/manual-tickets/users'),
        ])
            .then(([logsRes, usersRes]) => {
                setLogs(logsRes.data);
                const map = {};
                (usersRes.data || []).forEach(u => { map[u.id] = u.nombre_real; });
                setOperators(map);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FileText size={16} color="#818cf8" />
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        {logs.length} registro(s) de auditoría
                    </span>
                </div>
                <button onClick={load} disabled={loading}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.5rem', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem' }}>
                    <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                    Actualizar
                </button>
            </div>

            {loading ? (
                <p style={{ color: '#475569', fontSize: '0.9rem' }}>Cargando auditoría...</p>
            ) : (
                <div style={{ overflowX: 'auto', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ background: 'rgba(15,23,42,0.8)' }}>
                                {['#', 'Visitante / Beneficiario', 'Impreso por', 'Fecha y Hora'].map(h => (
                                    <th key={h} style={{ padding: '0.85rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map(log => (
                                <tr key={log.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ padding: '0.85rem 1rem', color: '#475569', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                                        {log.id}
                                    </td>
                                    <td style={{ padding: '0.85rem 1rem', color: '#f1f5f9', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {log.nombre_visitante}
                                    </td>
                                    <td style={{ padding: '0.85rem 1rem', color: '#94a3b8' }}>
                                        {operators[log.impreso_por_usuario_id]
                                            ? <><span style={{ color: '#818cf8' }}>@{operators[log.impreso_por_usuario_id]}</span></>
                                            : <span style={{ color: '#475569' }}>ID {log.impreso_por_usuario_id}</span>}
                                    </td>
                                    <td style={{ padding: '0.85rem 1rem', color: '#64748b', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                                        {formatDateTime(log.created_at || log.fecha_registro)}
                                    </td>
                                </tr>
                            ))}
                            {logs.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#475569', fontSize: '0.875rem' }}>
                                        Sin registros de auditoría
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
