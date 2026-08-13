import React from 'react';
import useSWR from 'swr';
import axios from 'axios';
import { Utensils, Ticket, Users, Star, ShieldCheck, TrendingUp, Activity, Clock } from 'lucide-react';

const fetcher = url => axios.get(url).then(r => r.data);

const S_CARD = {
    // Fondo OPACO (antes rgba con alpha): los fondos translúcidos dejan ver
    // los "fantasmas" de repintado del compositor en Chromium/Android
    background: '#1e293b',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '1rem',
    padding: '1.25rem 1.5rem',
};

function MiniStat({ icon: Icon, label, value, color }) {
    return (
        <div style={{ ...S_CARD, display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
                width: '42px', height: '42px', borderRadius: '10px', flexShrink: 0,
                background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Icon size={20} color={color} />
            </div>
            <div>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
                <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: '800', color: '#f1f5f9', lineHeight: 1.1 }}>
                    {value ?? <span style={{ fontSize: '1rem', color: '#475569' }}>—</span>}
                </p>
            </div>
        </div>
    );
}

export default function ResumenSection({ user }) {
    const { data: summary, isLoading } = useSWR('/api/stats/summary', fetcher, { refreshInterval: 60000 });
    const { data: health } = useSWR('/api/health', fetcher, { refreshInterval: 30000 });

    const now = new Date();
    const hora = now.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
    const fecha = now.toLocaleDateString('es-EC', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <div>
            {/* Bienvenida */}
            <div style={{
                ...S_CARD,
                marginBottom: '1.5rem',
                /* Gradiente sobre base OPACA (#1e293b) para no quedar translúcida */
                background: 'linear-gradient(135deg, rgba(14,165,233,0.12) 0%, rgba(99,102,241,0.12) 100%), #1e293b',
                border: '1px solid rgba(56,189,248,0.2)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1rem',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#38bdf8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Bienvenido de vuelta
                    </p>
                    <h2 style={{ margin: '0.2rem 0 0', fontSize: '1.4rem', fontWeight: '800', color: '#f1f5f9' }}>
                        {user?.nombre || 'Administrador'}
                    </h2>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#94a3b8', fontSize: '0.85rem', justifyContent: 'flex-end' }}>
                        <Clock size={14} />
                        <span>{hora}</span>
                    </div>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b', textTransform: 'capitalize' }}>{fecha}</p>
                </div>
            </div>

            {/* Estado del sistema */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.35rem 0.8rem',
                    background: health?.status === 'online' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${health?.status === 'online' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    borderRadius: '999px',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    color: health?.status === 'online' ? '#10b981' : '#ef4444',
                }}>
                    <Activity size={12} />
                    Base de Datos: {health?.status === 'online' ? 'Conectada' : 'Sin conexión'}
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.35rem 0.8rem',
                    background: 'rgba(16,185,129,0.1)',
                    border: '1px solid rgba(16,185,129,0.3)',
                    borderRadius: '999px',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    color: '#10b981',
                }}>
                    <TrendingUp size={12} />
                    API Backend: Online
                </div>
            </div>

            {/* Estadísticas hoy */}
            <h3 style={{ margin: '0 0 1rem', fontSize: '0.85rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Resumen de hoy
            </h3>

            {isLoading ? (
                <p style={{ color: '#475569', fontSize: '0.9rem' }}>Cargando estadísticas...</p>
            ) : (
                <div className="resumen-grid">
                    <MiniStat icon={Utensils} label="Total almuerzos" value={summary?.totalLunches} color="#38bdf8" />
                    <MiniStat icon={Ticket} label="Normal" value={summary?.totalNormal} color="#7dd3fc" />
                    <MiniStat icon={Utensils} label="Dieta" value={summary?.totalDieta} color="#10b981" />
                    <MiniStat icon={ShieldCheck} label="Gerencia" value={summary?.totalGerencia} color="#a78bfa" />
                    <MiniStat icon={Users} label="Visitas" value={summary?.totalVisita} color="#fb923c" />
                    <MiniStat icon={Star} label="Extra" value={summary?.totalExtra} color="#fbbf24" />
                </div>
            )}
        </div>
    );
}
