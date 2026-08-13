import React, { useState } from 'react';
import axios from 'axios';
import { X, Printer, User, Lock, Search, UserCheck, AlertCircle } from 'lucide-react';

const ThirdPartyTicketModal = ({ onClose }) => {
    const [step, setStep] = useState('login'); // 'login', 'search', 'confirm'
    const [user, setUser] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    // Login
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    // Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [searching, setSearching] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await axios.post('/api/manual-tickets/login', { username, password });
            if (res.data.success) {
                const permisos = String(res.data.user?.permisos || '').split(',').map(p => p.trim().toLowerCase());
                if (!permisos.includes('tercero')) {
                    setError('Este usuario no tiene permiso para imprimir tickets a terceros');
                    return;
                }
                setUser(res.data.user);
                setStep('search');
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Error de autenticación');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async (query) => {
        setSearchQuery(query);
        setSelectedEmployee(null);
        setError('');
        setSuccessMsg('');

        if (query.length < 2) {
            setSearchResults([]);
            return;
        }

        setSearching(true);
        try {
            const res = await axios.get(`/api/search/users?q=${encodeURIComponent(query)}`);
            setSearchResults(res.data || []);
        } catch (err) {
            setSearchResults([]);
        } finally {
            setSearching(false);
        }
    };

    const handleSelectEmployee = (emp) => {
        setSelectedEmployee(emp);
        setSearchQuery(emp.nombre_completo);
        setSearchResults([]);
        setStep('confirm');
    };

    const handlePrintTercero = async () => {
        if (!selectedEmployee || !user) return;
        setError('');
        setLoading(true);
        try {
            const res = await axios.post('/api/manual-tickets/print-tercero', {
                employeeId: selectedEmployee.zk_id,
                printedByUserId: user.id
            });
            if (res.data.success) {
                setSuccessMsg(res.data.message);
                // Auto-reset after 3 seconds
                setTimeout(() => {
                    setSelectedEmployee(null);
                    setSearchQuery('');
                    setSuccessMsg('');
                    setStep('search');
                }, 3000);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Error imprimiendo ticket');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '460px' }}>
                <div className="modal-header">
                    <h2 className="modal-title">
                        {step === 'login' && <><Lock size={20} color="#f59e0b" /> Ticket a Tercero</>}
                        {step === 'search' && <><Search size={20} color="#38bdf8" /> Buscar Empleado</>}
                        {step === 'confirm' && <><UserCheck size={20} color="#10b981" /> Confirmar Impresión</>}
                    </h2>
                    <button onClick={onClose} className="modal-close-btn">
                        <X size={24} />
                    </button>
                </div>

                {error && <div className="modal-error"><AlertCircle size={16} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />{error}</div>}
                {successMsg && (
                    <div style={{
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#6ee7b7',
                        padding: '0.75rem',
                        borderRadius: '6px',
                        marginBottom: '1rem',
                        fontSize: '0.875rem',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                        textAlign: 'center'
                    }}>
                        ✅ {successMsg}
                    </div>
                )}

                {/* === STEP 1: LOGIN === */}
                {step === 'login' && (
                    <form onSubmit={handleLogin}>
                        <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1rem' }}>
                            Ingrese sus credenciales para imprimir un ticket en nombre de otro empleado.
                        </p>
                        <div className="form-group">
                            <label className="form-label">Usuario</label>
                            <div className="input-wrapper">
                                <User size={18} color="#94a3b8" className="input-icon" />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    placeholder="Usuario autorizado"
                                    className="modal-input"
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Contraseña</label>
                            <div className="input-wrapper">
                                <Lock size={18} color="#94a3b8" className="input-icon" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="modal-input"
                                />
                            </div>
                        </div>
                        <button type="submit" disabled={loading} className="modal-submit-btn" style={{ background: '#f59e0b' }}>
                            {loading ? 'Verificando...' : 'Ingresar'}
                        </button>
                    </form>
                )}

                {/* === STEP 2: SEARCH === */}
                {step === 'search' && (
                    <div>
                        <div className="session-info">
                            <p className="session-text">
                                <strong>Sesión:</strong> {user?.nombre_real}
                            </p>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Buscar por ID o Nombre del Empleado</label>
                            <div className="input-wrapper">
                                <Search size={18} color="#94a3b8" className="input-icon" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => handleSearch(e.target.value)}
                                    placeholder="Ej: 42 o GARCIA VALENCIA..."
                                    className="modal-input"
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* Search Results */}
                        {searching && <p style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center' }}>Buscando...</p>}
                        {searchResults.length > 0 && (
                            <div style={{
                                maxHeight: '200px',
                                overflowY: 'auto',
                                borderRadius: '8px',
                                border: '1px solid var(--glass-border)'
                            }}>
                                {searchResults.map(emp => (
                                    <div
                                        key={emp.zk_id}
                                        onClick={() => handleSelectEmployee(emp)}
                                        style={{
                                            padding: '0.75rem 1rem',
                                            cursor: 'pointer',
                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                            transition: 'background 0.15s',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <span style={{ color: '#f1f5f9', fontSize: '0.9rem' }}>{emp.nombre_completo}</span>
                                        <span style={{
                                            color: '#94a3b8',
                                            fontSize: '0.75rem',
                                            background: 'rgba(255,255,255,0.05)',
                                            padding: '0.2rem 0.5rem',
                                            borderRadius: '4px'
                                        }}>
                                            ID: {emp.zk_id}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                            <p style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', marginTop: '1rem' }}>
                                No se encontraron resultados
                            </p>
                        )}
                    </div>
                )}

                {/* === STEP 3: CONFIRM === */}
                {step === 'confirm' && selectedEmployee && !successMsg && (
                    <div>
                        <div className="session-info">
                            <p className="session-text">
                                <strong>Operador:</strong> {user?.nombre_real}
                            </p>
                        </div>

                        <div style={{
                            background: 'rgba(56, 189, 248, 0.08)',
                            border: '1px solid rgba(56, 189, 248, 0.25)',
                            borderRadius: '8px',
                            padding: '1.25rem',
                            marginBottom: '1.5rem',
                            textAlign: 'center'
                        }}>
                            <UserCheck size={32} color="#38bdf8" style={{ marginBottom: '0.5rem' }} />
                            <p style={{ color: '#f1f5f9', fontSize: '1.1rem', fontWeight: '600', margin: '0.5rem 0' }}>
                                {selectedEmployee.nombre_completo}
                            </p>
                            <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
                                ID Biométrico: {selectedEmployee.zk_id}
                            </p>
                        </div>

                        <p style={{ color: '#fbbf24', fontSize: '0.8rem', textAlign: 'center', marginBottom: '1rem' }}>
                            ⚠️ Se imprimirá un ticket a nombre de este empleado y quedará registrado que usted lo autorizó.
                        </p>

                        <div className="modal-actions">
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedEmployee(null);
                                    setSearchQuery('');
                                    setStep('search');
                                    setError('');
                                }}
                                className="modal-back-btn"
                            >
                                Atrás
                            </button>
                            <button
                                type="button"
                                onClick={handlePrintTercero}
                                disabled={loading}
                                className="modal-print-btn"
                                style={{ background: '#f59e0b' }}
                            >
                                {loading ? 'Imprimiendo...' : <><Printer size={18} /> Imprimir Ticket</>}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ThirdPartyTicketModal;
