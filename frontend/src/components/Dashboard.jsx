// components/Dashboard.jsx
import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import StatCard from './StatCard';
import { DailyTrendChart, LunchTypeChart } from './Charts';
import LiveTerminal from './LiveTerminal';
import { Utensils, Ticket, AlertTriangle, Users, Database, Calendar } from 'lucide-react';

const Dashboard = () => {
    const [summary, setSummary] = useState(null);
    const [dailyData, setDailyData] = useState([]);
    const [historyLog, setHistoryLog] = useState([]);
    const [dbStatus, setDbStatus] = useState('checking'); // 'online', 'offline', 'checking'
    const [loading, setLoading] = useState(true);

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

    const fetchData = useCallback(async () => {
        try {
            // In production, use env variable used in Vite: import.meta.env.VITE_API_URL
            // Use relative path for proxy
            const baseUrl = '/api';

            // Build query params
            const params = {};
            if (dateRange.start) params.startDate = dateRange.start;
            if (dateRange.end) params.endDate = dateRange.end;
            if (typeFilter) params.type = typeFilter;

            setLoading(true); // show loading state on manual filter
            const [summaryRes, dailyRes, historyRes, healthRes] = await Promise.all([
                axios.get(`${baseUrl}/stats/summary`, { params }),
                axios.get(`${baseUrl}/stats/daily`, { params }),
                axios.get(`${baseUrl}/stats/history`, { params }),
                axios.get(`${baseUrl}/health`).catch(() => ({ data: { status: 'offline' } }))
            ]);

            setSummary(summaryRes.data);
            setDailyData(dailyRes.data);
            setHistoryLog(historyRes.data);
            setDbStatus(healthRes.data.status);
            setLoading(false);
        } catch (error) {
            console.error("Error loading dashboard data", error);
            setLoading(false);
        }
    }, [dateRange, typeFilter]);

    // Initial load
    useEffect(() => {
        fetchData();
        // Set up polling every 30 seconds
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]); // Empty dependency array - only runs on mount

    // Manual refresh handler
    const handleFilter = () => {
        fetchData();
    };

    // Download Handler
    const handleDownload = () => {
        if (!dateRange.start || !dateRange.end) {
            alert("Por favor, selecciona un rango de fechas para descargar el reporte.\n(Esto evita descargas masivas que bloqueen el sistema).");
            return;
        }

        // Use relative path (proxy handles forwarding)
        const baseUrl = '/api';

        // Construct query manually to open in new window
        let query = `?startDate=${dateRange.start}&endDate=${dateRange.end}&type=${typeFilter}`;
        window.open(`${baseUrl}/stats/export-excel${query}`, '_blank');
    };

    // Helper to format time to local timezone
    const formatTime = (dateStr, timeStr) => {
        if (!dateStr || !timeStr) return timeStr;
        try {
            // Assume database stores UTC
            const utcDate = new Date(`${dateStr}T${timeStr}Z`);
            return utcDate.toLocaleTimeString();
        } catch (e) {
            return timeStr;
        }
    };

    if (loading && !summary) return <div className="page-header" style={{ textAlign: 'center' }}>Cargando datos...</div>;

    // Aggregate daily data for today for doughnut chart if not provided by summary
    const todayTypeData = dailyData.length > 0 ? {
        type_normal: dailyData.reduce((acc, curr) => acc + (parseInt(curr.type_normal) || 0), 0),
        type_special: dailyData.reduce((acc, curr) => acc + (parseInt(curr.type_special) || 0), 0)
    } : { type_normal: 0, type_special: 0 };

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="header-title">Dashboard de Comedor</h1>
                    <p className="header-subtitle">Visualización en tiempo real de tickets y almuerzos</p>
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>

                    {/* Filters */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                        <Calendar size={16} color="#94a3b8" />
                        <input
                            type="date"
                            name="start"
                            value={dateRange.start}
                            onChange={handleDateChange}
                            style={{ background: 'transparent', border: 'none', color: '#f1f5f9', fontSize: '0.875rem', colorScheme: 'dark' }}
                        />
                        <span style={{ color: '#94a3b8' }}>a</span>
                        <input
                            type="date"
                            name="end"
                            value={dateRange.end}
                            onChange={handleDateChange}
                            style={{ background: 'transparent', border: 'none', color: '#f1f5f9', fontSize: '0.875rem', colorScheme: 'dark' }}
                        />


                        <div style={{ width: '1px', height: '20px', background: 'var(--glass-border)', margin: '0 0.5rem' }}></div>

                        <a href="/seleccion" target="_blank" style={{ textDecoration: 'none' }}>
                            <button style={{
                                background: '#8b5cf6',
                                border: 'none',
                                borderRadius: '4px',
                                color: 'white',
                                padding: '0.25rem 0.75rem',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}>
                                <Utensils size={14} /> Menú Semanal
                            </button>
                        </a>

                        <select
                            value={typeFilter}
                            onChange={handleTypeChange}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#f1f5f9',
                                fontSize: '0.875rem',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="" style={{ background: '#1e293b' }}>Todos los Tipos</option>
                            <option value="extra" style={{ background: '#1e293b' }}>Tickets Extra</option>
                        </select>

                        <button
                            onClick={handleFilter}
                            style={{
                                marginLeft: '0.5rem',
                                background: '#3b82f6',
                                border: 'none',
                                borderRadius: '4px',
                                color: 'white',
                                padding: '0.25rem 0.75rem',
                                cursor: 'pointer',
                                fontSize: '0.875rem'
                            }}
                        >
                            Filtrar
                        </button>
                    </div>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        borderRadius: '999px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--glass-border)'
                    }}>
                        <Database size={16} color={dbStatus === 'online' ? '#10b981' : '#ef4444'} />
                        <span style={{ fontSize: '0.875rem', color: dbStatus === 'online' ? '#10b981' : '#ef4444' }}>
                            {dbStatus === 'online' ? 'Base de Datos Conectada' : 'Sin Conexión a BD'}
                        </span>
                    </div>
                </div>
            </div>

            <div className="dashboard-grid">
                <StatCard
                    title="Total Almuerzos"
                    value={summary?.totalLunches}
                    icon={Utensils}
                    color="#38bdf8"
                />
                <StatCard
                    title="Dieta"
                    value={summary?.totalSpecial}
                    icon={Ticket}
                    color="#f472b6"
                />
                <StatCard
                    title="Normal"
                    value={summary?.totalNormal}
                    icon={Utensils}
                    color="#6366f1"
                />
                <StatCard
                    title="Tendencia Principal"
                    value={(() => {
                        const type = summary?.mostPopularType?.toLowerCase() || '';
                        if (type.includes('almuerzo')) return 'ALMUERZO NORMAL';
                        if (type.includes('extra') || type.includes('especial') || type.includes('dieta')) return 'ALMUERZO DIETA';
                        return type.toUpperCase() || 'N/A';
                    })()}
                    icon={Users}
                    color="#10b981"
                />
            </div>

            <div className="dashboard-grid" style={{ gridTemplateColumns: "2fr 1fr" }}>
                <div className="card">
                    <h3 className="stat-label">Tendencia ({dateRange.start ? 'Personalizada' : 'Ultimos 7 dias'})</h3>
                    <DailyTrendChart data={dailyData} />
                </div>
                <div className="card">
                    <h3 className="stat-label">Distribución ({dateRange.start ? 'Rango' : 'Ultimos 7 dias'})</h3>
                    <LunchTypeChart data={todayTypeData} />
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
                <div className="card" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: '#94a3b8' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                <th style={{ padding: '1rem' }}>Usuario</th>
                                <th style={{ padding: '1rem' }}>Hora</th>
                                <th style={{ padding: '1rem' }}>Fecha</th>
                                <th style={{ padding: '1rem' }}>Tipo</th>
                                <th style={{ padding: '1rem' }}>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historyLog.map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '1rem', color: '#f1f5f9' }}>{item.user}</td>
                                    <td style={{ padding: '1rem' }}>{formatTime(item.date, item.time)}</td>
                                    <td style={{ padding: '1rem' }}>{item.date}</td>
                                    <td style={{ padding: '1rem' }}>{item.type}</td>
                                    <td style={{
                                        padding: '1rem',
                                        color: item.status === 'Bloqueado' ? '#ef4444' : '#10b981',
                                        fontWeight: '500'
                                    }}>
                                        {item.status}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Live Terminal */}
            <LiveTerminal />

            <div className="page-header" style={{ marginTop: '2rem', textAlign: 'center', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                    John Alexander Garcia | Todos los derechos reservados | Version 2.7
                </p>
            </div>
        </div>
    );
};

export default Dashboard;
