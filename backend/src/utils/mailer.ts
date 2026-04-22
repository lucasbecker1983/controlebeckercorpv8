import nodemailer from 'nodemailer';
import { pool } from '../config/db';

export type SmtpConfig = {
    host: string;
    port: number;
    username: string;
    password: string;
    from_email: string;
    from_name: string;
    to_email: string;
    use_tls: boolean;
    use_ssl: boolean;
    requires_auth: boolean;
    is_active: boolean;
};

const DEFAULT_SMTP_CONFIG: SmtpConfig = {
    host: 'smtp.gmail.com',
    port: 587,
    username: '',
    password: '',
    from_email: '',
    from_name: 'Becker Sentinel',
    to_email: '',
    use_tls: true,
    use_ssl: false,
    requires_auth: true,
    is_active: true,
};

let smtpSchemaReady: Promise<void> | null = null;

export const ensureSmtpSchema = async () => {
    if (!smtpSchemaReady) {
        smtpSchemaReady = (async () => {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS sys_smtp_config (
                    host text DEFAULT 'smtp.gmail.com',
                    port integer DEFAULT 587,
                    username text DEFAULT '',
                    pass text DEFAULT '',
                    to_email text DEFAULT ''
                )
            `);
            await pool.query(`ALTER TABLE sys_smtp_config ADD COLUMN IF NOT EXISTS from_email text DEFAULT ''`);
            await pool.query(`ALTER TABLE sys_smtp_config ADD COLUMN IF NOT EXISTS from_name text DEFAULT 'Becker Sentinel'`);
            await pool.query(`ALTER TABLE sys_smtp_config ADD COLUMN IF NOT EXISTS use_tls boolean DEFAULT true`);
            await pool.query(`ALTER TABLE sys_smtp_config ADD COLUMN IF NOT EXISTS use_ssl boolean DEFAULT false`);
            await pool.query(`ALTER TABLE sys_smtp_config ADD COLUMN IF NOT EXISTS requires_auth boolean DEFAULT true`);
            await pool.query(`ALTER TABLE sys_smtp_config ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true`);
            await pool.query(`ALTER TABLE sys_smtp_config ADD COLUMN IF NOT EXISTS updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP`);
        })().catch((error) => {
            smtpSchemaReady = null;
            throw error;
        });
    }
    await smtpSchemaReady;
};

const normalizeSmtpRow = (row: any): SmtpConfig => ({
    host: row?.host || DEFAULT_SMTP_CONFIG.host,
    port: Number(row?.port || DEFAULT_SMTP_CONFIG.port),
    username: row?.username || '',
    password: row?.pass || '',
    from_email: row?.from_email || row?.username || '',
    from_name: row?.from_name || DEFAULT_SMTP_CONFIG.from_name,
    to_email: row?.to_email || row?.username || '',
    use_tls: row?.use_tls ?? DEFAULT_SMTP_CONFIG.use_tls,
    use_ssl: row?.use_ssl ?? Number(row?.port) === 465,
    requires_auth: row?.requires_auth ?? DEFAULT_SMTP_CONFIG.requires_auth,
    is_active: row?.is_active ?? DEFAULT_SMTP_CONFIG.is_active,
});

export const getStoredSmtpConfig = async (): Promise<SmtpConfig> => {
    await ensureSmtpSchema();
    const result = await pool.query('SELECT * FROM sys_smtp_config ORDER BY updated_at DESC NULLS LAST LIMIT 1');
    if (result.rows.length === 0) {
        return { ...DEFAULT_SMTP_CONFIG };
    }
    return normalizeSmtpRow(result.rows[0]);
};

export const saveSmtpConfig = async (payload: Partial<SmtpConfig>) => {
    await ensureSmtpSchema();

    const current = await getStoredSmtpConfig();
    const next: SmtpConfig = {
        ...current,
        ...payload,
        host: payload.host?.trim() || current.host,
        port: Number(payload.port || current.port || DEFAULT_SMTP_CONFIG.port),
        username: payload.username?.trim() ?? current.username,
        password: payload.password !== undefined && payload.password !== '' ? payload.password : current.password,
        from_email: payload.from_email?.trim() ?? current.from_email,
        from_name: payload.from_name?.trim() || current.from_name,
        to_email: payload.to_email?.trim() ?? current.to_email,
        use_tls: payload.use_tls ?? current.use_tls,
        use_ssl: payload.use_ssl ?? current.use_ssl,
        requires_auth: payload.requires_auth ?? current.requires_auth,
        is_active: payload.is_active ?? current.is_active,
    };

    await pool.query('DELETE FROM sys_smtp_config');
    await pool.query(
        `INSERT INTO sys_smtp_config
            (host, port, username, pass, to_email, from_email, from_name, use_tls, use_ssl, requires_auth, is_active, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
        [
            next.host,
            next.port,
            next.username,
            next.password,
            next.to_email,
            next.from_email,
            next.from_name,
            next.use_tls,
            next.use_ssl,
            next.requires_auth,
            next.is_active,
        ]
    );

    return next;
};

const buildTransport = (conf: SmtpConfig) => {
    const secure = conf.use_ssl || conf.port === 465;
    const transporterConfig: any = {
        host: conf.host,
        port: conf.port,
        secure,
        tls: { rejectUnauthorized: false },
    };

    if (conf.requires_auth) {
        transporterConfig.auth = {
            user: conf.username,
            pass: conf.password,
        };
    }

    return nodemailer.createTransport(transporterConfig);
};

const sendInternal = async (conf: SmtpConfig, subject: string, text: string, type: 'alert' | 'test' | 'reminder') => {
    if (!conf.is_active) {
        throw new Error('SMTP desativado.');
    }

    const transporter = buildTransport(conf);

    let headerColor = '#3b82f6';
    let title = 'NOTIFICACAO SISTEMA';

    if (type === 'alert') {
        headerColor = '#ef4444';
        title = 'ALERTA DE FALHA CRITICA';
    } else if (type === 'reminder') {
        headerColor = '#f97316';
        title = 'FALHA PERSISTENTE (3H)';
    } else if (type === 'test') {
        headerColor = '#10b981';
        title = 'TESTE DE CONFIGURACAO';
    }

    const html = `
    <!DOCTYPE html>
    <html>
    <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
                <td align="center" style="padding: 40px 0;">
                    <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
                        <tr>
                            <td align="center" style="padding: 30px; background-color: ${headerColor};">
                                <h1 style="color: #ffffff; margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">${title}</h1>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 40px; color: #e2e8f0;">
                                <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">${text.replace(/\n/g, '<br>')}</p>
                                <div style="background-color: #0f172a; padding: 20px; border-radius: 8px; border-left: 4px solid ${headerColor}; margin-top: 20px;">
                                    <p style="margin: 0; font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: bold;">Origem</p>
                                    <p style="margin: 5px 0 0 0; font-size: 14px; color: #fff; font-family: monospace;">Becker Corp V8 Server</p>
                                    <p style="margin: 15px 0 0 0; font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: bold;">Horario do Evento</p>
                                    <p style="margin: 5px 0 0 0; font-size: 14px; color: #fff; font-family: monospace;">${new Date().toLocaleString('pt-BR')}</p>
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <td align="center" style="padding: 20px; background-color: #020617; border-top: 1px solid #334155;">
                                <p style="color: #64748b; font-size: 12px; margin: 0;">&copy; 2026 Becker Corp - Monitoramento Inteligente</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;

    const fromAddress = conf.from_email || conf.username;
    return transporter.sendMail({
        from: `"${conf.from_name || 'Becker Sentinel'}" <${fromAddress}>`,
        to: conf.to_email || conf.username,
        subject: `[BECKER V8] ${title}: ${subject}`,
        text,
        html,
    });
};

export const sendAlert = async (subject: string, message: string, isReminder = false) => {
    try {
        const conf = await getStoredSmtpConfig();
        if (!conf.username || !conf.password || !conf.is_active) {
            console.log('[MAILER] SMTP nao configurado ou desativado. Alerta ignorado.');
            return;
        }
        await sendInternal(conf, subject, message, isReminder ? 'reminder' : 'alert');
    } catch (error) {
        console.error('[MAILER] Erro envio:', error);
    }
};

export const testConnection = async (payload: Partial<SmtpConfig> & { to_email?: string }) => {
    const current = await getStoredSmtpConfig();
    const conf: SmtpConfig = {
        ...current,
        ...payload,
        port: Number(payload.port || current.port || DEFAULT_SMTP_CONFIG.port),
        password: payload.password !== undefined && payload.password !== '' ? payload.password : current.password,
        to_email: payload.to_email?.trim() || payload.username?.trim() || current.to_email || current.username,
    };
    await sendInternal(conf, 'Teste de Conexao', 'Se voce recebeu este e-mail, o sistema de alertas do Becker Corp V8 esta configurado corretamente.', 'test');
};
