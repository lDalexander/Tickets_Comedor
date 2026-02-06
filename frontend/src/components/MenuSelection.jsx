import React, { useState, useEffect } from 'react';
import { User, Calendar, Save, Check, X, Utensils, Salad } from 'lucide-react';
import axios from 'axios';

// Logic to get current week's dates (Mon-Fri)
// Helper to get consistent Ecuador time (UTC-5)
const getEcuadorTime = () => {
    // Format: YYYY-MM-DD HH:MM:SS
    const fmt = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Guayaquil',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23'
    });
    const parts = fmt.formatToParts(new Date());
    const getPart = (type) => parts.find(p => p.type === type).value;

    const dateStr = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
    const hour = parseInt(getPart('hour'), 10);

    // Create Date object for week calc (at midnight)
    const dateObj = new Date(`${dateStr}T00:00:00`);

    return { dateStr, hour, dateObj };
};

// Logic to get current week's dates (Mon-Fri) based on Ecuador Time
const getWeekDates = () => {
    const { dateObj } = getEcuadorTime();
    const curr = new Date(dateObj); // Clone
    const week = [];
    // Adjust to Monday
    const day = curr.getDay(); // 0-6
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1);

    for (let i = 0; i < 5; i++) {
        const d = new Date(curr);
        d.setDate(diff + i);
        // Use local formatting since 'd' is already aligned to Ecuador day boundaries conceptually
        // Actually, we need to format 'd' as YYYY-MM-DD
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dayNum = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${dayNum}`;

        week.push({
            date: dateStr,
            dayName: new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(d),
            displayDate: new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' }).format(d)
        });
    }
    return week;
};

const MenuSelection = () => {
    const [userId, setUserId] = useState('');
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(false);
    const [dates, setDates] = useState([]);
    const isSelection = React.useRef(false);
    // selections: { '2023-10-27': 1 (Normal) | 2 (Diet) | null (No lunch) }
    // selections: { '2023-10-27': 1 (Normal) | 2 (Diet) | null (No lunch) }
    const [selections, setSelections] = useState({});
    const [savedSelections, setSavedSelections] = useState({}); // Track what is actually in DB
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    useEffect(() => {
        setDates(getWeekDates());
    }, []);

    // Debounced search effect
    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (isSelection.current) {
                isSelection.current = false;
                return;
            }

            if (userId.length > 1 && !userId.match(/^\d+$/)) {
                // If it's not just numbers, try searching names
                try {
                    const res = await axios.get(`/api/users/search/query?q=${userId}`);
                    setSuggestions(res.data);
                    setShowSuggestions(true);
                } catch (e) {
                    setSuggestions([]);
                }
            } else if (userId.length > 0) {
                // Even if number, maybe search? User said "example I am 33 that put Garcia"
                // But also "users related 33 - GARCIA..."
                // So searching by number is also good.
                try {
                    const res = await axios.get(`/api/users/search/query?q=${userId}`);
                    setSuggestions(res.data);
                    setShowSuggestions(true);
                } catch (e) {
                    setSuggestions([]);
                }
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [userId]);

    const selectSuggestion = (id, name) => {
        isSelection.current = true;
        setUserId(String(id));
        setSuggestions([]);
        setShowSuggestions(false);
    };

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
            setSavedSelections(map); // Sync saved state
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
            setSavedSelections({ ...selections }); // Mark current as saved
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            setMessage({ type: 'error', text: 'Error al guardar selección' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="menu-container" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
            {!user ? (
                <div className="card login-card" style={{ maxWidth: '400px', margin: '4rem auto', textAlign: 'center' }}>
                    <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                        <div style={{ padding: '1rem', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '50%' }}>
                            <Utensils size={48} color="#38bdf8" />
                        </div>
                    </div>
                    <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Selección de Menú</h1>
                    <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>Ingresa tu Código de Reloj para continuar</p>

                    <form onSubmit={handleLogin}>
                        <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
                            <input
                                type="text"
                                placeholder="ID o Nombre..."
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
                                    textAlign: 'center',
                                    boxSizing: 'border-box'
                                }}
                                autoFocus
                                autoComplete="off"
                            />
                            {/* Suggestions Dropdown */}
                            {showSuggestions && suggestions.length > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    background: '#1e293b',
                                    border: '1px solid #475569',
                                    borderRadius: '0 0 8px 8px',
                                    zIndex: 10,
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)'
                                }}>
                                    {suggestions.map(s => (
                                        <div
                                            key={s.zk_id}
                                            onClick={() => selectSuggestion(s.zk_id, s.nombre_completo)}
                                            style={{
                                                padding: '0.75rem',
                                                borderBottom: '1px solid #334155',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                color: '#cbd5e1',
                                                fontSize: '0.95rem'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#334155'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>{s.zk_id}</span> - {s.nombre_completo}
                                        </div>
                                    ))}
                                </div>
                            )}
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

                    <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(0, 1fr)' }}>
                        {dates.map((d) => {
                            const selected = !!selections[d.date];
                            const option = selections[d.date]; // 1 = Normal, 2 = Diet

                            // New Logic: 2 PM Cutoff
                            const now = new Date();
                            const todayStr = now.toLocaleDateString('sv-SE');
                            const currentHour = now.getHours();

                            const isPast = d.date < todayStr;
                            const isToday = d.date === todayStr;
                            const isLate = isToday && currentHour >= 14; // 14:00 = 2 PM

                            // Locked if: Past OR (Today & Late) OR (ANY Saved Selection)
                            // User wants strictest lock: Once saved/confirmed, it cannot be changed.
                            const isSaved = !!savedSelections[d.date];
                            const isLocked = isPast || isLate || isSaved;

                            return (
                                <div key={d.date} className="card day-card" style={{
                                    border: selected ? '1px solid #3b82f6' : '1px solid transparent',
                                    background: isLocked ? 'rgba(30, 41, 59, 0.5)' : (selected ? 'rgba(59, 130, 246, 0.05)' : '#1e293b'),
                                    opacity: isLocked ? 0.6 : 1,
                                    pointerEvents: isLocked ? 'none' : 'auto',
                                }}>
                                    {isLocked && (
                                        <div className="day-status">
                                            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{isPast ? 'Cerrado' : (isLate ? 'Hora límite excedida' : 'Confirmado')}</span>
                                            <span style={{ fontSize: '1rem' }}>🔒</span>
                                        </div>
                                    )}
                                    <div className="day-content">
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
                                                cursor: isLocked ? 'not-allowed' : 'pointer',
                                                flexShrink: 0 // Prevent checkbox shrinking
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
                                        <div className="day-actions">
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
                    <div className="page-header" style={{ marginTop: '2rem', textAlign: 'center', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                        <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                            John Alexander Garcia | Todos los derechos reservados |DETCUADOR S.A.| Version 2.9
                        </p>
                    </div>
                </div>
            )
            }
        </div >
    );
};


export default MenuSelection;
