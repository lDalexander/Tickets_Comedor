// App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import MenuSelection from './components/MenuSelection';
import AdminPanel from './components/Admin/AdminPanel';
import SuperAdminPanel from './components/Admin/SuperAdminPanel';
import AdminV2Panel from './components/AdminV2/AdminV2Panel';

function App() {
    return (
        <div className="App">
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/seleccion" element={<MenuSelection />} />
                <Route path="/admin" element={<AdminPanel />} />
                <Route path="/superadmin" element={<SuperAdminPanel />} />
                <Route path="/admin-v2" element={<AdminV2Panel />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </div>
    );
}

export default App;
