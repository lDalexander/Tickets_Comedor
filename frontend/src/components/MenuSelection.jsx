import React, { useState, useEffect } from 'react';
import { User, Calendar, Save, Check, X, Utensils, Salad } from 'lucide-react';
import axios from 'axios';

// Logic to get current week's dates (Mon-Fri)
const getWeekDates = () => {
    const curr = new Date();
    const week = [];
    // Adjust to Monday
    // Day 1 = Mon, 0 = Sun
    const day = curr.getDay();
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1);

    for (let i = 0; i < 5; i++) {
        const first = new Date(curr.setDate(diff + i));
        week.push({
            date: first.toISOString().slice(0, 10),
            dayName: new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(first),
            displayDate: new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' }).format(first)
        });
    }
    return week;
};

const MenuSelection = () => {
    const [userId, setUserId] = useState('');
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(false);
    const [dates, setDates] = useState([]);
    // selections: { '2023-10-27': 1 (Normal) | 2 (Diet) | null (No lunch) }
    const [selections, setSelections] = useState({});
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    useEffect(() => {
        setDates(getWeekDates());
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Updated relative URL for proxy
            const res = await axios.get(`/api/users/${userId}`);
            if (res.data.success) {
                setUser(res.data);
                fetchSelections(userId);
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Usuario no encontrado' });
        } finally {
            setLoading(false);
        }
    };

    const fetchSelections = async (id) => {
        try {
            const res = await axios.get(`/api/menu/${id}`);
            const map = {};
            res.data.forEach(item => {
                // Parse date string correctly from DB (YYYY-MM-DD)
                const d = item.fecha.split('T')[0];
                map[d] = item.opcion;
            });
            setSelections(map);
        } catch (error) {
            console.error(error);
        }
    };

    const toggleDay = (date) => {
        setSelections(prev => {
            if (prev[date]) {
                const next = { ...prev };
                delete next[date]; // Remove selection (No lunch)
                return next;
            }
            return { ...prev, [date]: 1 }; // Default to Normal (1)
        });
    };

    const setOption = (date, option) => {
        setSelections(prev => ({ ...prev, [date]: option }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                userId,
                selections: dates.map(d => ({
                    date: d.date,
                    option: selections[d.date] || null // null means delete/no lunch
                }))
            };
            await axios.post('/api/menu', payload);
            setMessage({ type: 'success', text: 'Selección guardada correctamente' });
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            setMessage({ type: 'error', text: 'Error al guardar selección' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
            {!user ? (
                <div className="card" style={{ maxWidth: '400px', margin: '4rem auto', textAlign: 'center' }}>
                    <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                        <div style={{ padding: '1rem', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '50%' }}>
                            <Utensils size={48} color="#38bdf8" />
                        </div>
                    </div>
                    <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Selección de Menú</h1>
                    <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>Ingresa tu Código de Reloj para continuar</p>

                    <form onSubmit={handleLogin}>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <input
                                type="text"
                                placeholder="ID de Usuario"
                                value={userId}
                                onChange={e => setUserId(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    borderRadius: '8px',
                                    background: '#1e293b',
                                    border: '1px solid #334155',
                                    color: 'white',
                                    fontSize: '1.1rem',
                                    textAlign: 'center'
                                }}
                                autoFocus
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '1rem',
                                fontWeight: '600',
                                opacity: loading ? 0.7 : 1,
                                cursor: 'pointer'
                            }}
                        >
                            {loading ? 'Verificando...' : 'Ingresar'}
                        </button>
                        {message && (
                            <div style={{ marginTop: '1rem', color: '#ef4444' }}>{message.text}</div>
                        )}
                    </form>
                </div>
            ) : (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                        <div>
                            <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span role="img" aria-label="wave">👋</span> Hola, {user.name}
                            </h2>
                            <p style={{ color: '#94a3b8' }}>Planifica tus almuerzos para esta semana</p>
                        </div>
                        <button
                            onClick={() => setUser(null)}
                            style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}
                        >
                            Salir
                        </button>
                    </div>

                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {dates.map((d) => {
                            const selected = !!selections[d.date];
                            const option = selections[d.date]; // 1 = Normal, 2 = Diet

                            return (
                                <div key={d.date} className="card" style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    border: selected ? '1px solid #3b82f6' : '1px solid transparent',
                                    background: selected ? 'rgba(59, 130, 246, 0.05)' : '#1e293b'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                        <div
                                            onClick={() => toggleDay(d.date)}
                                            style={{
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '6px',
                                                border: selected ? 'none' : '2px solid #475569',
                                                background: selected ? '#3b82f6' : 'transparent',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {selected && <Check size={16} color="white" />}
                                        </div>
                                        <div>
                                            <h3 style={{ textTransform: 'capitalize', fontSize: '1.1rem' }}>{d.dayName}</h3>
                                            <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>{d.displayDate}</span>
                                        </div>
                                    </div>

                                    {selected && (
                                        <div style={{ display: 'flex', gap: '0.5rem', background: '#0f172a', padding: '0.25rem', borderRadius: '8px' }}>
                                            <button
                                                onClick={() => setOption(d.date, 1)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                    padding: '0.5rem 1rem',
                                                    borderRadius: '6px',
                                                    border: 'none',
                                                    background: option === 1 ? '#3b82f6' : 'transparent',
                                                    color: option === 1 ? 'white' : '#94a3b8',
                                                    cursor: 'pointer',
                                                    fontWeight: '500'
                                                }}
                                            >
                                                <Utensils size={16} /> Normal
                                            </button>
                                            <button
                                                onClick={() => setOption(d.date, 2)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                    padding: '0.5rem 1rem',
                                                    borderRadius: '6px',
                                                    border: 'none',
                                                    background: option === 2 ? '#f472b6' : 'transparent',
                                                    color: option === 2 ? 'white' : '#94a3b8',
                                                    cursor: 'pointer',
                                                    fontWeight: '500'
                                                }}
                                            >
                                                <Salad size={16} /> Dieta
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                        {message && (
                            <span style={{ marginRight: '1rem', color: message.type === 'success' ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center' }}>
                                {message.text}
                            </span>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                background: '#10b981',
                                // border: 'none', (removed comment)
                                border: 'none',
                                borderRadius: '8px',
                                color: 'white',
                                padding: '1rem 2rem',
                                cursor: 'pointer',
                                fontSize: '1.1rem',
                                fontWeight: '600',
                                boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3)'
                            }}
                        >
                            <Save size={20} /> {saving ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MenuSelection;
