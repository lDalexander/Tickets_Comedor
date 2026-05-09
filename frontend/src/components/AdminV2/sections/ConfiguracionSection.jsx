import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Clock, ToggleLeft, ToggleRight, Save, CheckCircle, AlertCircle } from 'lucide-react';

const S_CARD = {
    background: 'rgba(30,41,59,0.6)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '1rem',
    padding: '1.5rem',
};

export default function ConfiguracionSection({ authHeaders }) {
    const [config, setConfig] = useState({
        horario_activo: 'false',
        horario_inicio: '11:45',
        horario_fin: '14:00',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', msg }

    useEffect(() => {
        axios.get('/api/config')
            .then(r => setConfig(prev => ({ ...prev, ...r.data })))
            .catch(() => setFeedback({ type: 'error', msg: 'No se pudo cargar la configuración' }))
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setFeedback(null);
        try {
            await axios.post('/api/config', config, { headers: authHeaders });
            setFeedback({ type: 'success', msg: 'Configuración guardada correctamente' });
        } catch (err) {
            setFeedback({ type: 'error', msg: err.response?.data?.error || 'Error al guardar' });
        } finally {
            setSaving(false);
            setTimeout(() => setFeedback(null), 4000);
        }
    };

    const toggleHorario = () => {
        setConfig(p => ({ ...p, horario_activo: p.horario_activo === 'true' ? 'false' : 'true' }));
    };

    const isActive = config.horario_activo === 'true';

    if (loading) return <p style={{ color: '#475569', fontSize: '0.9rem' }}>Cargando configuración...</p>;

    return (
        <div style={{ maxWidth: '520px' }}>
            <div style={{ ...S_CARD }}>
                <h3 style={{ margin: '0 0 1.5rem', fontSize: '1rem', fontWeight: '700', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Clock size={18} color="#38bdf8" />
                    Control de Horario de Servicio
                </h3>

                {/* Toggle */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '1rem 1.2rem',
                    background: isActive ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isActive ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '0.75rem',
                    marginBottom: '1.5rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                }}
                    onClick={toggleHorario}
                >
                    <div>
                        <p style={{ margin: 0, fontWeight: '700', color: '#f1f5f9', fontSize: '0.95rem' }}>
                            Restricción de horario
                        </p>
                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                            {isActive
                                ? `Activa — solo permite tickets entre ${config.horario_inicio} y ${config.horario_fin}`
                                : 'Inactiva — se aceptan tickets en cualquier horario'}
                        </p>
                    </div>
                    {isActive
                        ? <ToggleRight size={32} color="#10b981" />
                        : <ToggleLeft size={32} color="#475569" />}
                </div>

                {/* Rango de horas */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#94a3b8', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Hora inicio
                        </label>
                        <input
                            type="time"
                            value={config.horario_inicio}
                            onChange={e => setConfig(p => ({ ...p, horario_inicio: e.target.value }))}
                            disabled={!isActive}
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                padding: '0.65rem 0.75rem',
                                background: isActive ? 'rgba(15,23,42,0.6)' : 'rgba(15,23,42,0.3)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '0.6rem',
                                color: isActive ? '#f1f5f9' : '#475569',
                                fontSize: '1rem',
                                fontWeight: '600',
                                outline: 'none',
                                cursor: isActive ? 'text' : 'not-allowed',
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#94a3b8', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Hora fin
                        </label>
                        <input
                            type="time"
                            value={config.horario_fin}
                            onChange={e => setConfig(p => ({ ...p, horario_fin: e.target.value }))}
                            disabled={!isActive}
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                padding: '0.65rem 0.75rem',
                                background: isActive ? 'rgba(15,23,42,0.6)' : 'rgba(15,23,42,0.3)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '0.6rem',
                                color: isActive ? '#f1f5f9' : '#475569',
                                fontSize: '1rem',
                                fontWeight: '600',
                                outline: 'none',
                                cursor: isActive ? 'text' : 'not-allowed',
                            }}
                        />
                    </div>
                </div>

                {/* Feedback */}
                {feedback && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.65rem 0.9rem',
                        marginBottom: '1rem',
                        background: feedback.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                        border: `1px solid ${feedback.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        borderRadius: '0.6rem',
                        color: feedback.type === 'success' ? '#6ee7b7' : '#fca5a5',
                        fontSize: '0.85rem',
                    }}>
                        {feedback.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                        {feedback.msg}
                    </div>
                )}

                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        width: '100%',
                        padding: '0.75rem',
                        background: saving ? 'rgba(56,189,248,0.3)' : 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                        border: 'none',
                        borderRadius: '0.6rem',
                        color: 'white',
                        fontSize: '0.9rem',
                        fontWeight: '700',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                    }}
                >
                    <Save size={15} />
                    {saving ? 'Guardando...' : 'Guardar Configuración'}
                </button>
            </div>
        </div>
    );
}
