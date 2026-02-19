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

    // Helper to translate MySQL OKPackets to Spanish
    const translatePacket = (packet, index) => {
        if (!packet || typeof packet !== 'object') return null;

        // It's a command result if it has these specific fields
        if ('affectedRows' in packet && 'serverStatus' in packet) {
            let msg = `Comando ${index + 1}: Ejecutado correctamente.`;
            const details = [];

            if (packet.affectedRows > 0) {
                details.push(`${packet.affectedRows} filas afectadas`);
            }

            // Check for "schema" in info string or just generic success
            // MySQL2 often returns info as string, but sometimes we see it in other props
            // The screenshot showed: "info": "", "serverStatus": ... 
            // But the user specifically asked about the "schema": "gestion_insumos" part seen in JSON
            // If the row acts as an object with 'schema' key (as seen in screenshot warningStatus 0 changedRows { schema: ... })
            // Wait, the screenshot showed `changedRows` as an empty string or 0, but the last column was an object?
            // Ah, the screenshot showed columns: fieldCount, affectedRows, insertId, info, serverStatus, warningStatus, changedRows
            // and correct, `changedRows` was 0.
            // But there was a second row where the LAST column had content? 
            // No, the screenshot shows 2 rows. 
            // Row 1: fieldCount:0, affectedRows:1 ... changedRows: 0
            // Row 2: fieldCount:0, affectedRows:0 ... changedRows: { "systemVariables":... "schema":"gestion_insumos" ... }

            // So sometimes 'changedRows' or 'info' might carry the schema change info.

            if (packet.changedRows && typeof packet.changedRows === 'object' && packet.changedRows.schema) {
                msg = `Base de datos cambiada a: ${packet.changedRows.schema}`;
            } else if (packet.info && typeof packet.info === 'string' && packet.info.includes('schema')) {
                msg = `Información: ${packet.info}`;
            } else if (packet.affectedRows === 0 && packet.warningStatus === 0) {
                msg = `Comando ${index + 1}: Operación exitosa (sin cambios en datos).`;
            }

            return (
                <div key={index} style={{ padding: '0.5rem', borderBottom: '1px solid #334155', color: '#10b981' }}>
                    ✅ {msg} {details.length > 0 && `(${details.join(', ')})`}
                </div>
            );
        }
        return null;
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header ... */}
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
                    <button onClick={runQuery} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ef4444', color: 'white', border: 'none', padding: '0.75rem 2rem', borderRadius: '6px', fontSize: '1rem', cursor: 'pointer' }}>
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
                <div className="responsive-table" style={{ background: '#1e293b', padding: '1rem', borderRadius: '8px' }}>
                    {/* Heuristic: If it's an array and the first item looks like an OKResult (has affectedRows), treat as status list */}
                    {(Array.isArray(results) && results.length > 0 && 'affectedRows' in results[0]) ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ color: '#94a3b8', marginBottom: '1rem' }}>Resultado de Ejecución:</h3>
                            {results.map((pkt, i) => translatePacket(pkt, i) || (
                                // Fallback for mixed results (e.g. SELECT inside a procedure?)
                                <pre key={i}>{JSON.stringify(pkt)}</pre>
                            ))}
                        </div>
                    ) : (
                        // Standard Table for SELECT results
                        Array.isArray(results) && results.length > 0 ? (
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
                                                <td key={j} style={{ padding: '0.75rem' }}>
                                                    {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            // Empty array or different structure
                            <p style={{ color: '#94a3b8' }}>Consultada ejecutada. Sin resultados para mostrar.</p>
                        )
                    )}
                </div>
            )}
        </div>
    );
};

export default SuperAdminPanel;
