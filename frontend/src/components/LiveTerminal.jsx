import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import { Terminal, Activity, Wifi, WifiOff } from 'lucide-react';

const LiveTerminal = () => {
    const [logs, setLogs] = useState([]);
    const [connected, setConnected] = useState(false);
    const logsEndRef = useRef(null);
    const socketRef = useRef(null);

    useEffect(() => {
        // Initialize socket connection
        // Connect to current origin (proxy forwards /socket.io)
        socketRef.current = io();

        socketRef.current.on('connect', () => {
            setConnected(true);
            addLog('System', 'Conectado al servidor de monitoreo en tiempo real.');
        });

        socketRef.current.on('disconnect', () => {
            setConnected(false);
            addLog('System', 'Desconectado del servidor.', 'error');
        });

        socketRef.current.on('new_log', (data) => {
            addLog(data.type, data.message, data.status);
        });

        return () => {
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, []);

    const addLog = (type, message, status = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [...prev.slice(-49), { id: Date.now(), timestamp, type, message, status }]);
    };

    // Auto-scroll
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollTop = logsEndRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div className="card" style={{ marginTop: '1.5rem', fontFamily: 'monospace' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Terminal size={20} color="#10b981" />
                    <h3 className="stat-label" style={{ margin: 0, fontSize: '1.1rem' }}>Terminal en Vivo</h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                    {connected ? (
                        <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Wifi size={14} /> ONLINE
                        </span>
                    ) : (
                        <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <WifiOff size={14} /> OFFLINE
                        </span>
                    )}
                </div>
            </div>

            <div ref={logsEndRef} style={{
                background: '#0f172a',
                borderRadius: '6px',
                padding: '1rem',
                height: '300px',
                overflowY: 'auto',
                border: '1px solid #334155'
            }}>
                {logs.length === 0 && (
                    <div style={{ color: '#64748b', textAlign: 'center', paddingTop: '2rem' }}>
                        Esperando eventos del sistema...
                    </div>
                )}
                {logs.map((log, index) => (
                    <div key={index} style={{ marginBottom: '4px', lineHeight: '1.4', fontSize: '0.9rem' }}>
                        <span style={{ color: '#64748b', marginRight: '8px' }}>[{log.timestamp}]</span>
                        <span style={{
                            color: log.type === 'System' ? '#38bdf8' : '#f59e0b',
                            fontWeight: 'bold',
                            marginRight: '8px',
                            textTransform: 'uppercase'
                        }}>{log.type}:</span>
                        <span style={{
                            color: log.status === 'error' ? '#ef4444' :
                                log.status === 'success' ? '#10b981' : '#e2e8f0'
                        }}>
                            {log.message}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default LiveTerminal;
