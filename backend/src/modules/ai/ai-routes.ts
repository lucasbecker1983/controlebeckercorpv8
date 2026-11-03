import { Router } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { getRequestActor } from '../../utils/request-context';
import { institutionalAuditService } from '../institutional/institutional-audit-service';
import { ragService } from '../control/rag-service';
import { AssistantUnavailable, askAssistant } from './ai-assistant';
import { clearKey, getKey, isAdmin, isGod, keyStatus, PROVIDER_LABEL, PROVIDERS, Provider, setKey } from './ai-env';
import { hunt, isHunting, lastRuns } from './ai-hunter';
import { EXCLUDED_PROJECTS, isIndexing, knowledgeStatus, reindexKnowledge, searchKnowledge } from './ai-knowledge';
import { listSources } from './ai-sources';
import { listProviderModels } from './ai-providers';
import { ensureSchema, getSettings, listModelEvents, listModels, logChat, saveSettings } from './ai-store';

const router = Router();

const asProvider = (value: any): Provider | null => ((PROVIDERS as string[]).includes(String(value)) ? (value as Provider) : null);

// Limite por usuário para não gastar a cota gratuita: 20 perguntas a cada 10 minutos.
const recent = new Map<string, number[]>();
const allowQuestion = (user: string) => {
    const now = Date.now();
    const list = (recent.get(user) || []).filter((t) => now - t < 10 * 60 * 1000);
    if (list.length >= 20) {
        recent.set(user, list);
        return false;
    }
    list.push(now);
    recent.set(user, list);
    return true;
};

const requireAdmin = (req: AuthenticatedRequest, res: any, next: any) => {
    if (!isAdmin(req.auth)) return res.status(403).json({ error: 'Apenas administradores usam o assistente.' });
    return next();
};

// Módulo secreto: para quem não é GOD a rota nem "existe".
const requireGod = (req: AuthenticatedRequest, res: any, next: any) => {
    if (!isGod(req.auth)) return res.status(404).json({ error: 'Não encontrado.' });
    return next();
};

const audit = async (req: AuthenticatedRequest, action: string, payload: any, success = true) => {
    const actor = getRequestActor(req);
    await institutionalAuditService.log({
        action,
        requestedBy: actor.username || 'desconhecido',
        actorUserId: actor.userId,
        actorIp: actor.ipAddress,
        actorUserAgent: actor.userAgent,
        payload,
        result: {},
        success,
    }).catch(() => null);
};

// ─── assistente ─────────────────────────────────────────────────────────────────────────────────
router.post('/ask', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const question = String(req.body?.question || '').trim();
    if (question.length < 3) return res.status(400).json({ error: 'Escreva uma pergunta com pelo menos 3 letras.' });
    if (question.length > 1200) return res.status(400).json({ error: 'Pergunta muito longa (máximo 1200 caracteres).' });
    const actor = getRequestActor(req);
    const who = actor.username || 'desconhecido';
    if (!allowQuestion(who)) return res.status(429).json({ error: 'Muitas perguntas seguidas. Aguarde alguns minutos (o plano gratuito dos provedores tem limite).' });

    const started = Date.now();
    try {
        const result = await askAssistant(question);
        await logChat({
            username: who, userId: actor.userId, ip: actor.ipAddress, question, provider: result.provider, model: result.model,
            tools: result.steps.map((s) => ({ ferramenta: s.ferramenta, total: s.total, erro: s.erro })), attempts: result.attempts,
            ms: result.ms, success: true, answerChars: result.answer.length,
        }).catch(() => null);
        return res.json(result);
    } catch (error: any) {
        const unavailable = error instanceof AssistantUnavailable;
        await logChat({
            username: who, userId: actor.userId, ip: actor.ipAddress, question, attempts: unavailable ? error.attempts : [],
            ms: Date.now() - started, success: false, error: error?.message,
        }).catch(() => null);
        // Sem IA disponível: ainda devolve os trechos da documentação (busca local, sem provedor externo).
        const docs = await ragService.search(question, 4).catch(() => []);
        return res.status(unavailable ? 503 : 500).json({
            error: error?.message || 'Falha ao consultar o assistente.',
            attempts: unavailable ? error.attempts : [],
            fallback_docs: docs,
        });
    }
});

// Situação para qualquer administrador (sem expor chaves).
router.get('/status', requireAdmin, async (_req, res) => {
    const settings = await getSettings();
    const models = await listModels();
    return res.json({
        providers: PROVIDERS.map((p) => ({
            provider: p,
            label: PROVIDER_LABEL[p],
            configured: keyStatus(p).configured,
            enabled: settings.enabled[p],
            models_ok: models.filter((m) => m.provider === p && m.status === 'ok').length,
            models_total: models.filter((m) => m.provider === p && m.status !== 'gone').length,
        })),
        order: settings.order,
        hunting: isHunting(),
    });
});

router.get('/sources', requireAdmin, (_req, res) => res.json({ sources: listSources() }));

