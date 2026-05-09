import { useState, useCallback } from 'react';
import axios from 'axios';

const TOKEN_KEY = 'comedor_admin_token';

function parseJWT(token) {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch {
        return null;
    }
}

function isTokenValid(token) {
    if (!token) return false;
    const payload = parseJWT(token);
    if (!payload || !payload.exp) return false;
    return payload.exp * 1000 > Date.now();
}

export function useAdminAuth() {
    const [token, setToken] = useState(() => {
        const t = localStorage.getItem(TOKEN_KEY);
        return isTokenValid(t) ? t : null;
    });

    const [user, setUser] = useState(() => {
        const t = localStorage.getItem(TOKEN_KEY);
        if (!isTokenValid(t)) return null;
        const p = parseJWT(t);
        return p ? { id: p.id, nombre: p.nombre, rol: p.rol } : null;
    });

    const login = useCallback(async (username, password) => {
        const res = await axios.post('/api/admin/login', { username, password });
        const { token: newToken, user: newUser } = res.data;
        localStorage.setItem(TOKEN_KEY, newToken);
        setToken(newToken);
        setUser(newUser);
        return newUser;
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
    }, []);

    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

    return { token, user, isAuthenticated: !!token, login, logout, authHeaders };
}
