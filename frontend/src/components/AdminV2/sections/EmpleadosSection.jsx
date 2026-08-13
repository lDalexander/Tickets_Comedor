import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Search, Save, CheckCircle, XCircle, Trash2 } from 'lucide-react';

const ROLES = ['Operativo', 'Administrativo', 'Gerencia', 'Visitante'];
const MENU_TYPES = ['Normal', 'Dieta'];

export default function EmpleadosSection({ authHeaders }) {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState({}); // { [zk_id]: { role, tipo_menu_predeterminado } }
    const [saving, setSaving] = useState({});
    const [saved, setSaved] = useState({}); // { [zk_id]: 'ok'|'err' }

    useEffect(() => {
        axios.get('/api/admin/data/usuarios', { headers: authHeaders })
            .then(r => setEmployees(r.data))
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        if (!q) return employees;
        return employees.filter(e =>
            (e.nombre_completo || '').toLowerCase().includes(q) ||
            String(e.zk_id).includes(q)
        );
    }, [employees, search]);

    const startEdit = (emp) => {
        setEditing(p => ({
            ...p,
            [emp.zk_id]: {
                role: emp.role || 'Operativo',
                tipo_menu_predeterminado: emp.tipo_menu_predeterminado || 'Normal',
            }
        }));
    };

    const handleChange = (zkId, field, value) => {
        setEditing(p => ({ ...p, [zkId]: { ...p[zkId], [field]: value } }));
    };

    const handleSave = async (emp) => {
        const changes = editing[emp.zk_id];
        if (!changes) return;
        setSaving(p => ({ ...p, [emp.zk_id]: true }));
        try {
            await axios.put(
                `/api/admin/data/usuarios/zk_id/${emp.zk_id}`,
                changes,
                { headers: authHeaders }
            );
            setEmployees(p => p.map(e => e.zk_id === emp.zk_id ? { ...e, ...changes } : e));
            setEditing(p => { const n = { ...p }; delete n[emp.zk_id]; return n; });
            setSaved(p => ({ ...p, [emp.zk_id]: 'ok' }));
        } catch {
            setSaved(p => ({ ...p, [emp.zk_id]: 'err' }));
        } finally {
            setSaving(p => { const n = { ...p }; delete n[emp.zk_id]; return n; });
            setTimeout(() => setSaved(p => { const n = { ...p }; delete n[emp.zk_id]; return n; }), 3000);
        }
    };

    const cancelEdit = (zkId) => {
        setEditing(p => { const n = { ...p }; delete n[zkId]; return n; });
    };

    const handleDelete = async (emp) => {
        if (!window.confirm(`¿Eliminar al empleado "${emp.nombre_completo}" (ID ${emp.zk_id})?\n\nEsta acción no se puede deshacer.`)) return;
        try {
            await axios.delete(
                `/api/admin/data/usuarios/zk_id/${emp.zk_id}`,
                { headers: authHeaders }
            );
            setEmployees(p => p.filter(e => e.zk_id !== emp.zk_id));
        } catch {
            alert('Error al eliminar el empleado');
        }
    };

    if (loading) return <p style={{ color: '#475569', fontSize: '0.9rem' }}>Cargando empleados...</p>;

    return (
        <div>
            {/* Barra de búsqueda */}
            <div style={{ position: 'relative', marginBottom: '1.25rem', maxWidth: '340px' }}>
                <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
                <input
                    type="text"
                    placeholder="Buscar por nombre o ID ZK..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                        width: '100%', boxSizing: 'border-box',
                        padding: '0.6rem 0.75rem 0.6rem 2.2rem',
                        background: 'rgba(15,23,42,0.6)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '0.6rem',
                        color: '#f1f5f9',
                        fontSize: '0.875rem',
                        outline: 'none',
                    }}
                />
            </div>

            <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '0.75rem' }}>
                {filtered.length} empleado(s) {search ? `— búsqueda: "${search}"` : ''}
            </div>

            {/* Tabla */}
            <div style={{ overflowX: 'auto', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.07)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{ background: 'rgba(15,23,42,0.8)' }}>
                            {['ID ZK', 'Nombre Completo', 'Rol', 'Tipo de Menú', 'Acciones'].map(h => (
                                <th key={h} style={{ padding: '0.85rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(emp => {
                            const isEditing = !!editing[emp.zk_id];
                            const ed = editing[emp.zk_id] || {};
                            const isSaving = !!saving[emp.zk_id];
                            const status = saved[emp.zk_id];
                            return (
                                <tr key={emp.zk_id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
                                    onMouseEnter={e => { if (!isEditing) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                                    onMouseLeave={e => { if (!isEditing) e.currentTarget.style.background = 'transparent'; }}>
                                    <td style={{ padding: '0.75rem 1rem', color: '#64748b', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                        {emp.zk_id}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', color: '#f1f5f9', fontWeight: '500', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {emp.nombre_completo}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        {isEditing ? (
                                            <select value={ed.role} onChange={e => handleChange(emp.zk_id, 'role', e.target.value)} style={selectStyle}>
                                                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        ) : (
                                            <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{emp.role || 'Operativo'}</span>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        {isEditing ? (
                                            <select value={ed.tipo_menu_predeterminado} onChange={e => handleChange(emp.zk_id, 'tipo_menu_predeterminado', e.target.value)} style={selectStyle}>
                                                {MENU_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        ) : (
                                            <span style={{
                                                background: emp.tipo_menu_predeterminado === 'Dieta' ? 'rgba(16,185,129,0.12)' : 'rgba(56,189,248,0.1)',
                                                color: emp.tipo_menu_predeterminado === 'Dieta' ? '#6ee7b7' : '#38bdf8',
                                                padding: '0.2rem 0.6rem',
                                                borderRadius: '999px',
                                                fontSize: '0.75rem',
                                                fontWeight: '600',
                                            }}>
                                                {emp.tipo_menu_predeterminado || 'Normal'}
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        {status === 'ok' && <CheckCircle size={16} color="#10b981" />}
                                        {status === 'err' && <XCircle size={16} color="#ef4444" />}
                                        {!status && (
                                            isEditing ? (
                                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                    <button onClick={() => handleSave(emp)} disabled={isSaving}
                                                        style={{ ...btnStyle, background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8' }}>
                                                        <Save size={13} />
                                                    </button>
                                                    <button onClick={() => cancelEdit(emp.zk_id)}
                                                        style={{ ...btnStyle, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
                                                        <XCircle size={13} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                    <button onClick={() => startEdit(emp)}
                                                        style={{ ...btnStyle, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>
                                                        Editar
                                                    </button>
                                                    <button onClick={() => handleDelete(emp)} title="Eliminar empleado"
                                                        style={{ ...btnStyle, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            )
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

const selectStyle = {
    padding: '0.35rem 0.5rem',
    background: 'rgba(15,23,42,0.8)',
    border: '1px solid rgba(56,189,248,0.3)',
    borderRadius: '0.4rem',
    color: '#f1f5f9',
    fontSize: '0.82rem',
    outline: 'none',
    cursor: 'pointer',
};

const btnStyle = {
    border: 'none',
    borderRadius: '0.4rem',
    padding: '0.3rem 0.5rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.2rem',
};
