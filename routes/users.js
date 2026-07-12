const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const { generateKey } = require('../middlewares/auth');

// Subida de imágenes en memoria (máx 5MB, solo imágenes)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Solo se permiten archivos de imagen'));
        }
        cb(null, true);
    }
});

const DEFAULT_AVATAR = 'https://files.catbox.moe/03odwx.jpg';

// Valida que profile_img sea una URL http/https bien formada
function esUrlValida(url) {
    try {
        const u = new URL(url);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

// ============== CONFIGURACIÓN ==============
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://hutao_agent:1EGiK6xbp6vpk1nk@dbhutaoapi.laxubsl.mongodb.net/?appName=DBHutaoAPI';
const MONGODB_DB = process.env.MONGODB_DB || 'hutao_api';

// Leer admin desde JSON
const adminPath = path.join(__dirname, '../database/users.json');
let adminUser = null;
try {
    const adminData = JSON.parse(fs.readFileSync(adminPath, 'utf-8'));
    adminUser = Array.isArray(adminData) ? adminData[0] : adminData;
    console.log('✅ Admin cargado desde JSON:', adminUser.username);
} catch (err) {
    console.error('❌ Error cargando admin desde JSON:', err.message);
}

// Conectar a MongoDB
if (mongoose.connection.readyState === 0) {
    mongoose.connect(`${MONGODB_URI}/${MONGODB_DB}`, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }).then(() => console.log('✅ Conectado a MongoDB Atlas'))
      .catch(err => console.error('❌ Error MongoDB:', err));
}

// Esquema para usuarios
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    key: { type: String, required: true, unique: true },
    role: { type: String, default: 'user' },
    plan: { type: String, default: 'free' },
    limit: { type: Number, default: 100 },
    requestToday: { type: Number, default: 0 },
    totalRequest: { type: Number, default: 0 },
    profile_img: { type: String, default: 'https://files.catbox.moe/03odwx.jpg' },
    lastRequestDate: { type: String, default: () => new Date().toISOString().split('T')[0] },
    createdAt: { type: Date, default: Date.now },
    vipSince: { type: Date, default: null },
    vipExpires: { type: Date, default: null }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

let startTime = Date.now();

// ============== FUNCIÓN PARA VERIFICAR EXPIRACIÓN ==============
async function verificarExpiracion(user) {
    if (user.vipExpires && new Date() > new Date(user.vipExpires)) {
        user.role = 'user';
        user.plan = 'free';
        user.limit = 100;
        user.vipSince = null;
        user.vipExpires = null;
        await user.save();
        return true;
    }
    return false;
}

// ============== SUBIR FOTO DE PERFIL (usada en registro/perfil) ==============
router.post('/upload-avatar', (req, res) => {
    upload.single('image')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ status: false, message: err.message || "Error al procesar la imagen" });
        }
        if (!req.file) {
            return res.status(400).json({ status: false, message: "No se envió ninguna imagen" });
        }

        try {
            const form = new FormData();
            form.append('reqtype', 'fileupload');
            form.append('fileToUpload', req.file.buffer, {
                filename: req.file.originalname || 'avatar.jpg',
                contentType: req.file.mimetype
            });

            const uploadRes = await axios.post('https://catbox.moe/user/api.php', form, {
                headers: form.getHeaders(),
                timeout: 20000
            });

            const url = String(uploadRes.data || '').trim();
            if (!esUrlValida(url)) {
                throw new Error('Respuesta inválida del servicio de imágenes');
            }

            res.json({ status: true, url });
        } catch (err) {
            console.error("Error subiendo avatar:", err.message);
            res.status(500).json({ status: false, message: "No se pudo subir la imagen. Intenta con una URL en su lugar." });
        }
    });
});

// ============== REGISTRO ==============
router.post('/register', async (req, res) => {
    const { username, email, password, profile_img } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ status: false, message: "Faltan datos obligatorios" });
    }

    if (adminUser && email === adminUser.email) {
        return res.status(400).json({ status: false, message: "Este email no puede ser registrado" });
    }

    // La foto de perfil es opcional: si mandan una URL debe ser válida, si no, se usa la de por defecto
    let avatarFinal = DEFAULT_AVATAR;
    if (profile_img && String(profile_img).trim() !== '') {
        if (!esUrlValida(profile_img)) {
            return res.status(400).json({ status: false, message: "La URL de la foto de perfil no es válida" });
        }
        avatarFinal = String(profile_img).trim();
    }

    try {
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ status: false, message: "El correo o usuario ya existe" });
        }

        const newUser = new User({
            username,
            email,
            password,
            key: generateKey(),
            role: "user",
            plan: "free",
            limit: 100,
            requestToday: 0,
            totalRequest: 0,
            profile_img: avatarFinal,
            lastRequestDate: new Date().toISOString().split('T')[0]
        });

        await newUser.save();
        res.json({ status: true, creator: "7Noonly", message: "Registro exitoso", key: newUser.key });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: false, message: "Error en el servidor durante el registro" });
    }
});

