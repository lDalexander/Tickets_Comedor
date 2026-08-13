
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Edit, Trash, Plus, Database, Save, X, Search, Printer, Settings } from 'lucide-react';

const AdminPanel = () => {
    // --- ESTADOS (VARIABLES) ---
    const [auth, setAuth] = useState(false); // Estado de autenticación
    const [pin, setPin] = useState(''); // PIN ingresado

    // Datos de Tablas
    const [tables, setTables] = useState([]); // Lista de tablas en BD
    const [currentTable, setCurrentTable] = useState(null); // Tabla seleccionada
    const [data, setData] = useState([]); // Datos de la tabla actual
    const [schema, setSchema] = useState([]); // Estructura de la tabla (columnas)
    const [pk, setPk] = useState(null); // Llave primaria (ID)
    const [searchTerm, setSearchTerm] = useState(''); // Término de búsqueda

    // Modos de Edición/Creación
    const [editingRow, setEditingRow] = useState(null); // Fila siendo editada
    const [isNew, setIsNew] = useState(false); // Bandera: ¿Es nuevo registro?
    const [formData, setFormData] = useState({}); // Datos del formulario

    // Configuración
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [configData, setConfigData] = useState({
        horario_inicio: '11:45',
        horario_fin: '14:00',
        horario_activo: 'true'
    });

    // --- FUNCIONES AUXILIARES ---

    // Formatear celdas para visualización (Fechas, Horas)
    const formatCell = (col, value) => {
        if (!value) return '';

        // Si la columna es fecha, mostrar DD/MM/AAAA
        if (col.toLowerCase().includes('fecha')) {
            if (!value) return '';
            const d = new Date(value);
            // Usar métodos UTC para evitar cambios de zona horaria indeseados
            const day = d.getUTCDate().toString().padStart(2, '0');
            const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
            const year = d.getUTCFullYear();
            return `${day}/${month}/${year}`;
        }

        // Si la columna es hora, mostrar tal cual (BD tiene hora local)
        if (col.toLowerCase().includes('hora')) {
            return value;
        }
        return value;
    };

    // Filtrar datos según búsqueda
    const filteredData = data.filter(row => {
        if (!searchTerm) return true;
        return Object.values(row).some(val =>
            String(val).toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    // Cargar tablas al iniciar sesión
    useEffect(() => {
        if (auth) fetchTables();
    }, [auth]);

    // --- MANEJADORES DE EVENTOS ---

    const handleLogin = (e) => {
        e.preventDefault();
        // PIN quemado en código por simplicidad (Mejorar en producción)
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

    // Fetch Config
    const openConfig = async () => {
        try {
            const res = await axios.get('/api/config');
            if (res.data) setConfigData(res.data);
            setConfigModalOpen(true);
        } catch (e) {
            console.error(e);
            alert('Error cargando configuración');
        }
    };

    const saveConfig = async () => {
        try {
            await axios.post('/api/config', configData, { headers: { 'x-admin-secret': 'admin123' } });
            alert('Configuración guardada');
            setConfigModalOpen(false);
        } catch (e) {
            console.error(e);
            alert('Error guardando configuración');
        }
    };

    // Al seleccionar una tabla de la lista
    const selectTable = async (table) => {
        setCurrentTable(table);
        setEditingRow(null);
        try {
            // 1. Obtener Estructura (Schema)
            const schemaRes = await axios.get(`/api/admin/schema/${table}`, { headers: { 'x-admin-secret': 'admin123' } });
            setSchema(schemaRes.data);

            // Identificar Llave Primaria (PK)
            const pkCol = schemaRes.data.find(col => col.Key === 'PRI');
            setPk(pkCol ? pkCol.Field : schemaRes.data[0].Field); // Fallback a primera columna

            // 2. Obtener Datos
            const dataRes = await axios.get(`/api/admin/data/${table}`, { headers: { 'x-admin-secret': 'admin123' } });
            setData(dataRes.data);
        } catch (e) {
            console.error(e);
        }
    };

    // Guardar cambio (Crear o Editar)
    const handleSave = async () => {
        // Sanitizar y Preparar Payload
        const payload = { ...formData };

        // Ajustar formatos de fecha y hora para MySQL
        schema.forEach(col => {
            const val = payload[col.Field];
            if (!val) return;

            if (col.Type === 'date') {
                if (typeof val === 'string' && val.length > 10) {
                    payload[col.Field] = val.substring(0, 10);
                }
            }
            if (col.Type === 'datetime' || col.Type === 'timestamp') {
                if (typeof val === 'string' && val.includes('T')) {
                    payload[col.Field] = val.replace('T', ' ').substring(0, 19);
                }
            }
        });

        try {
            if (isNew) {
                // Crear (POST)
                await axios.post(`/api/admin/data/${currentTable}`, payload, { headers: { 'x-admin-secret': 'admin123' } });
            } else {
                // Editar (PUT)
                await axios.put(`/api/admin/data/${currentTable}/${pk}/${payload[pk]}`, payload, { headers: { 'x-admin-secret': 'admin123' } });
            }
            // Limpiar estado y recargar tabla
            setEditingRow(null);
            setIsNew(false);
            selectTable(currentTable);
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

    // Reimprimir Ticket (Llama al endpoint de utilidades)
    const handleReprint = async (row) => {
        if (!window.confirm('¿Reimprimir el ticket de ' + row.nombre + '?')) return;

        try {
            // Asegurar formato de fecha DD/MM/AAAA para el script de impresión
            let dateStr = row.fecha;
            if (dateStr && dateStr.includes('T')) {
                const d = new Date(dateStr);
                const day = d.getUTCDate().toString().padStart(2, '0');
                const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
                const year = d.getUTCFullYear();
                dateStr = `${day}/${month}/${year}`;
            }

            // Asegurar formato de hora HH:MM
            let timeStr = row.hora;
            if (timeStr && typeof timeStr === 'string' && timeStr.includes(':')) {
                timeStr = timeStr.substring(0, 5);
            }

            // Enviar petición POST a la ruta de reimpresión
            await axios.post('/api/admin/reprint', {
                name: row.nombre,
                date: dateStr,
                time: timeStr,
                type: row.descripcion,
                ticket_number: row.numero_ticket
            }, { headers: { 'x-admin-secret': 'admin123' } });

            alert('Ticket enviado a la cola de impresión');
        } catch (e) {
            console.error(e);
            alert('Error al reimprimir: ' + (e.response?.data?.error || e.message));
        }
    };

    const [menuOpen, setMenuOpen] = useState(false);

    // --- RENDERIZADO (VISTA) ---

    // Pantalla de Login
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
            {/* Header Móvil */}
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

            {/* Overlay para móvil */}
            {menuOpen && <div className="sidebar-overlay" onClick={() => setMenuOpen(false)}></div>}

            {/* Barra Lateral (Sidebar) */}
            <div className={`admin-sidebar ${menuOpen ? 'open' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h2 style={{ color: '#38bdf8', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Database size={20} /> Tablas
                    </h2>
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

                {/* Botón Configuración */}
                <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button onClick={openConfig} style={{ width: '100%', padding: '0.5rem', background: '#334155', color: '#f1f5f9', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        <Settings size={18} /> Configuración
                    </button>
                    <button onClick={() => setAuth(false)} style={{ width: '100%', padding: '0.5rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Salir</button>
                </div>
            </div>

            {/* Contenido Principal */}
            <div className="admin-content">
                {!currentTable ? (
                    <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: '4rem' }}>Selecciona una tabla para gestionar</div>
                ) : (
                    <>
                        {/* Cabecera de Tabla y Acciones */}
                        <div className="admin-header-actions">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                <h1 style={{ textTransform: 'capitalize', margin: 0 }}>{currentTable}</h1>

                                {/* Barra de Búsqueda */}
                                <div className="search-container" style={{ position: 'relative' }}>
                                    <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                    <input
                                        type="text"
                                        placeholder="Buscar..."
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
                                <Plus size={16} /> Nuevo Registro
                            </button>
                        </div>

                        {/* Tabla de Datos */}
                        <div className="responsive-table">
                            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#cbd5e1', minWidth: '600px' }}>
                                <thead>
                                    <tr style={{ background: '#0f172a' }}>
                                        {schema.map(col => <th key={col.Field} style={{ padding: '0.75rem', textAlign: 'left' }}>{col.Field}</th>)}
                                        <th style={{ padding: '0.75rem' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredData.map((row, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #334155' }}>
                                            {schema.map(col => <td key={col.Field} style={{ padding: '0.75rem' }}>{formatCell(col.Field, row[col.Field])}</td>)}
                                            <td style={{ padding: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                                                {/* Botones de Acción: Editar / Borrar */}
                                                <button onClick={() => { setIsNew(false); setEditingRow(row); setFormData(row); }} style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer' }}><Edit size={16} /></button>
                                                <button onClick={() => handleDelete(row[pk])} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash size={16} /></button>

                                                {/* Botón Reimprimir (Solo en tabla registros) */}
                                                {currentTable === 'registros' && (
                                                    <button
                                                        onClick={() => handleReprint(row)}
                                                        title="Reimprimir Ticket"
                                                        style={{ background: 'transparent', border: 'none', color: '#f59e0b', cursor: 'pointer' }}>
                                                        <Printer size={16} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {/* Modal de Edición (Ventana flotante) */}
                {(editingRow) && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h2 style={{ marginBottom: '1rem' }}>{isNew ? 'Nuevo Registro' : 'Editar Registro'}</h2>
                            <div style={{ display: 'grid', gap: '1rem' }}>
                                {schema.map(col => (
                                    <div key={col.Field}>
                                        <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.9rem', marginBottom: '0.25rem' }}>{col.Field} <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>({col.Type})</span></label>
                                        <input
                                            type="text"
                                            value={formData[col.Field] || ''}
                                            onChange={e => setFormData({ ...formData, [col.Field]: e.target.value })}
                                            disabled={!isNew && col.Key === 'PRI' && col.Extra === 'auto_increment'} // Prohibir editar ID
                                            style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px' }}
                                        />
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                                <button onClick={() => setEditingRow(null)} style={{ padding: '0.5rem 1rem', background: 'transparent', color: '#94a3b8', border: '1px solid #475569', borderRadius: '4px', cursor: 'pointer' }}>Cancelar</button>
                                <button onClick={handleSave} style={{ padding: '0.5rem 1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Guardar</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal de Configuración */}
                {configModalOpen && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Settings size={22} color="#f59e0b" /> Configuración de Servicio
                            </h2>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <label style={{ color: '#f1f5f9', fontWeight: '500' }}>Activar Restricción de Horario</label>
                                    <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '48px', height: '26px' }}>
                                        <input
                                            type="checkbox"
                                            checked={configData.horario_activo === 'true'}
                                            onChange={(e) => setConfigData({ ...configData, horario_activo: e.target.checked ? 'true' : 'false' })}
                                            style={{ opacity: 0, width: 0, height: 0 }}
                                        />
                                        <span style={{
                                            position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                            backgroundColor: configData.horario_activo === 'true' ? '#10b981' : '#64748b',
                                            transition: '.4s', borderRadius: '26px'
                                        }}>
                                            <span style={{
                                                position: 'absolute', content: '""', height: '18px', width: '18px',
                                                left: configData.horario_activo === 'true' ? '26px' : '4px', bottom: '4px',
                                                backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                                            }}></span>
                                        </span>
                                    </label>
                                </div>
                                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>Si se desactiva, se podrá imprimir tickets las 24 horas.</p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                                <div>
                                    <label style={{ display: 'block', color: '#94a3b8', marginBottom: '0.5rem' }}>Hora Inicio</label>
                                    <input
                                        type="time"
                                        value={configData.horario_inicio || ''}
                                        onChange={(e) => setConfigData({ ...configData, horario_inicio: e.target.value })}
                                        style={{ width: '100%', padding: '0.75rem', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', color: '#94a3b8', marginBottom: '0.5rem' }}>Hora Fin</label>
                                    <input
                                        type="time"
                                        value={configData.horario_fin || ''}
                                        onChange={(e) => setConfigData({ ...configData, horario_fin: e.target.value })}
                                        style={{ width: '100%', padding: '0.75rem', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button onClick={() => setConfigModalOpen(false)} style={{ padding: '0.75rem 1rem', background: 'transparent', color: '#94a3b8', border: '1px solid #475569', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                                <button onClick={saveConfig} style={{ padding: '0.75rem 1.5rem', background: '#38bdf8', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>Guardar Cambios</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminPanel;
