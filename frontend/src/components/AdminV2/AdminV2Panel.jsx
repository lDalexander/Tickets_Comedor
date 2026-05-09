import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, Ticket, Users, Shield, Settings, FileText,
    LogOut, Menu, X, ChevronRight
} from 'lucide-react';

import { useAdminAuth } from '../../hooks/useAdminAuth';
import AdminLogin from './AdminLogin';
import ResumenSection from './sections/ResumenSection';
import RegistrosSection from './sections/RegistrosSection';
import EmpleadosSection from './sections/EmpleadosSection';
import OperadoresSection from './sections/OperadoresSection';
import ConfiguracionSection from './sections/ConfiguracionSection';
import AuditoriaSection from './sections/AuditoriaSection';

const SECTIONS = [
    { id: 'resumen', label: 'Resumen', icon: LayoutDashboard, color: '#38bdf8' },
    { id: 'registros', label: 'Registros', icon: Ticket, color: '#7dd3fc' },
    { id: 'empleados', label: 'Empleados', icon: Users, color: '#10b981' },
    { id: 'operadores', label: 'Operadores', icon: Shield, color: '#a78bfa' },
    { id: 'configuracion', label: 'Configuración', icon: Settings, color: '#f59e0b' },
    { id: 'auditoria', label: 'Auditoría', icon: FileText, color: '#818cf8' },
];

const SECTION_LABELS = {
    resumen: 'Resumen del Sistema',
    registros: 'Historial de Registros',
    empleados: 'Gestión de Empleados',
    operadores: 'Operadores del Sistema',
    configuracion: 'Configuración',
    auditoria: 'Auditoría de Tickets Manuales',
};

