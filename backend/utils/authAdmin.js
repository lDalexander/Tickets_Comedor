/**
 * Middleware de autenticación para el panel de administración.
 *
 * Mismo contrato que el `checkAuth` de adminRoutes.js: espera un Bearer token
 * firmado con ADMIN_JWT_SECRET cuyo payload es { id, nombre, rol, permisos }.
 * Se extrajo aquí para que los routers nuevos no sigan copiando el middleware.
 *
 *   router.get('/', checkAuth('admin'), handler)
 *   router.post('/x', checkAuth('superadmin'), handler)
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.ADMIN_JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL: ADMIN_JWT_SECRET no configurada. El servidor no puede arrancar.');
    process.exit(1);
}

const checkAuth = (level = 'admin') => (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ error: 'Unauthorized Access' });
    }
    try {
        const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
        req.adminUser = decoded;
        if (level === 'superadmin' && decoded.rol !== 'superadmin') {
            return res.status(403).json({ error: 'Se requiere acceso superadmin' });
        }
        return next();
    } catch {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

module.exports = { checkAuth };
