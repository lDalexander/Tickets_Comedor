import React, { useState } from 'react';
import { Lock, User, LogIn, AlertCircle } from 'lucide-react';
import logo from '../../assets/logo_sigac.png';

export default function AdminLogin({ onLogin }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!username.trim() || !password.trim()) {
            setError('Ingresa usuario y contraseña');
            return;
        }
        setError('');
        setLoading(true);
        try {
            await onLogin(username, password);
        } catch (err) {
            setError(err.response?.data?.error || 'Error de autenticación');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100dvh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0f172a',
            backgroundImage: `
                radial-gradient(circle at 20% 30%, rgba(56,189,248,0.08) 0%, transparent 50%),
                radial-gradient(circle at 80% 70%, rgba(129,140,248,0.08) 0%, transparent 50%)
            `,
            padding: '1rem',
            fontFamily: "'Inter', sans-serif",
        }}>
            <div style={{
                width: '100%',
                maxWidth: '400px',
                background: '#1e293b',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '1.5rem',
                padding: '2.5rem 2rem',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
            }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(56,189,248,0.08)',
                        border: '1px solid rgba(56,189,248,0.2)',
                        borderRadius: '1rem',
                        padding: '10px',
                        marginBottom: '1rem',
                    }}>
                        <img src={logo} alt="SIGAC" style={{ height: '44px', width: 'auto' }} />
                    </div>
                    <h1 style={{
                        margin: 0,
                        fontSize: '1.5rem',
                        fontWeight: '800',
                        background: 'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}>
                        Panel Administrativo
                    </h1>
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                        DETCUADOR S.A. — Control de Comedor
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#94a3b8', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Usuario
                        </label>
                        <div style={{ position: 'relative' }}>
                            <User size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
                            <input
                                type="text"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                placeholder="nombre.usuario"
                                autoComplete="username"
                                style={{
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    padding: '0.7rem 0.75rem 0.7rem 2.25rem',
                                    background: 'rgba(15,23,42,0.6)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '0.6rem',
                                    color: '#f1f5f9',
                                    fontSize: '0.9rem',
                                    outline: 'none',
                                    transition: 'border-color 0.2s',
                                }}
                                onFocus={e => e.target.style.borderColor = '#38bdf8'}
                                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#94a3b8', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Contraseña
                        </label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                style={{
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    padding: '0.7rem 0.75rem 0.7rem 2.25rem',
                                    background: 'rgba(15,23,42,0.6)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '0.6rem',
                                    color: '#f1f5f9',
                                    fontSize: '0.9rem',
                                    outline: 'none',
                                    transition: 'border-color 0.2s',
                                }}
                                onFocus={e => e.target.style.borderColor = '#38bdf8'}
                                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                            />
                        </div>
                    </div>

                    {error && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.65rem 0.9rem',
                            background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: '0.6rem',
                            color: '#fca5a5',
                            fontSize: '0.85rem',
                        }}>
                            <AlertCircle size={15} style={{ flexShrink: 0 }} />
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            marginTop: '0.5rem',
                            padding: '0.8rem',
                            background: loading
                                ? 'rgba(56,189,248,0.3)'
                                : 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                            border: 'none',
                            borderRadius: '0.6rem',
                            color: 'white',
                            fontSize: '0.95rem',
                            fontWeight: '700',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            transition: 'opacity 0.2s',
                        }}
                    >
                        {loading ? (
                            <>
                                <span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                                Verificando...
                            </>
                        ) : (
                            <>
                                <LogIn size={16} />
                                Ingresar al Panel
                            </>
                        )}
                    </button>
                </form>
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
