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

const getWeekDates = () => {
    // Return array of next 5 weekdays skipping weekends
    // Standard implementation
    const dates = [];
    let current = new Date();

    // Convert to Ecuador time (UTC-5)
    current.setHours(current.getHours() - 5);

    // Add logic to get next 5 days
    // Skip today if it's past 14:00 EC time
    if (current.getHours() >= 14) {
        current.setDate(current.getDate() + 1);
    }

    while (dates.length < 5) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) { // Skip Sunday and Saturday
            const iso = new Date(current.getTime() - (current.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            dates.push({
                date: iso,
                dayName: new Intl.DateTimeFormat('es-EC', { weekday: 'long' }).format(current),
                displayDate: new Intl.DateTimeFormat('es-EC', { month: 'short', day: 'numeric' }).format(current)
            });
        }
        current.setDate(current.getDate() + 1);
    }
    return dates;
};

// Extracted and Memoized DayCard component
const DayCard = React.memo(({ d, selected, option, isLocked, isPast, isLate, onToggle, onSetOption }) => {
    return (
        <div className="card day-card" style={{
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
                    onClick={() => onToggle(d.date)}
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
                        flexShrink: 0
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
                        onClick={() => onSetOption(d.date, 1)}
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
                        onClick={() => onSetOption(d.date, 2)}
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
});

// Extracted and Memoized OperativoView component
const OperativoView = React.memo(({ defaultMenuType, onDefaultMenuChange }) => {
    return (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', background: '#1e293b', borderRadius: '8px', border: defaultMenuType === 'Dieta' ? '2px solid #f472b6' : '1px solid #334155' }}>
            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <Utensils size={20} color={defaultMenuType === 'Dieta' ? '#f472b6' : '#94a3b8'} />
                Preferencia Predeterminada
            </h3>

            <div
                onClick={() => onDefaultMenuChange({ target: { checked: defaultMenuType !== 'Dieta' } })}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '1rem',
                    cursor: 'pointer',
                    background: '#0f172a',
                    padding: '1rem',
                    borderRadius: '12px',
                    margin: '0 auto',
                    maxWidth: '300px'
                }}
            >
                <span style={{ color: defaultMenuType === 'Normal' ? '#3b82f6' : '#64748b', fontWeight: 'bold' }}>NORMAL</span>

                <div style={{
                    width: '60px',
                    height: '32px',
                    background: defaultMenuType === 'Dieta' ? '#f472b6' : '#334155',
                    borderRadius: '999px',
                    position: 'relative',
                    transition: 'background 0.3s'
                }}>
                    <div style={{
                        width: '26px',
                        height: '26px',
                        background: 'white',
                        borderRadius: '50%',
                        position: 'absolute',
                        top: '3px',
                        left: defaultMenuType === 'Dieta' ? '31px' : '3px',
                        transition: 'left 0.3s',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }} />
                </div>

                <span style={{ color: defaultMenuType === 'Dieta' ? '#f472b6' : '#64748b', fontWeight: 'bold' }}>DIETA</span>
            </div>

            <div style={{ marginTop: '1.5rem', color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.6' }}>
                <p style={{ marginBottom: '0.5rem' }}>
                    <strong style={{ color: '#e2e8f0' }}>¿Cómo funciona?</strong>
                </p>
                <p>
                    Al activar esta opción, el sistema imprimirá automáticamente un ticket de
                    <strong style={{ color: '#f472b6' }}> DIETA</strong> cada vez que marques asistencia.
                </p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', fontStyle: 'italic' }}>
                    (Esta configuración se mantiene guardada hasta que decidas cambiarla).
                </p>
            </div>
        </div>
    );
});

const MenuSelection = () => {
    const [userId, setUserId] = useState('');
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(false);
    const [dates, setDates] = useState([]);
    const isSelection = React.useRef(false);
    // selections: { '2023-10-27': 1 (Normal) | 2 (Diet) | null (No lunch) }
    const [selections, setSelections] = useState({});
    const [savedSelections, setSavedSelections] = useState({}); // Track what is actually in DB
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // New State for Role and Default Menu
    const [role, setRole] = useState('Operativo');
    const [defaultMenuType, setDefaultMenuType] = useState('Normal');

    useEffect(() => {
        setDates(getWeekDates());
    }, []);

    // Search users/ids
    useEffect(() => {
        if (!userId) {
            setSuggestions([]);
            return;
        }

        if (isSelection.current) {
            isSelection.current = false;
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            try {
                // Use new endpoint path
                const res = await axios.get(`/api/search/users?q=${userId}`);
                setSuggestions(res.data);
                setShowSuggestions(true);
            } catch (error) {
                console.error("Search error", error);
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
            const res = await axios.get(`/api/users/${userId}`);
            if (res.data.success) {
                setUser(res.data);
                // Load preferences from DB
                setRole(res.data.role || 'Operativo');
                setDefaultMenuType(res.data.defaultMenuType || 'Normal');

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
                const d = item.fecha.split('T')[0];
                map[d] = item.opcion;
            });
            setSelections(map);
            setSavedSelections(map);
        } catch (error) {
            console.error(error);
        }
    };

    const toggleDay = React.useCallback((date) => {
        setSelections(prev => {
            if (prev[date]) {
                const next = { ...prev };
                delete next[date];
                return next;
            }
            return { ...prev, [date]: 1 };
        });
    }, []);

    const setOption = React.useCallback((date, option) => {
        setSelections(prev => ({ ...prev, [date]: option }));
    }, []);

    const handleRoleChange = async (newRole) => {
        setRole(newRole);
        // Save immediately? Or wait for 'Guardar'? 
        // The prompt implies saving the preference. I'll save it when "Guardar" is clicked or immediately?
        // "Si el Check está activo, se guarda en la BD como 'Dieta'." -> Implies saving on action or save button.
        // Let's rely on the main "Guardar" button to save EVERYTHING (preferences + menu).
    };

    const handleDefaultMenuChange = (e) => {
        const isChecked = e.target.checked;
        setDefaultMenuType(isChecked ? 'Dieta' : 'Normal');
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // 1. Save Preferences (Role + Default Menu)
            await axios.put(`/api/users/${userId}/preferences`, {
                role,
                defaultMenuType
            });

            // 2. Save Daily Selections (Only if Admin, or maybe even if Operational we clear them?)
            // If Operational, the logic is "Default Menu", so maybe we don't need daily selections?
            // But the prompt says "If Admin: Allow free selection... If Operativo: Show switch...".
            // It doesn't explicitly say Operational CAN'T have daily exceptions, but it implies the switch controls the behavior.
            // However, `comedor.py` logic I will check later: it prioritized `menu_diario` (Web) > `default_menu_type`.
            // So if an Operational user wants to use the system, does the switch set `menu_diario` entries? 
            // "Si el Check está activo, se guarda en la BD como 'Dieta'. Si está inactivo, se guarda como 'Normal'."
            // This phrasing "saved in DB as 'Dieta'" likely refers to `default_menu_type` column I added.

            // If the user is Operational, we might NOT want to save `menu_diario` entries, OR we save them all as the default?
            // The prompt says "Modify `comedor.py` ... Query `users` searching for `default_menu_type` ... If result is 'Dieta', print diet".
            // This implies `comedor.py` will look at `users` table. 
            // So for Operational users, we just update `users` table.

            // However, if I leave `selections` logic for Admin, I should definitely save it.
            if (role === 'Administrativo') {
                const payload = {
                    userId,
                    selections: dates.map(d => ({
                        date: d.date,
                        option: selections[d.date] || null
                    }))
                };
                await axios.post('/api/menu', payload);
                setSavedSelections({ ...selections });
            }

            setMessage({ type: 'success', text: 'Preferencias guardadas correctamente' });
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            setMessage({ type: 'error', text: 'Error al guardar' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="menu-container" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
            {!user ? (
                <div className="card login-card" style={{ maxWidth: '400px', margin: '4rem auto', textAlign: 'center' }}>
                    {/* ... Login Form (Existing code) ... */}
                    {/* I will keep the existing login form code here by reference or just minimal changes if needed */}
                    {/* But since I am replacing the whole component body, I need to include it. */}
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
                            <p style={{ color: '#94a3b8' }}>Configuración de Comedor</p>
                        </div>
                        <button
                            onClick={() => setUser(null)}
                            style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}
                        >
                            Salir
                        </button>
                    </div>

                    {/* ROLE SELECTOR */}
                    <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem', background: '#1e293b', borderRadius: '8px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#94a3b8' }}>Tipo de Personal:</label>
                        <select
                            value={role}
                            onChange={(e) => handleRoleChange(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                borderRadius: '6px',
                                background: '#0f172a',
                                border: '1px solid #334155',
                                color: 'white',
                                fontSize: '1rem'
                            }}
                        >
                            <option value="Operativo">Operativo (Planta)</option>
                            <option value="Administrativo">Administrativo (Oficina)</option>
                        </select>
                    </div>

                    {/* CONDITIONAL CONTENT */}
                    {role === 'Operativo' ? (
                        <OperativoView
                            defaultMenuType={defaultMenuType}
                            onDefaultMenuChange={handleDefaultMenuChange}
                        />
                    ) : (
                        // ADMIN VIEW (Existing Week Selector)
                        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(0, 1fr)' }}>
                            {dates.map((d) => {
                                const selected = !!selections[d.date];
                                const option = selections[d.date];

                                const now = new Date();
                                const todayStr = now.toLocaleDateString('sv-SE');
                                const currentHour = now.getHours();

                                const isPast = d.date < todayStr;
                                const isToday = d.date === todayStr;
                                const isLate = isToday && currentHour >= 14;

                                const isSaved = !!savedSelections[d.date];
                                const isLocked = isPast || isLate || isSaved;

                                return (
                                    <DayCard
                                        key={d.date}
                                        d={d}
                                        selected={selected}
                                        option={option}
                                        isLocked={isLocked}
                                        isPast={isPast}
                                        isLate={isLate}
                                        onToggle={toggleDay}
                                        onSetOption={setOption}
                                    />
                                );
                            })}
                        </div>
                    )}

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
                            John Alexander Garcia | Todos los derechos reservados |DETCUADOR S.A.| Version 3.0
                        </p>
                    </div>
                </div>
            )
            }
        </div >
    );
};


export default MenuSelection;
