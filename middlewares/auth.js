const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const getTodayDate = () => new Date().toISOString().split('T')[0];

const authHandler = async (req, res, next) => {
    const { apiKey } = req.query;
    const today = getTodayDate();

    if (!apiKey) {
        return res.status(401).json({ status: false, message: "API Key requerida" });
    }

    try {
        // Verificar si es el admin del JSON (sigue igual)
        const adminPath = path.join(__dirname, '../database/users.json');
        let adminUser = null;
        try {
            const adminData = JSON.parse(fs.readFileSync(adminPath, 'utf-8'));
            adminUser = Array.isArray(adminData) ? adminData[0] : adminData;
            
            if (adminUser && adminUser.key === apiKey) {
                // Admin no tiene límite, solo pasa
                req.user = adminUser;
                return next();
            }
        } catch (err) {
            // No hay admin, continuar con MongoDB
        }

        // Buscar en MongoDB
        const User = mongoose.model('User');
        let user = await User.findOne({ key: apiKey });
        
        if (!user) {
            return res.status(401).json({ status: false, message: "API Key inválida" });
        }

        // Verificar expiración de VIP
        if (user.vipExpires && new Date() > new Date(user.vipExpires)) {
            user.role = 'user';
            user.plan = 'free';
            user.limit = 100;
            user.vipSince = null;
            user.vipExpires = null;
            await user.save();
        }

        // Resetear contador diario si es nuevo día
        if (user.lastRequestDate !== today) {
            user.requestToday = 0;
            user.lastRequestDate = today;
            await user.save();
        }

        // Verificar límite diario
        if (user.requestToday >= user.limit) {
            return res.status(429).json({
                status: false,
                creator: "KyokoAPI",
                message: `Límite diario alcanzado (${user.limit}). Mejora tu plan para más requests.`
            });
        }

        // Incrementar contadores
        user.requestToday += 1;
        user.totalRequest += 1;
        await user.save();

        req.user = user;
        next();
    } catch (err) {
        console.error('Error en authHandler:', err);
        res.status(500).json({ status: false, message: "Error interno del servidor" });
    }
};

const generateKey = () => {
    const gen = (len) => {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < len; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };
    return `KYO-${gen(8)}-${gen(8)}`;
};

module.exports = { authHandler, generateKey };