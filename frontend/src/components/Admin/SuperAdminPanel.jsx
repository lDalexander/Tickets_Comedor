import React, { useState } from 'react';
import axios from 'axios';
import { Terminal, Play, AlertTriangle } from 'lucide-react';

const SuperAdminPanel = () => {
    const [auth, setAuth] = useState(false);
    const [pin, setPin] = useState('');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);

    const handleLogin = (e) => {
        e.preventDefault();
        if (pin === 'supersecret') setAuth(true);
        else alert('Acceso Denegado');
    };

    const runQuery = async () => {
        try {
            setError(null);
            setResults(null);
            const res = await axios.post('/api/admin/query', { sql: query }, {
                headers: { 'x-admin-secret': 'supersecret' }
            });
            setResults(res.data.results);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        }
    };

    if (!auth) {
        return (
            <div style={{ padding: '4rem', textAlign: 'center' }}>
                <h1 style={{ color: '#ef4444' }}>SUPER ADMIN ACCESS</h1>
                <form onSubmit={handleLogin} style={{ marginTop: '2rem' }}>
                    <input
                        type="password"
                        value={pin}
                        onChange={e => setPin(e.target.value)}
                        placeholder="SUPER SECRET PIN"
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #475569', background: '#1e293b', color: 'white' }}
                    />
                    <button type="submit" style={{ marginLeft: '1rem', padding: '0.5rem 1rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px' }}>Entrar</button>
                </form>
            </div>
        );
    }

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h1 style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: '#ef4444', margin: 0 }}>
                    <Terminal size={32} /> SUPER ADMIN CONSOLE
                </h1>
                <button onClick={() => setAuth(false)} style={{ background: 'transparent', border: '1px solid #475569', color: '#94a3b8', padding: '0.5rem 1rem' }}>Logout</button>
            </div>

            <div style={{ marginBottom: '2rem' }}>
                <p style={{ color: '#94a3b8', marginBottom: '1rem' }}>Enter raw SQL command:</p>
                <textarea
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    style={{
                        width: '100%',
                        height: '150px',
                        padding: '1rem',
                        background: '#0f172a',
                        color: '#38bdf8',
                        fontFamily: 'monospace',
                        borderRadius: '8px',
                        border: '1px solid #334155'
                    }}
                    placeholder="SELECT * FROM usuarios WHERE..."
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button
                        onClick={runQuery}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            background: '#ef4444', color: 'white', border: 'none',
                            padding: '0.75rem 2rem', borderRadius: '6px', fontSize: '1rem', cursor: 'pointer'
                        }}
                    >
                        <Play size={18} /> Execute SQL
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '6px', marginBottom: '2rem' }}>
                    <AlertTriangle size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                    {error}
                </div>
            )}

            {results && (
                <div className="responsive-table" style={{ background: '#1e293b', padding: '1rem' }}>
                    {Array.isArray(results) ? (
                        results.length > 0 ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#cbd5e1', minWidth: '600px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #334155', textAlign: 'left' }}>
                                        {Object.keys(results[0]).map(key => (
                                            <th key={key} style={{ padding: '0.75rem' }}>{key}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((row, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #334155' }}>
                                            {Object.values(row).map((val, j) => (
                                                <td key={j} style={{ padding: '0.75rem' }}>{typeof val === 'object' ? JSON.stringify(val) : String(val)}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : <p>Query executed successfully. No rows returned.</p>
                    ) : (
                        <pre>{JSON.stringify(results, null, 2)}</pre>
                    )}
                </div>
            )}
        </div>
    );
};

export default SuperAdminPanel;
