// components/Dashboard.jsx
import React, { useState } from 'react';
import useSWR from 'swr';
import axios from 'axios';
import StatCard from './StatCard';
import { DailyTrendChart, LunchTypeChart } from './Charts';
import LiveTerminal from './LiveTerminal';
import ManualTicketModal from './ManualTicketModal';
import ThirdPartyTicketModal from './ThirdPartyTicketModal';
import logo from '../assets/logo_sigac.png';
import { Utensils, Ticket, Users, Database, Calendar, UserPlus, ShieldCheck, Eye, Star } from 'lucide-react';

const fetcher = url => axios.get(url).then(res => res.data);

const Dashboard = () => {
    const [showManualModal, setShowManualModal] = useState(false);
    const [showTerceroModal, setShowTerceroModal] = useState(false);

    // Filter State
    const [dateRange, setDateRange] = useState({
        start: '',
        end: ''
    });
    const [typeFilter, setTypeFilter] = useState('');

    const handleDateChange = (e) => {
        const { name, value } = e.target;
        setDateRange(prev => ({ ...prev, [name]: value }));
    };

    const handleTypeChange = (e) => {
        setTypeFilter(e.target.value);
    };

    // Build query params
    const params = new URLSearchParams();
    if (dateRange.start) params.append('startDate', dateRange.start);
    if (dateRange.end) params.append('endDate', dateRange.end);
    if (typeFilter) params.append('type', typeFilter);

    const queryString = params.toString() ? `?${params.toString()}` : '';

    const swrOpts = { refreshInterval: 60000, keepPreviousData: true, revalidateOnFocus: false };
    const { data: summary, isLoading: isLoadingSummary } = useSWR(`/api/stats/summary${queryString}`, fetcher, swrOpts);
    const { data: dailyData, isLoading: isLoadingDaily } = useSWR(`/api/stats/daily${queryString}`, fetcher, swrOpts);
    const { data: historyLog, isLoading: isLoadingHistory } = useSWR(`/api/stats/history${queryString}`, fetcher, swrOpts);
    const { data: healthRes, error: healthError } = useSWR(`/api/health`, fetcher, { refreshInterval: 60000, errorRetryCount: 1, revalidateOnFocus: false });

    const dbStatus = healthError ? 'offline' : (healthRes?.status || 'checking');
    const loading = isLoadingSummary || isLoadingDaily || isLoadingHistory;

    const handleFilter = () => { };

    // Download Handler
    const handleDownload = () => {
        if (!dateRange.start || !dateRange.end) {
            alert("Por favor, selecciona un rango de fechas para descargar el reporte.\n(Esto evita descargas masivas que bloqueen el sistema).");
            return;
        }
        const baseUrl = '/api';
        let query = `?startDate=${dateRange.start}&endDate=${dateRange.end}&type=${typeFilter}`;
        window.open(`${baseUrl}/stats/export-excel${query}`, '_blank');
    };

    // Helper to format time
    const formatTime = (dateStr, timeStr) => {
        if (!dateStr || !timeStr) return timeStr;
        try {
            const localDate = new Date(`${dateStr}T${timeStr}`);
            return localDate.toLocaleTimeString();
        } catch (e) {
            return timeStr;
        }
    };

    // Helper for ticket type badge color
    const getTypeBadge = (type) => {
        const t = (type || '').toUpperCase();
        if (t.includes('GERENCIA')) return { bg: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', label: 'Gerencia' };
        if (t.includes('VISITA')) return { bg: 'rgba(249, 115, 22, 0.15)', color: '#fb923c', label: 'Visita' };
        if (t.includes('DIETA')) return { bg: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7', label: 'Dieta' };
        if (t.includes('EXTRA')) return { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', label: 'Extra' };
        if (t.includes('TERCERO')) return { bg: 'rgba(244, 114, 182, 0.15)', color: '#f472b6', label: 'Tercero' };
        return { bg: 'rgba(56, 189, 248, 0.15)', color: '#7dd3fc', label: 'Normal' };
    };

    if (loading && !summary) return <div className="page-header" style={{ textAlign: 'center' }}>Cargando datos...</div>;

    const safeDailyData = dailyData || [];
    const safeHistoryLog = historyLog || [];

    // Aggregate for doughnut chart
    const chartTypeData = {
        type_normal: safeDailyData.reduce((acc, curr) => acc + (parseInt(curr.type_normal) || 0), 0),
        type_dieta: safeDailyData.reduce((acc, curr) => acc + (parseInt(curr.type_dieta) || 0), 0),
        type_gerencia: safeDailyData.reduce((acc, curr) => acc + (parseInt(curr.type_gerencia) || 0), 0),
        type_visita: safeDailyData.reduce((acc, curr) => acc + (parseInt(curr.type_visita) || 0), 0),
        type_extra: safeDailyData.reduce((acc, curr) => acc + (parseInt(curr.type_extra) || 0), 0),
    };

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(56, 189, 248, 0.05)', padding: '8px', borderRadius: '16px', border: '1px solid rgba(56, 189, 248, 0.15)', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
                        <img src={logo} alt="SIGAC Icon" style={{ height: '56px', width: 'auto', display: 'block' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h1 style={{ margin: 0, fontSize: '2.2rem', fontWeight: '800', background: 'linear-gradient(135deg, #38bdf8 0%, #10b981 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.5px', lineHeight: '1.1' }}>
                            SIGAC
                        </h1>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '2px' }}>
                            Sistema Integral de Alimentación Corporativa
                        </p>
                    </div>
                </div>

                <div className="header-controls">
                    {/* Botón Ticket Visitas */}
                    <button
                        onClick={() => setShowManualModal(true)}
                        className="ticket-visit-btn"
                    >
                        <Eye size={16} /> Ticket Visitas
                    </button>

                    {/* Botón Ticket a Tercero */}
                    <button
                        onClick={() => setShowTerceroModal(true)}
                        className="ticket-visit-btn"
                        style={{ background: '#f59e0b' }}
                    >
                        <UserPlus size={16} /> Ticket a Tercero
                    </button>

                    {/* Filters */}
                    <div className="filters-container">
                        <div className="date-group">
                            <Calendar size={16} color="#94a3b8" className="calendar-icon" />
                            <input
                                type="date"
                                name="start"
                                value={dateRange.start}
                                onChange={handleDateChange}
                                className="date-input"
                            />
                            <span className="date-separator">a</span>
                            <input
                                type="date"
                                name="end"
                                value={dateRange.end}
                                onChange={handleDateChange}
                                className="date-input"
                            />
                        </div>

                        <div className="filter-separator"></div>

                        <a href="/seleccion" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }} className="menu-btn-link">
                            <button className="menu-btn">
                                <Utensils size={14} /> Menú Semanal
                            </button>
                        </a>

                        <select
                            value={typeFilter}
                            onChange={handleTypeChange}
                            className="filter-select"
                        >
                            <option value="" style={{ background: '#1e293b' }}>Todos los Tipos</option>
                            <option value="normal" style={{ background: '#1e293b' }}>Normal</option>
                            <option value="dieta" style={{ background: '#1e293b' }}>Dieta</option>
                            <option value="gerencia" style={{ background: '#1e293b' }}>Gerencia</option>
                            <option value="visita" style={{ background: '#1e293b' }}>Visita</option>
                            <option value="extra" style={{ background: '#1e293b' }}>Extra</option>
                        </select>

                        <button
                            onClick={handleFilter}
                            style={{
                                background: '#3b82f6',
                                border: 'none',
                                borderRadius: '4px',
                                color: 'white',
                                padding: '0.25rem 0.75rem',
                                cursor: 'pointer',
                                fontSize: '0.875rem'
                            }}
                            className="filter-btn"
                        >
                            Filtrar
                        </button>
                    </div>

                    <div className="db-status-badge">
                        <Database size={16} color={dbStatus === 'online' ? '#10b981' : '#ef4444'} />
                        <span style={{ fontSize: '0.875rem', color: dbStatus === 'online' ? '#10b981' : '#ef4444' }}>
                            {dbStatus === 'online' ? 'Base de Datos Conectada' : 'Sin Conexión a BD'}
                        </span>
                    </div>
                </div>
            </div>

            {/* === STAT CARDS - Ahora con tipos separados === */}
            <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <StatCard
                    title="Total Almuerzos"
                    value={summary?.totalLunches}
                    icon={Utensils}
                    color="#38bdf8"
                />
                <StatCard
                    title="Normal"
                    value={summary?.totalNormal}
                    icon={Ticket}
                    color="#7dd3fc"
                />
                <StatCard
                    title="Dieta"
                    value={summary?.totalDieta}
                    icon={Utensils}
                    color="#10b981"
                />
                <StatCard
                    title="Gerencia"
                    value={summary?.totalGerencia}
                    icon={ShieldCheck}
                    color="#a78bfa"
                />
                <StatCard
                    title="Visita"
                    value={summary?.totalVisita}
                    icon={Users}
                    color="#fb923c"
                />
                <StatCard
                    title="Extra"
                    value={summary?.totalExtra}
                    icon={Star}
                    color="#fbbf24"
                />
            </div>

            <div className="charts-grid">
                <div className="card">
                    <h3 className="stat-label">Tendencia ({dateRange.start ? 'Personalizada' : 'Ultimos 7 dias'})</h3>
                    <DailyTrendChart data={safeDailyData} />
                </div>
                <div className="card">
                    <h3 className="stat-label">Distribución ({dateRange.start ? 'Rango' : 'Ultimos 7 dias'})</h3>
                    <LunchTypeChart data={chartTypeData} />
                </div>
            </div>

            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 className="header-title" style={{ fontSize: '1.5rem' }}>Historial de Registros</h2>
                <button
                    onClick={handleDownload}
                    style={{
                        background: '#10b981',
                        border: 'none',
                        borderRadius: '6px',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.9rem',
                        fontWeight: '500'
                    }}
                >
                    Descargar Excel
                </button>
            </div>

            <div className="dashboard-grid" style={{ gridTemplateColumns: "1fr", marginTop: '1.5rem' }}>
                <div className="card history-table-container">
                    <table className="history-table">
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                <th style={{ padding: '1rem' }}>N° Ticket</th>
                                <th style={{ padding: '1rem' }}>Usuario</th>
                                <th style={{ padding: '1rem' }}>Hora</th>
                                <th style={{ padding: '1rem' }}>Fecha</th>
                                <th style={{ padding: '1rem' }}>Tipo</th>
                                <th style={{ padding: '1rem' }}>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {safeHistoryLog.map(item => {
                                const badge = getTypeBadge(item.type);
                                return (
                                    <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '1rem' }}>{item.numero_ticket || '-'}</td>
                                        <td style={{ padding: '1rem', color: '#f1f5f9' }}>{item.user}</td>
                                        <td style={{ padding: '1rem' }}>{formatTime(item.date, item.time)}</td>
                                        <td style={{ padding: '1rem' }}>{item.date}</td>
                                        <td style={{ padding: '1rem' }}>
                                            <span style={{
                                                background: badge.bg,
                                                color: badge.color,
                                                padding: '0.25rem 0.6rem',
                                                borderRadius: '999px',
                                                fontSize: '0.78rem',
                                                fontWeight: '500'
                                            }}>
                                                {badge.label}
                                            </span>
                                        </td>
                                        <td style={{
                                            padding: '1rem',
                                            color: item.status === 'Bloqueado' ? '#ef4444' : '#10b981',
                                            fontWeight: '500'
                                        }}>
                                            {item.status}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Live Terminal */}
            <LiveTerminal />

            <div className="page-header" style={{ marginTop: '2rem', textAlign: 'center', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <a href="/admin">
                        <button style={{
                            background: 'rgba(0, 0, 0, 0.58)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            color: '#ffffffff',
                            padding: '0.5rem 1.5rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            transition: 'all 0.2s'
                        }}
                            onMouseEnter={(e) => {
                                e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                                e.target.style.color = 'white';
                                e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.background = 'rgba(255, 255, 255, 1)';
                                e.target.style.color = '#000000ff';
                                e.target.style.borderColor = 'rgba(0, 225, 255, 0.1)';
                            }}
                        >
                            ADMIN
                        </button>
                    </a>
                </div>
                <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                    John Alexander Garcia | Todos los derechos reservados |DETCUADOR S.A.| Version 3.2.1
                </p>
            </div>

            {/* Modals */}
            {showManualModal && <ManualTicketModal onClose={() => setShowManualModal(false)} />}
            {showTerceroModal && <ThirdPartyTicketModal onClose={() => setShowTerceroModal(false)} />}
        </div>
    );
};

export default Dashboard;
