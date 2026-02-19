import React, { useState } from 'react';
import axios from 'axios';
import { X, Printer, User, Lock, FileText } from 'lucide-react';

const ManualTicketModal = ({ onClose }) => {
    const [step, setStep] = useState('login'); // 'login' or 'print'
    const [user, setUser] = useState(null); // Authenticated user info
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Login Form State
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    // Print Form State
    const [visitorName, setVisitorName] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await axios.post('/api/manual-tickets/login', { username, password });
            if (res.data.success) {
                setUser(res.data.user);
                setStep('print');
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Error de autenticación');
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = async (e) => {
        e.preventDefault();
        if (!visitorName.trim()) {
            setError('El nombre del visitante es obligatorio');
            return;
        }
        setError('');
        setLoading(true);
        try {
            const res = await axios.post('/api/manual-tickets/print', {
                visitorName,
                printedByUserId: user.id
            });

            if (res.data.success) {
                alert(`✅ Ticket para "${visitorName}" enviado a impresión.`);
                onClose(); // Close modal on success
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Error imprimiendo ticket');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h2 className="modal-title">
                        {step === 'login' ? <Lock size={20} color="#38bdf8" /> : <Printer size={20} color="#10b981" />}
                        {step === 'login' ? 'Acceso Autorizado' : 'Ticket de Visita'}
                    </h2>
                    <button onClick={onClose} className="modal-close-btn">
                        <X size={24} />
                    </button>
                </div>

                {error && <div className="modal-error">
                    {error}
                </div>}

                {step === 'login' ? (
                    <form onSubmit={handleLogin}>
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
                        <button type="submit" disabled={loading} className="modal-submit-btn">
                            {loading ? 'Verificando...' : 'Ingresar'}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handlePrint}>
                        <div className="session-info">
                            <p className="session-text">
                                <strong>Sesión de:</strong> {user?.nombre_real}
                            </p>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Nombre del Visitante / Proveedor</label>
                            <div className="input-wrapper">
                                <FileText size={18} color="#94a3b8" className="input-icon" />
                                <input
                                    type="text"
                                    value={visitorName}
                                    onChange={e => setVisitorName(e.target.value)}
                                    placeholder="Ej: Juan Pérez (Proveedor X)"
                                    autoFocus
                                    className="modal-input"
                                />
                            </div>
                        </div>

                        <div className="modal-actions">
                            <button type="button" onClick={() => setStep('login')} className="modal-back-btn">
                                Atrás
                            </button>
                            <button type="submit" disabled={loading} className="modal-print-btn">
                                {loading ? 'Imprimiendo...' : <><Printer size={18} /> Imprimir Ticket</>}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ManualTicketModal;