// ============== LOGIN ==============
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ status: false, message: "Email y contraseña requeridos" });
    }

    try {
        // Admin del JSON
        if (adminUser && email === adminUser.email && password === adminUser.password) {
            return res.json({
                status: true,
                creator: "KyokoAPI",
                data: {
                    username: adminUser.username,
                    email: adminUser.email,
                    key: adminUser.key,
                    role: "admin",
                    plan: "ADMIN VIP",
                    limit: adminUser.limit || 100000,
                    profileImg: adminUser.profile_img || "https://files.catbox.moe/03odwx.jpg"
                }
            });
        }

        // Buscar en MongoDB
        let user = await User.findOne({ email, password });
        if (!user) {
            return res.status(401).json({ status: false, message: "Credenciales incorrectas" });
        }

        await verificarExpiracion(user);

        res.json({
            status: true,
            creator: "KyokoAPI",
            data: {
                username: user.username,
                email: user.email,
                key: user.key,
                role: user.role,
                plan: user.plan,
                limit: user.limit,
                profileImg: user.profile_img
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: false, message: "Error interno en el servidor" });
    }
});

// ============== OBTENER MI PERFIL ==============
router.get('/me', async (req, res) => {
    const { apiKey } = req.query;
    if (!apiKey) return res.status(400).json({ status: false, message: "ApiKey requerida" });

    try {
        if (adminUser && apiKey === adminUser.key) {
            return res.json({
                status: true,
                creator: "KyokoAPI",
                data: {
                    username: adminUser.username,
                    email: adminUser.email,
                    key: adminUser.key,
                    role: "admin",
                    plan: "ADMIN VIP",
                    profile_img: adminUser.profile_img || "https://files.catbox.moe/03odwx.jpg",
                    requests: {
                        today: adminUser.requestToday || 0,
                        total: adminUser.totalRequest || 0,
                        limit: adminUser.limit || 100000,
                        remaining: (adminUser.limit || 100000) - (adminUser.requestToday || 0)
                    }
                }
            });
        }

        let user = await User.findOne({ key: apiKey });
        if (!user) return res.status(404).json({ status: false, message: "Usuario no encontrado" });

        await verificarExpiracion(user);

        let daysLeft = 0;
        if (user.vipExpires) {
            daysLeft = Math.ceil((new Date(user.vipExpires) - new Date()) / (1000 * 60 * 60 * 24));
        }

        res.json({
            status: true,
            creator: "KyokoAPI",
            data: {
                username: user.username,
                email: user.email,
                key: user.key,
                role: user.role,
                plan: user.plan,
                profile_img: user.profile_img,
                vipExpires: user.vipExpires,
                daysLeft: daysLeft,
                requests: {
                    today: user.requestToday,
                    total: user.totalRequest,
                    limit: user.limit,
                    remaining: user.limit - user.requestToday
                }
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: false, message: "Error interno" });
    }
});

// ============== ACTUALIZAR PERFIL (PROTEGIDO) ==============
router.post('/update-profile', async (req, res) => {
    const { apiKey, type, value } = req.body;

    if (!apiKey || !type || value === undefined) {
        return res.status(400).json({ status: false, message: "Faltan parámetros" });
    }

    // 🚫 BLOQUEAR CAMPOS PROHIBIDOS - SOLO ADMIN PUEDE CAMBIAR ESTO
    const forbiddenFields = ['role', 'plan', 'limit', 'vipSince', 'vipExpires', 'totalRequest', 'requestToday', 'key', 'verified'];
    if (forbiddenFields.includes(type)) {
        return res.status(403).json({ 
            status: false, 
            message: "No puedes modificar este campo. Solo el administrador puede cambiar roles y planes." 
        });
    }

    try {
        if (adminUser && apiKey === adminUser.key) {
            return res.status(403).json({ status: false, message: "El admin solo se modifica manualmente en users.json" });
        }

        const user = await User.findOne({ key: apiKey });
        if (!user) {
            return res.status(404).json({ status: false, message: "Llave maestra inválida" });
        }

        // Solo permitir editar estos campos básicos
        const allowedFields = ['username', 'email', 'password', 'profile_img'];
        if (!allowedFields.includes(type)) {
            return res.status(400).json({ status: false, message: "Acción no permitida para este campo" });
        }

        if (type === 'profile_img' && !esUrlValida(value)) {
            return res.status(400).json({ status: false, message: "La URL de la foto de perfil no es válida" });
        }

        user[type] = value;
        await user.save();

        res.json({ status: true, message: "KyokoAPI actualizado", field: type });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: false, message: "Error interno" });
    }
});

