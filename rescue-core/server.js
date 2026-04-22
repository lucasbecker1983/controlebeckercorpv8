const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 6778;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`[CORE-6778] ${req.method} ${req.url}`);
    next();
});

// Rota de Login Mágica - Aceita tudo
app.post('/api/auth/login', (req, res) => {
    console.log("Login de Emergência Solicitado");
    res.json({
        success: true,
        token: "emergency_token_123",
        user: { id: 1, name: "Admin Rescue", email: "admin@rescue.local" }
    });
});

app.get('/api/auth/me', (req, res) => {
    res.json({ id: 1, name: "Admin Rescue", role: "admin" });
});

app.listen(PORT, '0.0.0.0', () => console.log(`>>> RESCUE CORE RODANDO NA PORTA ${PORT}`));
