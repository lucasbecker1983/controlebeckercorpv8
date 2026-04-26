import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { pool } from '../config/db';
import { runCommand } from '../utils/process';

const readTextIfExists = (filePath: string) => {
    try {
        return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    } catch {
        return '';
    }
};

const parseSimpleTable = (html: string) => {
    const rows = Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
    return rows.map((rowMatch) => {
        const cells = Array.from(rowMatch[1].matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi));
        return cells.map((cellMatch) => cellMatch[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    }).filter((row) => row.length);
};

export class ReportService {
    async listReports() {
        if (!fs.existsSync(env.sargDir)) return [];

        return fs.readdirSync(env.sargDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => {
                const fullPath = path.join(env.sargDir, entry.name);
                const stat = fs.statSync(fullPath);
                return {
                    id: entry.name,
                    name: entry.name,
                    path: fullPath,
                    updated_at: stat.mtime.toISOString(),
                    index_url: `/sarg/${entry.name}/index.html`,
                };
            })
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    }

    async generate() {
        await runCommand('sarg', ['-x'], { elevated: true });
        return this.listReports();
    }

    async buildInstitutionalReport(reportKey?: string) {
        const reports = await this.listReports();
        const selected = reportKey
            ? reports.find((item) => item.id === reportKey)
            : reports[0];

        if (!selected) {
            throw new Error('Nenhum relatório SARG disponível.');
        }

        const reportDir = path.join(env.sargDir, selected.id);
        const topSitesHtml = readTextIfExists(path.join(reportDir, 'topsites.html'));
        const deniedHtml = readTextIfExists(path.join(reportDir, 'denied.html'));
        const siteUserHtml = readTextIfExists(path.join(reportDir, 'siteuser.html'));
        const generalText = readTextIfExists(path.join(reportDir, 'sarg-general'));

        const topSiteRows = parseSimpleTable(topSitesHtml).slice(1).map((cells) => ({
            rank: cells[0] || null,
            domain: cells[1] || null,
            connects: Number(String(cells[2] || '0').replace(/[^\d]/g, '')) || 0,
            bytes: cells[3] || null,
            users: Number(String(cells[5] || '0').replace(/[^\d]/g, '')) || 0,
        }));
        const deniedRows = parseSimpleTable(deniedHtml).slice(1).map((cells) => ({
            user: cells[0] || null,
            client_ip: cells[1] || null,
            occurred_at: cells[2] || null,
            domain: cells[3] || null,
        }));
        const siteUserRows = parseSimpleTable(siteUserHtml).slice(1).map((cells) => ({
            rank: cells[0] || null,
            domain: cells[1] || null,
            user: cells[2] || null,
        }));
        const generalParts = generalText.trim().split(/\s+/);

        const [dns24h, access24h, proxy24h, latestProxy] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE action = 'blocked')::int AS blocked,
                    COUNT(DISTINCT client_ip)::int AS unique_ips
                FROM access_events
                WHERE occurred_at >= NOW() - INTERVAL '24 hours'
            `).catch(() => ({ rows: [{ total: 0, blocked: 0, unique_ips: 0 }] })),
            pool.query(`
                SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE action = 'blocked')::int AS blocked,
                    COUNT(DISTINCT client_ip)::int AS unique_ips
                FROM dns_policy_events
                WHERE occurred_at >= NOW() - INTERVAL '24 hours'
            `).catch(() => ({ rows: [{ total: 0, blocked: 0, unique_ips: 0 }] })),
            pool.query(`
                SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE action IN ('DENIED', 'BLOCK', 'BLOCKED'))::int AS blocked,
                    COUNT(DISTINCT client_ip)::int AS unique_ips
                FROM proxy_audit_log
                WHERE "timestamp" >= NOW() - INTERVAL '24 hours'
            `).catch(() => ({ rows: [{ total: 0, blocked: 0, unique_ips: 0 }] })),
            pool.query(`
                SELECT "timestamp", client_ip, url, action
                FROM proxy_audit_log
                ORDER BY "timestamp" DESC
                LIMIT 1
            `).catch(() => ({ rows: [] })),
        ]);

        const proxySummary = proxy24h.rows[0] || { total: 0, blocked: 0, unique_ips: 0 };
        const dnsSummary = dns24h.rows[0] || { total: 0, blocked: 0, unique_ips: 0 };
        const accessSummary = access24h.rows[0] || { total: 0, blocked: 0, unique_ips: 0 };
        const explicitCoveragePct = accessSummary.total > 0
            ? Math.round((Number(proxySummary.total || 0) / Number(accessSummary.total || 1)) * 100)
            : 0;

        return {
            report: selected,
            generated_at: new Date().toISOString(),
            mode: 'acl-plus-dns',
            scope: {
                label: 'Uso explícito do proxy sob modo ACL + DNS',
                statement: 'Este relatório institucional usa o SARG apenas como evidência do tráfego que realmente passou pelo proxy explícito na porta 3129.',
                limitations: [
                    'Não representa toda a navegação da rede.',
                    'Eventos bloqueados apenas por DNS não aparecem no SARG.',
                    'Tráfego direto sem uso explícito do proxy não aparece no SARG.',
                ],
            },
            executive_summary: {
                total_accesses: Number(generalParts[1] || 0),
                total_bytes: generalParts[2] || null,
                total_users: Number(generalParts[3] || 0),
                explicit_proxy_events_24h: Number(proxySummary.total || 0),
                explicit_proxy_blocked_24h: Number(proxySummary.blocked || 0),
                explicit_proxy_unique_ips_24h: Number(proxySummary.unique_ips || 0),
                dns_events_24h: Number(dnsSummary.total || 0),
                dns_blocked_24h: Number(dnsSummary.blocked || 0),
                access_events_24h: Number(accessSummary.total || 0),
                access_blocked_24h: Number(accessSummary.blocked || 0),
                explicit_coverage_pct_24h: explicitCoveragePct,
                coverage_verdict: explicitCoveragePct >= 50
                    ? 'Cobertura proxy relevante para o recorte'
                    : 'Cobertura proxy parcial; usar DNS e access_events como fonte principal',
                latest_proxy_event_at: latestProxy.rows[0]?.timestamp || null,
            },
            highlights: {
                top_sites: topSiteRows.slice(0, 10),
                denied_attempts: deniedRows.slice(0, 10),
                site_users: siteUserRows.slice(0, 10),
                latest_proxy_event: latestProxy.rows[0] || null,
            },
        };
    }
}