// ============== ESTADÍSTICAS ==============
router.get('/stats', async (req, res) => {
    try {
        const mongoUsers = await User.countDocuments();
        const totalUsers = mongoUsers + (adminUser ? 1 : 0);
        res.json({ status: true, users: totalUsers, endpoints: 50 });
    } catch (err) {
        res.status(500).json({ status: false });
    }
});

// ============== DASHBOARD GLOBAL ==============
router.get('/dashboard-global', async (req, res) => {
    try {
        const mongoUsers = await User.countDocuments();
        const totalUsers = mongoUsers + (adminUser ? 1 : 0);

        let topUsersMongo = await User.find({ totalRequest: { $gt: 0 } })
            .sort({ totalRequest: -1 })
            .limit(5);

        let topUsers = topUsersMongo.map(u => ({
            username: u.username,
            total: u.totalRequest,
            initial: u.username.charAt(0).toUpperCase(),
            profile_img: u.profile_img || 'https://files.catbox.moe/03odwx.jpg'
        }));

        if (adminUser && adminUser.totalRequest > 0 && topUsers.length < 5) {
            topUsers.push({
                username: adminUser.username,
                total: adminUser.totalRequest,
                initial: adminUser.username.charAt(0).toUpperCase(),
                profile_img: adminUser.profile_img || 'https://files.catbox.moe/03odwx.jpg'
            });
            topUsers.sort((a, b) => b.total - a.total);
        }

        const globalRequestsResult = await User.aggregate([
            { $group: { _id: null, total: { $sum: "$totalRequest" } } }
        ]);
        let globalRequests = globalRequestsResult[0]?.total || 0;
        if (adminUser && adminUser.totalRequest) globalRequests += adminUser.totalRequest;

        res.json({ status: true, totalUsers, globalRequests, uptime: startTime, top5: topUsers });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: false });
    }
});
// ============== ADMIN: VER TODOS ==============
router.get('/admin/all', async (req, res) => {
    const { apiKey } = req.query;

    try {
        let isAdmin = false;
        if (adminUser && apiKey === adminUser.key) {
            isAdmin = true;
        } else {
            const adminCheck = await User.findOne({ key: apiKey, role: 'admin' });
            isAdmin = !!adminCheck;
        }

        if (!isAdmin) return res.status(403).json({ status: false, message: "No autorizado" });

        const mongoUsers = await User.find({});
        if (adminUser) {
            mongoUsers.unshift({
                username: adminUser.username,
                email: adminUser.email,
                key: adminUser.key,
                role: 'admin',
                plan: 'ADMIN VIP',
                limit: adminUser.limit,
                totalRequest: adminUser.totalRequest || 0
            });
        }

        res.json({ status: true, users: mongoUsers });
    } catch (err) {
        res.status(500).json({ status: false });
    }
});

// ============== ADMIN: ACTUALIZAR ==============
router.post('/admin/update', async (req, res) => {
    const { adminKey, targetEmail, newData } = req.body;

    try {
        let isAdmin = false;
        if (adminUser && adminKey === adminUser.key) {
            isAdmin = true;
        } else {
            const adminCheck = await User.findOne({ key: adminKey, role: 'admin' });
            isAdmin = !!adminCheck;
        }

        if (!isAdmin) return res.status(403).json({ status: false });

        if (adminUser && targetEmail === adminUser.email) {
            return res.status(403).json({ status: false, message: "No se puede modificar el admin desde aquí" });
        }

        const result = await User.updateOne({ email: targetEmail }, { $set: newData });
        if (result.matchedCount === 0) {
            return res.status(404).json({ status: false });
        }

        res.json({ status: true });
    } catch (err) {
        res.status(500).json({ status: false });
    }
});

// ============== ADMIN: ELIMINAR ==============
router.post('/admin/delete', async (req, res) => {
    const { adminKey, targetEmail } = req.body;

    try {
        let isAdmin = false;
        if (adminUser && adminKey === adminUser.key) {
            isAdmin = true;
        } else {
            const adminCheck = await User.findOne({ key: adminKey, role: 'admin' });
            isAdmin = !!adminCheck;
        }

        if (!isAdmin) return res.status(403).json({ status: false });

        if (adminUser && targetEmail === adminUser.email) {
            return res.status(403).json({ status: false, message: "No se puede eliminar el admin" });
        }

        const result = await User.deleteOne({ email: targetEmail });
        if (result.deletedCount === 0) {
            return res.status(404).json({ status: false });
        }

        res.json({ status: true });
    } catch (err) {
        res.status(500).json({ status: false });
    }
});

module.exports = router;