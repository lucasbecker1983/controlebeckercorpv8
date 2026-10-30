import os from 'os';
import '../config/env';

// Canal Telegram do Sentinela. Token e chat ficam só no backend/.env (TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID);
// sem eles o envio é ignorado e o e-mail segue como antes.
const apiBase = () => (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');

export const telegramConfigured = () =>
    Boolean((process.env.TELEGRAM_BOT_TOKEN || '').trim() && (process.env.TELEGRAM_CHAT_ID || '').trim());

/** Envia texto simples ao chat configurado. Nunca lança erro nem registra o token. */
export const sendTelegram = async (text: string): Promise<boolean> => {
    const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
    if (!token || !chatId) {
        console.warn('[TELEGRAM] Não configurado neste processo (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID ausentes); mensagem ignorada.');
        return false;
    }

    const body = `${text}\n\n— ${os.hostname()} · ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
    try {
        const response = await fetch(`${apiBase()}/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: body.slice(0, 4000), disable_web_page_preview: true }),
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
            console.error(`[TELEGRAM] Envio recusado (HTTP ${response.status}).`);
            return false;
        }
        console.log('[TELEGRAM] Mensagem enviada.');
        return true;
    } catch (error) {
        console.error('[TELEGRAM] Falha no envio:', error instanceof Error ? error.message.replace(token, '***') : 'erro desconhecido');
        return false;
    }
};
