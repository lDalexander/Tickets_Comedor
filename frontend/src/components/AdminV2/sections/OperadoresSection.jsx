import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Edit2, Save, X, ShieldCheck, ShieldOff, Eye, EyeOff } from 'lucide-react';

const EMPTY_FORM = { username: '', password: '', nombre_real: '', activo: 1, rol: 'operador' };

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
            setError('Todos los campos son requeridos');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await axios.post('/api/manual-tickets/users', formData);
            // Set rol via admin route
            const allUsers = await axios.get('/api/manual-tickets/users');
            const created = allUsers.data.find(u => u.username === formData.username);
            if (created && formData.rol === 'admin') {
                await axios.put(
                    `/api/admin/data/usuarios_impresion_manual/id/${created.id}`,
                    { rol: 'admin' },
                    { headers: authHeaders }
                );
            }
            setFormData(EMPTY_FORM);
            setShowForm(false);
            load();
        } catch (err) {
            setError(err.response?.data?.error || 'Error al crear usuario');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id, nombre) => {
        if (!window.confirm(`¿Eliminar operador "${nombre}"?`)) return;
        try {
            await axios.delete(`/api/manual-tickets/users/${id}`);
            setUsers(p => p.filter(u => u.id !== id));
        } catch {
            alert('Error al eliminar');
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

    const toggleRol = async (u) => {
        const newRol = u.rol === 'admin' ? 'operador' : 'admin';
        try {
            await axios.put(
                `/api/admin/data/usuarios_impresion_manual/id/${u.id}`,
                { rol: newRol },
                { headers: authHeaders }
            );
            setUsers(p => p.map(x => x.id === u.id ? { ...x, rol: newRol } : x));
        } catch {
            alert('Error al cambiar rol');
        }
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
                        <select value={formData.rol} onChange={e => setFormData(p => ({ ...p, rol: e.target.value }))} style={inputSt}>
                            <option value="operador">Operador (solo tickets)</option>
                            <option value="admin">Admin (acceso panel)</option>
                        </select>
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
                                    <p style={{ margin: 0, fontWeight: '600', color: '#f1f5f9', fontSize: '0.9rem' }}>{u.nombre_real}</p>
                                )}
                                <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>@{u.username}</p>
                            </div>

                            {/* Badges */}
                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{
                                    padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '600',
                                    background: u.rol === 'admin' ? 'rgba(139,92,246,0.15)' : 'rgba(56,189,248,0.1)',
                                    color: u.rol === 'admin' ? '#a78bfa' : '#38bdf8',
                                }}>
                                    {u.rol === 'admin' ? 'Admin' : 'Operador'}
                                </span>
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
                                        <button onClick={() => toggleRol(u)} title={u.rol === 'admin' ? 'Quitar admin' : 'Dar acceso admin'}
                                            style={{ ...iconBtn, background: u.rol === 'admin' ? 'rgba(139,92,246,0.1)' : 'rgba(56,189,248,0.08)', border: `1px solid ${u.rol === 'admin' ? 'rgba(139,92,246,0.2)' : 'rgba(56,189,248,0.15)'}`, color: u.rol === 'admin' ? '#a78bfa' : '#38bdf8' }}>
                                            {u.rol === 'admin' ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                                        </button>
                                        <button onClick={() => handleDelete(u.id, u.nombre_real)} title="Eliminar"
                                            style={{ ...iconBtn, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
                                            <Trash2 size={14} />
                                        </button>
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
