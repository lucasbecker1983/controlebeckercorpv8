import { Router } from 'express';
import { proxyEngineService } from '../services/proxy-module';

const router = Router();

const normalizeMode = (rawMode: unknown) => {
    if (rawMode === 'test-http-only' || rawMode === 'http-only') {
        return 'test-http-only';
    }
    if (rawMode === 'test-http+https' || rawMode === 'http-https') {
        return 'test-http+https';
    }
    if (rawMode === 'off') {
        return rawMode;
    }
    return 'off';
};

router.get('/status', async (req, res) => {
    try {
        res.json(await proxyEngineService.getStatus());
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/start', async (req, res) => {
    try {
        res.json(await proxyEngineService.setMode(
            normalizeMode(req.body?.mode),
            String(req.headers['x-user'] || req.body?.requested_by || 'api'),
            'engine:start',
        ));
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/stop', async (req, res) => {
    try {
        res.json(await proxyEngineService.setMode('off', String(req.headers['x-user'] || req.body?.requested_by || 'api'), 'engine:stop'));
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/mode/test-http-only', async (req, res) => {
    try {
        res.json(await proxyEngineService.setMode('test-http-only', String(req.headers['x-user'] || req.body?.requested_by || 'api'), 'mode:test-http-only'));
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/mode/test-http-https', async (req, res) => {
    try {
        res.json(await proxyEngineService.setMode('test-http+https', String(req.headers['x-user'] || req.body?.requested_by || 'api'), 'mode:test-http+https'));
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/mode/off', async (req, res) => {
    try {
        res.json(await proxyEngineService.setMode('off', String(req.headers['x-user'] || req.body?.requested_by || 'api'), 'mode:off'));
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/restore', async (req, res) => {
    try {
        res.json(await proxyEngineService.setMode('test-http+https', String(req.headers['x-user'] || req.body?.requested_by || 'api'), 'restore'));
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/emergency', async (req, res) => {
    try {
        res.json(await proxyEngineService.emergencyBypass(String(req.headers['x-user'] || req.body?.requested_by || 'api')));
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/bypass', async (req, res) => {
    try {
        const status = await proxyEngineService.getStatus();
        res.json({ global: status.bypass_global });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/bypass', async (req, res) => {
    try {
        const enabled = Boolean(req.body?.enabled);
        if (enabled) {
            res.json(await proxyEngineService.emergencyBypass(String(req.headers['x-user'] || req.body?.requested_by || 'api')));
            return;
        }
        res.json(await proxyEngineService.setMode('test-http+https', String(req.headers['x-user'] || req.body?.requested_by || 'api'), 'bypass:disable'));
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
