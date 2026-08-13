import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Edit2, Save, X, Eye, EyeOff, Lock } from 'lucide-react';

// Permisos del sistema. `locked: true` => no editable desde el panel (solo BD).
const PERMISOS = [
    { key: 'superadmin', label: 'Super Admin', color: '#f472b6', locked: true,  desc: 'Acceso total. Solo se asigna/quita desde la base de datos.' },
    { key: 'admin',      label: 'Admin',       color: '#a78bfa', locked: false, desc: 'Acceso al panel de administración.' },
    { key: 'visita',     label: 'Visita',      color: '#fb923c', locked: false, desc: 'Imprimir tickets de visita.' },
    { key: 'tercero',    label: 'Tercero',     color: '#6ee7b7', locked: false, desc: 'Imprimir tickets a terceros.' },
];

const parsePerms = s => String(s || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);

const EMPTY_FORM = { username: '', password: '', nombre_real: '', permisos: ['visita', 'tercero'] };

export default function OperadoresSection({ authHeaders }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [editingId, setEditingId] = useState(null);
    const [editData, setEditData] = useState({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [showPass, setShowPass] = useState(false);

    const load = () => {
        axios.get('/api/manual-tickets/users')
            .then(r => setUsers(r.data))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!formData.username || !formData.password || !formData.nombre_real) {
            setError('Usuario, nombre y contraseña son requeridos');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await axios.post('/api/manual-tickets/users', {
                username: formData.username,
                password: formData.password,
                nombre_real: formData.nombre_real,
                permisos: formData.permisos,
            });
            setFormData(EMPTY_FORM);
            setShowForm(false);
            load();
        } catch (err) {
            setError(err.response?.data?.error || 'Error al crear usuario');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (u) => {
        if (!window.confirm(`¿Eliminar operador "${u.nombre_real}"?`)) return;
        try {
            await axios.delete(`/api/manual-tickets/users/${u.id}`);
            setUsers(p => p.filter(x => x.id !== u.id));
        } catch (err) {
            alert(err.response?.data?.error || 'Error al eliminar');
        }
    };

    const startEdit = (u) => {
        setEditingId(u.id);
        setEditData({ nombre_real: u.nombre_real, activo: u.activo });
    };

    const handleUpdate = async (id) => {
        setSaving(true);
        try {
            await axios.put(`/api/manual-tickets/users/${id}`, editData);
            setUsers(p => p.map(u => u.id === id ? { ...u, ...editData } : u));
            setEditingId(null);
        } catch {
            setError('Error al actualizar');
        } finally {
            setSaving(false);
        }
    };

    // Activar/desactivar un permiso concreto de un operador.
    const togglePerm = async (u, key) => {
        const current = parsePerms(u.permisos);
        const next = current.includes(key) ? current.filter(p => p !== key) : [...current, key];
        const nextStr = next.join(',');
        // Optimista
        setUsers(p => p.map(x => x.id === u.id ? { ...x, permisos: nextStr } : x));
        try {
            await axios.put(`/api/manual-tickets/users/${u.id}`, {
                nombre_real: u.nombre_real,
                activo: u.activo,
                permisos: next,
            });
        } catch {
            // Revertir en caso de error
            setUsers(p => p.map(x => x.id === u.id ? { ...x, permisos: u.permisos } : x));
            alert('Error al cambiar permisos');
        }
    };

    const toggleFormPerm = (key) => {
        setFormData(p => ({
            ...p,
            permisos: p.permisos.includes(key) ? p.permisos.filter(x => x !== key) : [...p.permisos, key],
        }));
    };

    if (loading) return <p style={{ color: '#475569', fontSize: '0.9rem' }}>Cargando operadores...</p>;

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                    {users.length} operador(es) registrado(s)
                </p>
                <button
                    onClick={() => { setShowForm(p => !p); setError(''); }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.5rem 1rem',
                        background: showForm ? 'rgba(239,68,68,0.1)' : 'rgba(56,189,248,0.1)',
                        border: `1px solid ${showForm ? 'rgba(239,68,68,0.2)' : 'rgba(56,189,248,0.2)'}`,
                        borderRadius: '0.5rem',
                        color: showForm ? '#fca5a5' : '#38bdf8',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                    }}
                >
                    {showForm ? <X size={14} /> : <Plus size={14} />}
                    {showForm ? 'Cancelar' : 'Nuevo Operador'}
                </button>
            </div>

            {/* Formulario de creación */}
            {showForm && (
                <form onSubmit={handleCreate} style={{
                    marginBottom: '1.25rem',
                    padding: '1.25rem',
                    background: 'rgba(30,41,59,0.6)',
                    border: '1px solid rgba(56,189,248,0.15)',
                    borderRadius: '0.75rem',
                }}>
                    <h4 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: '700', color: '#38bdf8' }}>
                        Crear nuevo operador
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                        <input
                            placeholder="Usuario (login)" value={formData.username}
                            onChange={e => setFormData(p => ({ ...p, username: e.target.value }))}
                            style={inputSt}
                        />
                        <input
                            placeholder="Nombre real" value={formData.nombre_real}
                            onChange={e => setFormData(p => ({ ...p, nombre_real: e.target.value }))}
                            style={inputSt}
                        />
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showPass ? 'text' : 'password'}
                                placeholder="Contraseña" value={formData.password}
                                onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                                style={{ ...inputSt, paddingRight: '2rem' }}
                            />
                            <button type="button" onClick={() => setShowPass(p => !p)}
                                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 0 }}>
                                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>
                    </div>

                    {/* Permisos del nuevo operador */}
                    <div style={{ marginBottom: '1rem' }}>
                        <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Permisos
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {PERMISOS.map(perm => (
                                <PermChip
                                    key={perm.key}
                                    perm={perm}
                                    active={formData.permisos.includes(perm.key)}
                                    disabled={perm.locked}
                                    onToggle={() => !perm.locked && toggleFormPerm(perm.key)}
                                />
                            ))}
                        </div>
                        <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: '#475569' }}>
                            El rol <strong>Super Admin</strong> solo se asigna desde la base de datos.
                        </p>
                    </div>

                    {error && <p style={{ margin: '0 0 0.75rem', color: '#fca5a5', fontSize: '0.82rem' }}>{error}</p>}
                    <button type="submit" disabled={saving}
                        style={{ padding: '0.55rem 1.25rem', background: 'linear-gradient(135deg, #0ea5e9, #6366f1)', border: 'none', borderRadius: '0.5rem', color: 'white', fontWeight: '700', cursor: 'pointer', fontSize: '0.85rem' }}>
                        {saving ? 'Guardando...' : 'Crear Operador'}
                    </button>
                </form>
            )}

            {/* Lista */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {users.map(u => {
                    const isEditingThis = editingId === u.id;
                    const perms = parsePerms(u.permisos);
                    const esSuperadmin = perms.includes('superadmin');
                    return (
                        <div key={u.id} style={{
                            display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                            padding: '0.9rem 1.1rem',
                            background: 'rgba(30,41,59,0.5)',
                            border: `1px solid ${isEditingThis ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.06)'}`,
                            borderRadius: '0.75rem',
                            transition: 'border-color 0.2s',
                        }}>
                            {/* Info */}
                            <div style={{ flex: 1, minWidth: '160px' }}>
                                {isEditingThis ? (
                                    <input value={editData.nombre_real}
                                        onChange={e => setEditData(p => ({ ...p, nombre_real: e.target.value }))}
                                        style={{ ...inputSt, marginBottom: 0 }} />
                                ) : (
                                    <p style={{ margin: 0, fontWeight: '600', color: '#f1f5f9', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        {u.nombre_real}
                                        {esSuperadmin && <Lock size={12} color="#f472b6" title="Super Admin — protegido" />}
                                    </p>
                                )}
                                <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>@{u.username}</p>
                            </div>

                            {/* Permisos (toggles) */}
                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                {PERMISOS.map(perm => (
                                    <PermChip
                                        key={perm.key}
                                        perm={perm}
                                        active={perms.includes(perm.key)}
                                        disabled={perm.locked}
                                        onToggle={() => !perm.locked && togglePerm(u, perm.key)}
                                    />
                                ))}
                                <span style={{
                                    padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '600',
                                    background: u.activo ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                    color: u.activo ? '#10b981' : '#ef4444',
                                }}>
                                    {u.activo ? 'Activo' : 'Inactivo'}
                                </span>
                            </div>

                            {/* Acciones */}
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                {isEditingThis ? (
                                    <>
                                        <button onClick={() => handleUpdate(u.id)} title="Guardar"
                                            style={{ ...iconBtn, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }}>
                                            <Save size={14} />
                                        </button>
                                        <button onClick={() => setEditingId(null)} title="Cancelar"
                                            style={{ ...iconBtn, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
                                            <X size={14} />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button onClick={() => startEdit(u)} title="Editar nombre"
                                            style={{ ...iconBtn, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}>
                                            <Edit2 size={14} />
                                        </button>
                                        {esSuperadmin ? (
                                            <button title="Un Super Admin solo se elimina desde la base de datos" disabled
                                                style={{ ...iconBtn, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', color: '#334155', cursor: 'not-allowed' }}>
                                                <Lock size={14} />
                                            </button>
                                        ) : (
                                            <button onClick={() => handleDelete(u)} title="Eliminar"
                                                style={{ ...iconBtn, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// Chip/toggle de permiso. Si `disabled`, se muestra el estado pero no es editable.
function PermChip({ perm, active, disabled, onToggle }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            disabled={disabled}
            title={disabled ? perm.desc : `${active ? 'Quitar' : 'Activar'}: ${perm.desc}`}
            style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.25rem 0.6rem',
                borderRadius: '999px',
                fontSize: '0.72rem',
                fontWeight: '600',
                cursor: disabled ? 'default' : 'pointer',
                background: active ? `${perm.color}22` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${active ? `${perm.color}55` : 'rgba(255,255,255,0.08)'}`,
                color: active ? perm.color : '#475569',
                opacity: disabled && !active ? 0.5 : 1,
                transition: 'all 0.15s',
            }}
        >
            {disabled && <Lock size={10} />}
            {perm.label}
        </button>
    );
}

const inputSt = {
    width: '100%', boxSizing: 'border-box',
    padding: '0.55rem 0.75rem',
    background: 'rgba(15,23,42,0.6)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '0.5rem',
    color: '#f1f5f9',
    fontSize: '0.85rem',
    outline: 'none',
};

const iconBtn = {
    padding: '0.35rem',
    borderRadius: '0.4rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};