// ─── módulo secreto (somente GOD) ───────────────────────────────────────────────────────────────
router.get('/admin/overview', requireGod, async (_req, res) => {
    await ensureSchema();
    const [settings, models, runs, events] = await Promise.all([getSettings(), listModels(), lastRuns(5), listModelEvents(40)]);
    return res.json({
        providers: PROVIDERS.map((p) => ({ provider: p, label: PROVIDER_LABEL[p], ...keyStatus(p), enabled: settings.enabled[p] })),
        order: settings.order,
        models,
        runs,
        events,
        hunting: isHunting(),
        note: 'Só modelos gratuitos entram no catálogo. As chaves ficam no .env do servidor e nunca voltam para a tela.',
    });
});

router.put('/admin/keys/:provider', requireGod, async (req: AuthenticatedRequest, res) => {
    const provider = asProvider(req.params.provider);
    if (!provider) return res.status(400).json({ error: 'Provedor inválido.' });
    try {
        setKey(provider, String(req.body?.key ?? ''));
    } catch (error: any) {
        await audit(req, 'ai_key_set_failed', { provider }, false);
        return res.status(400).json({ error: error?.message || 'Chave inválida.' });
    }
    await audit(req, 'ai_key_set', { provider, final: keyStatus(provider).hint });
    // Já procura os modelos gratuitos com a chave nova.
    if (!isHunting()) hunt('manual', getRequestActor(req).username || 'god').catch(() => null);
    return res.json({ success: true, provider, ...keyStatus(provider) });
});

router.delete('/admin/keys/:provider', requireGod, async (req: AuthenticatedRequest, res) => {
    const provider = asProvider(req.params.provider);
    if (!provider) return res.status(400).json({ error: 'Provedor inválido.' });
    clearKey(provider);
    await audit(req, 'ai_key_removed', { provider });
    return res.json({ success: true, provider, ...keyStatus(provider) });
});

router.post('/admin/keys/:provider/test', requireGod, async (req, res) => {
    const provider = asProvider(req.params.provider);
    if (!provider) return res.status(400).json({ error: 'Provedor inválido.' });
    if (!getKey(provider) && provider !== 'openrouter') return res.json({ ok: false, message: 'Sem chave configurada.' });
    try {
        const data = await listProviderModels(provider);
        const count = (data?.data || data?.models || []).length;
        return res.json({ ok: true, message: `Chave aceita pelo provedor (${count} modelos na listagem).` });
    } catch (error: any) {
        return res.json({ ok: false, message: String(error?.message || 'Falha ao testar.') });
    }
});

router.put('/admin/settings', requireGod, async (req: AuthenticatedRequest, res) => {
    const current = await getSettings();
    const order = Array.isArray(req.body?.order) ? (req.body.order as any[]).map(asProvider).filter(Boolean) as Provider[] : current.order;
    for (const p of PROVIDERS) if (!order.includes(p)) order.push(p);
    const enabled = { ...current.enabled };
    for (const p of PROVIDERS) if (typeof req.body?.enabled?.[p] === 'boolean') enabled[p] = req.body.enabled[p];
    await saveSettings({ order: Array.from(new Set(order)), enabled }, getRequestActor(req).username || 'god');
    await audit(req, 'ai_settings_changed', { order, enabled });
    return res.json({ success: true, order, enabled });
});

router.post('/admin/hunt', requireGod, async (req: AuthenticatedRequest, res) => {
    if (isHunting()) return res.status(409).json({ error: 'O caçador já está procurando.' });
    hunt('manual', getRequestActor(req).username || 'god').catch((error) => console.error('[IA-CAÇADOR] Busca manual falhou:', error?.message || error));
    return res.status(202).json({ started: true });
});

// ─── base de conhecimento do servidor (somente GOD) ─────────────────────────────────────────────
router.get('/admin/knowledge', requireGod, async (_req, res) => {
    return res.json({ ...(await knowledgeStatus()), excluded_projects: EXCLUDED_PROJECTS.map((re) => re.source) });
});

router.post('/admin/knowledge/reindex', requireGod, async (req: AuthenticatedRequest, res) => {
    if (isIndexing()) return res.status(409).json({ error: 'A indexação já está em andamento.' });
    try {
        const summary = await reindexKnowledge('manual');
        await audit(req, 'ai_knowledge_reindexed', { total: summary.total, changed: summary.changed, removed: summary.removed });
        return res.json({ success: true, summary });
    } catch (error: any) {
        return res.status(500).json({ error: String(error?.message || error).slice(0, 300) });
    }
});

// Testa a busca como o assistente a vê (útil para conferir o que a base sabe e se algo sensível apareceu).
router.get('/admin/knowledge/search', requireGod, async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 300);
    if (q.length < 3) return res.status(400).json({ error: 'Digite ao menos 3 caracteres.' });
    return res.json({ hits: await searchKnowledge(q, 8) });
});

export default router;
