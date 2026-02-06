import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Edit, Trash, Plus, Database, Save, X, Search } from 'lucide-react';

const AdminPanel = () => {
    const [auth, setAuth] = useState(false);
    const [pin, setPin] = useState('');
    const [tables, setTables] = useState([]);
    const [currentTable, setCurrentTable] = useState(null);
    const [data, setData] = useState([]);
    const [schema, setSchema] = useState([]);
    const [pk, setPk] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Edit/Add Mode
    const [editingRow, setEditingRow] = useState(null);
    const [isNew, setIsNew] = useState(false);
    const [formData, setFormData] = useState({});

    // Formatting Helper
    const formatCell = (col, value) => {
        if (!value) return '';
        if (col.toLowerCase().includes('fecha')) {
            // value is usually string "2026-02-04T00:00:00.000Z"
            const d = new Date(value);
            return d.toLocaleDateString('es-ES');
        }
        if (col.toLowerCase().includes('hora')) {
            // value is "16:02:18" (UTC) -> Need to show "11:02:18" (Local)
            // We can treat it as UTC date
            try {
                // Heuristic: if it looks like HH:MM:SS
                if (typeof value === 'string' && value.match(/^\d{2}:\d{2}:\d{2}$/)) {
                    // Create a date today with that UTC time
                    const d = new Date();
                    const [h, m, s] = value.split(':');
                    d.setUTCHours(h, m, s);
                    return d.toLocaleTimeString('es-ES');
                }
            } catch (e) { return value; }
        }
        return value;
    };

    // Filter Data
    const filteredData = data.filter(row => {
        if (!searchTerm) return true;
        return Object.values(row).some(val =>
            String(val).toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    useEffect(() => {
        if (auth) fetchTables();
    }, [auth]);

    const handleLogin = (e) => {
        e.preventDefault();
        if (pin === 'admin123') setAuth(true);
        else alert('PIN Incorrecto');
    };

    const fetchTables = async () => {
        try {
            const res = await axios.get('/api/admin/tables', { headers: { 'x-admin-secret': 'admin123' } });
            setTables(res.data);
        } catch (e) {
            console.error(e);
        }
    };

    const selectTable = async (table) => {
        setCurrentTable(table);
        setEditingRow(null);
        try {
            // 1. Get Schema
            const schemaRes = await axios.get(`/api/admin/schema/${table}`, { headers: { 'x-admin-secret': 'admin123' } });
            setSchema(schemaRes.data);

            // Find PK
            const pkCol = schemaRes.data.find(col => col.Key === 'PRI');
            setPk(pkCol ? pkCol.Field : schemaRes.data[0].Field); // Default to first col if no PK

            // 2. Get Data
            const dataRes = await axios.get(`/api/admin/data/${table}`, { headers: { 'x-admin-secret': 'admin123' } });
            setData(dataRes.data);
        } catch (e) {
            console.error(e);
        }
    };

    const handleSave = async () => {
        // Sanitize Payload for MySQL compatibility
        const payload = { ...formData };
        schema.forEach(col => {
            const val = payload[col.Field];
            if (!val) return;

            // Handle DATE types (only YYYY-MM-DD)
            if (col.Type === 'date') {
                if (typeof val === 'string' && val.length > 10) {
                    payload[col.Field] = val.substring(0, 10);
                }
            }
            // Handle DATETIME types (YYYY-MM-DD HH:MM:SS)
            if (col.Type === 'datetime' || col.Type === 'timestamp') {
                if (typeof val === 'string' && val.includes('T')) {
                    payload[col.Field] = val.replace('T', ' ').substring(0, 19);
                }
            }
        });

        try {
            if (isNew) {
                await axios.post(`/api/admin/data/${currentTable}`, payload, { headers: { 'x-admin-secret': 'admin123' } });
            } else {
                await axios.put(`/api/admin/data/${currentTable}/${pk}/${payload[pk]}`, payload, { headers: { 'x-admin-secret': 'admin123' } });
            }
            setEditingRow(null);
            setIsNew(false);
            selectTable(currentTable); // Refresh
        } catch (e) {
            alert('Error updating: ' + (e.response?.data?.error || e.message));
        }
    };

    const handleDelete = async (val) => {
        if (!window.confirm('¿Seguro que deseas eliminar este registro?')) return;
        try {
            await axios.delete(`/api/admin/data/${currentTable}/${pk}/${val}`, { headers: { 'x-admin-secret': 'admin123' } });
            selectTable(currentTable);
        } catch (e) {
            alert('Error deleting');
        }
    };

    const [menuOpen, setMenuOpen] = useState(false);

    // ... (keep logic same)

    if (!auth) {
        return (
            <div style={{ padding: '4rem', textAlign: 'center' }}>
                <h1 style={{ color: '#38bdf8' }}>ADMIN PANEL</h1>
                <form onSubmit={handleLogin} style={{ marginTop: '2rem' }}>
                    <input type="password" value={pin} onChange={e => setPin(e.target.value)}
                        placeholder="PIN" style={{ padding: '0.5rem', background: '#1e293b', color: 'white', border: '1px solid #475569' }} />
                    <button type="submit" style={{ marginLeft: '1rem', padding: '0.5rem 1rem', background: '#38bdf8', border: 'none', borderRadius: '4px' }}>Entrar</button>
                </form>
            </div>
        );
    }

    return (
        <div className="admin-container">
            {/* Mobile Header (Only visible on mobile via CSS) */}
            <div className="admin-mobile-header" style={{ display: 'none' }}>
                <h2 style={{ color: '#38bdf8', margin: 0, fontSize: '1.2rem' }}>Admin Panel</h2>
                <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: 'transparent', border: 'none', color: 'white' }}>
                    {menuOpen ? <X size={24} /> : <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ width: 24, height: 2, background: 'white' }}></div>
                        <div style={{ width: 24, height: 2, background: 'white' }}></div>
                        <div style={{ width: 24, height: 2, background: 'white' }}></div>
                    </div>}
                </button>
            </div>

            {/* Mobile Overlay */}
            {menuOpen && <div className="sidebar-overlay" onClick={() => setMenuOpen(false)}></div>}

            {/* Sidebar */}
            <div className={`admin-sidebar ${menuOpen ? 'open' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h2 style={{ color: '#38bdf8', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Database size={20} /> Tablas
                    </h2>
                    {/* Close button for mobile inside sidebar */}
                    <button className="mobile-only" onClick={() => setMenuOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', display: 'none' }}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {tables.map(t => (
                        <button key={t}
                            onClick={() => { selectTable(t); setMenuOpen(false); }}
                            style={{
                                padding: '0.75rem', textAlign: 'left',
                                background: currentTable === t ? '#1e293b' : 'transparent',
                                border: 'none', color: currentTable === t ? '#38bdf8' : '#94a3b8',
                                borderRadius: '6px', cursor: 'pointer'
                            }}>
                            {t}
                        </button>
                    ))}
                </div>
                <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #334155' }}>
                    <button onClick={() => setAuth(false)} style={{ width: '100%', padding: '0.5rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Salir</button>
                </div>
            </div>

            {/* Main Content */}
            <div className="admin-content">
                {!currentTable ? (
                    <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: '4rem' }}>Select a table to manage</div>
                ) : (
                    <>
                        <div className="admin-header-actions">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                <h1 style={{ textTransform: 'capitalize', margin: 0 }}>{currentTable}</h1>

                                {/* Search Bar */}
                                <div className="search-container" style={{ position: 'relative' }}>
                                    <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                    <input
                                        type="text"
                                        placeholder="Search..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        style={{
                                            padding: '0.5rem 0.5rem 0.5rem 2.25rem',
                                            background: '#1e293b',
                                            border: '1px solid #475569',
                                            color: 'white',
                                            borderRadius: '20px',
                                            outline: 'none',
                                            width: '250px'
                                        }}
                                    />
                                </div>
                            </div>

                            <button
                                onClick={() => { setIsNew(true); setFormData({}); setEditingRow({}); }}
                                style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Plus size={16} /> New Record
                            </button>
                        </div>

                        <div className="responsive-table">
                            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#cbd5e1', minWidth: '600px' }}>
                                <thead>
                                    <tr style={{ background: '#0f172a' }}>
                                        {schema.map(col => <th key={col.Field} style={{ padding: '0.75rem', textAlign: 'left' }}>{col.Field}</th>)}
                                        <th style={{ padding: '0.75rem' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredData.map((row, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #334155' }}>
                                            {schema.map(col => <td key={col.Field} style={{ padding: '0.75rem' }}>{formatCell(col.Field, row[col.Field])}</td>)}
                                            <td style={{ padding: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                                                <button onClick={() => { setIsNew(false); setEditingRow(row); setFormData(row); }} style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer' }}><Edit size={16} /></button>
                                                <button onClick={() => handleDelete(row[pk])} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash size={16} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {/* Edit Modal (Overlay) */}
                {(editingRow) && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h2 style={{ marginBottom: '1rem' }}>{isNew ? 'New Record' : 'Edit Record'}</h2>
                            <div style={{ display: 'grid', gap: '1rem' }}>
                                {schema.map(col => (
                                    <div key={col.Field}>
                                        <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.9rem', marginBottom: '0.25rem' }}>{col.Field} <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>({col.Type})</span></label>
                                        <input
                                            type="text"
                                            value={formData[col.Field] || ''}
                                            onChange={e => setFormData({ ...formData, [col.Field]: e.target.value })}
                                            disabled={!isNew && col.Key === 'PRI' && col.Extra === 'auto_increment'} // Disable ID editing if existing
                                            style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px' }}
                                        />
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                                <button onClick={() => setEditingRow(null)} style={{ padding: '0.5rem 1rem', background: 'transparent', color: '#94a3b8', border: '1px solid #475569', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                                <button onClick={handleSave} style={{ padding: '0.5rem 1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default AdminPanel;