export default function AdminV2Panel() {
    const { isAuthenticated, user, login, logout, authHeaders } = useAdminAuth();
    const [active, setActive] = useState('resumen');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const navigate = useNavigate();

    if (!isAuthenticated) {
        return <AdminLogin onLogin={login} />;
    }

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const sectionProps = { authHeaders, user };

    const NavItem = ({ section }) => {
        const Icon = section.icon;
        const isActive = active === section.id;
        return (
            <button
                onClick={() => { setActive(section.id); setSidebarOpen(false); }}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.7rem 1rem',
                    background: isActive ? `${section.color}12` : 'transparent',
                    border: 'none',
                    borderLeft: isActive ? `3px solid ${section.color}` : '3px solid transparent',
                    borderRadius: '0 0.5rem 0.5rem 0',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                    marginBottom: '2px',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
                <Icon size={17} color={isActive ? section.color : '#64748b'} />
                <span style={{
                    fontSize: '0.875rem',
                    fontWeight: isActive ? '700' : '500',
                    color: isActive ? section.color : '#94a3b8',
                    letterSpacing: '-0.1px',
                }}>
                    {section.label}
                </span>
                {isActive && <ChevronRight size={14} color={section.color} style={{ marginLeft: 'auto' }} />}
            </button>
        );
    };

    const Sidebar = ({ mobile = false }) => (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            padding: '1.25rem 0',
        }}>
            {/* Logo y título */}
            <div style={{ padding: '0 1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.65rem', fontWeight: '700', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                            Panel Admin
                        </p>
                        <h2 style={{ margin: '0.15rem 0 0', fontSize: '1.15rem', fontWeight: '800', color: '#f1f5f9', letterSpacing: '-0.3px' }}>
                            SIGAC
                        </h2>
                    </div>
                    {mobile && (
                        <button onClick={() => setSidebarOpen(false)}
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}>
                            <X size={18} />
                        </button>
                    )}
                </div>
                <div style={{
                    marginTop: '1rem',
                    padding: '0.6rem 0.75rem',
                    background: 'rgba(56,189,248,0.06)',
                    border: '1px solid rgba(56,189,248,0.12)',
                    borderRadius: '0.6rem',
                }}>
                    <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: '700', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user?.nombre}
                    </p>
                    <p style={{ margin: '0.1rem 0 0', fontSize: '0.7rem', color: '#38bdf8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {user?.rol || 'admin'}
                    </p>
                </div>
            </div>

            {/* Navegación */}
            <nav style={{ flex: 1, padding: '0.75rem 0', overflowY: 'auto' }}>
                {SECTIONS.map(s => <NavItem key={s.id} section={s} />)}
            </nav>

            {/* Footer */}
            <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                    onClick={() => navigate('/')}
                    style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem',
                        padding: '0.55rem 0.75rem', marginBottom: '0.4rem',
                        background: 'none', border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '0.5rem', color: '#64748b', fontSize: '0.8rem',
                        cursor: 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#94a3b8'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#64748b'; }}
                >
                    ← Volver al Dashboard
                </button>
                <button
                    onClick={handleLogout}
                    style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem',
                        padding: '0.55rem 0.75rem',
                        background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)',
                        borderRadius: '0.5rem', color: '#f87171', fontSize: '0.8rem', fontWeight: '600',
                        cursor: 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; }}
                >
                    <LogOut size={14} /> Cerrar Sesión
                </button>
            </div>
        </div>
    );

    return (
        <div style={{
            display: 'flex',
            minHeight: '100vh',
            background: '#0b1222',
            fontFamily: "'Inter', sans-serif",
            position: 'relative',
        }}>
            {/* Sidebar desktop */}
            <aside style={{
                width: '240px',
                flexShrink: 0,
                background: 'rgba(11,18,34,0.98)',
                borderRight: '1px solid rgba(255,255,255,0.06)',
                position: 'sticky',
                top: 0,
                height: '100vh',
                overflowY: 'auto',
                display: 'none',
            }} id="sidebar-desktop">
                <Sidebar />
            </aside>

            {/* Overlay sidebar mobile */}
            {sidebarOpen && (
                <div
                    onClick={() => setSidebarOpen(false)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
                        zIndex: 40, backdropFilter: 'blur(4px)',
                    }}
                />
            )}
            <div style={{
                position: 'fixed', top: 0, left: 0, bottom: 0, width: '260px',
                background: 'rgba(11,18,34,0.99)',
                borderRight: '1px solid rgba(255,255,255,0.08)',
                zIndex: 50,
                transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
                transition: 'transform 0.25s ease',
                overflowY: 'auto',
            }}>
                <Sidebar mobile />
            </div>

            {/* Contenido principal */}
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                {/* Header */}
                <header style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '0.85rem 1.5rem',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(11,18,34,0.8)',
                    backdropFilter: 'blur(12px)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                }}>
                    <button
                        onClick={() => setSidebarOpen(true)}
                        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', display: 'flex' }}
                        id="menu-toggle"
                    >
                        <Menu size={20} />
                    </button>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#f1f5f9', lineHeight: 1 }}>
                            {SECTION_LABELS[active]}
                        </h1>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#475569', marginTop: '2px' }}>
                            DETCUADOR S.A. — SIGAC Admin
                        </p>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'none' }} id="user-label">
                            {user?.nombre}
                        </span>
                        <button onClick={handleLogout}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.75rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '0.5rem', color: '#f87171', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' }}>
                            <LogOut size={13} /> Salir
                        </button>
                    </div>
                </header>

                {/* Sección activa */}
                <div style={{ flex: 1, padding: '1.5rem', maxWidth: '1200px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
                    {active === 'resumen' && <ResumenSection {...sectionProps} />}
                    {active === 'registros' && <RegistrosSection {...sectionProps} />}
                    {active === 'empleados' && <EmpleadosSection {...sectionProps} />}
                    {active === 'operadores' && <OperadoresSection {...sectionProps} />}
                    {active === 'configuracion' && <ConfiguracionSection {...sectionProps} />}
                    {active === 'auditoria' && <AuditoriaSection {...sectionProps} />}
                </div>
            </main>

            {/* Responsive styles */}
            <style>{`
                @media (min-width: 768px) {
                    #sidebar-desktop { display: block !important; }
                    #menu-toggle { display: none !important; }
                    #user-label { display: block !important; }
                }
                * { box-sizing: border-box; }
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
                ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }
            `}</style>
        </div>
    );
}
