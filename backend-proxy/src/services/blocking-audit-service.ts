import dns from 'dns';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import { pool } from '../config/db';
import { env } from '../config/env';
import { ensureBlockingReleaseSchema } from './blocking-release-schema-service';
import { identityEnrichmentService } from './identity-enrichment-service';
import { dnsIgnoredService } from './dns-ignored-service';
import { MANAGED_VLAN_SQL_LIST } from './blocking-release-scope';

type AuditFilters = Record<string, any>;

const DHCP_LEASES_FILE = process.env.DHCP_LEASES_FILE || '/var/lib/dhcp/dhcpd.leases';
const UNKNOWN_HOSTNAME = 'hostname não identificado';
const REPORT_ORG = 'Secretaria de Comércio, Indústria, Serviços e Inovação';
const REPORT_ENTITY = 'Prefeitura Municipal de Jacarezinho - PR';
const REPORT_SYSTEM = 'SGCG - Sistema de Governança e Controle Governamental';

const normalizeText = (value: unknown) => String(value || '').trim().toLowerCase();
const INTERNAL_DOMAIN_PATTERNS = [
    /\.vlan\d+\.local$/i,
];

const isInternalReportDomain = (value: unknown) => {
    const domain = normalizeText(value);
    if (!domain) return false;
    return INTERNAL_DOMAIN_PATTERNS.some((pattern) => pattern.test(domain));
};

const periodToInterval = (period: string) => {
    if (period === '7d') return '7 days';
    if (period === '30d') return '30 days';
    if (period === '90d') return '90 days';
    return '24 hours';
};

const actionLabel = (value: string) => {
    if (value === 'blocked') return 'Bloqueado';
    if (value === 'allowed') return 'Liberado';
    if (value === 'bypassed') return 'Bypass';
    return value || '-';
};

const formatDate = (value: string | Date | null | undefined) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds || seconds <= 0) return 'indisponível';
    const total = Math.round(seconds);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) return `${minutes}m ${rest}s`;
    return `${rest}s`;
};

const parseDhcpLeases = () => {
    const leases = new Map<string, string>();
    if (!fs.existsSync(DHCP_LEASES_FILE)) return leases;
    const content = fs.readFileSync(DHCP_LEASES_FILE, 'utf8');
    const matches = content.matchAll(/lease\s+([0-9.]+)\s+\{([\s\S]*?)\n\}/g);
    for (const match of matches) {
        const ip = match[1];
        const block = match[2] || '';
        const hostname = block.match(/client-hostname\s+"([^"]+)"/)?.[1]
            || block.match(/set\s+vendor-class-identifier\s+=\s+"([^"]+)"/)?.[1]
            || null;
        if (hostname) leases.set(ip, hostname);
    }
    return leases;
};

const reverseLookup = async (ip: string) => {
    if (!ip) return null;
    try {
        const result = await Promise.race([
            dns.promises.reverse(ip),
            new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 350)),
        ]);
        return Array.isArray(result) && result[0] ? result[0].replace(/\.$/, '') : null;
    } catch {
        return null;
    }
};

export class BlockingAuditService {
    async ensureReady() {
        await ensureBlockingReleaseSchema();
    }

    private async enrichHostnames(events: any[], hostnameFilter?: string) {
        const leases = parseDhcpLeases();
        const ips = Array.from(new Set(events.map((event) => event.client_ip).filter(Boolean)));
        const hostnames = new Map<string, string>();

        for (const ip of ips) {
            const leaseHostname = leases.get(ip);
            if (leaseHostname) {
                hostnames.set(ip, leaseHostname);
                continue;
            }
            const reverse = await reverseLookup(ip);
            hostnames.set(ip, reverse || UNKNOWN_HOSTNAME);
        }

        const identityByIp = identityEnrichmentService.loadLatestByIp();
        const enriched = events.map((event) => {
            const withIdentity = identityEnrichmentService.enrichRow(event, identityByIp);
            return {
                ...withIdentity,
                hostname: withIdentity.identity_computer || hostnames.get(event.client_ip) || UNKNOWN_HOSTNAME,
            };
        });

        if (!hostnameFilter) return enriched;
        const needle = normalizeText(hostnameFilter);
        return enriched.filter((event) => normalizeText(event.hostname).includes(needle));
    }

    private applyDuration(events: any[]) {
        const asc = [...events].sort((left, right) => {
            const leftKey = `${left.client_ip || ''}|${left.domain || ''}`;
            const rightKey = `${right.client_ip || ''}|${right.domain || ''}`;
            if (leftKey !== rightKey) return leftKey.localeCompare(rightKey);
            return new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
        });

        const nextByEventId = new Map<string, any>();
        for (let index = 0; index < asc.length; index += 1) {
            const current = asc[index];
            const next = asc[index + 1];
            if (!next || current.client_ip !== next.client_ip || current.domain !== next.domain) continue;
            const seconds = Math.round((new Date(next.timestamp).getTime() - new Date(current.timestamp).getTime()) / 1000);
            if (seconds > 0 && seconds <= 1800) {
                nextByEventId.set(`${current.source}:${current.id}`, {
                    duration_on_domain_seconds: seconds,
                    duration_on_domain: formatDuration(seconds),
                    duration_confidence: current.source === 'proxy' ? 'estimated' : 'estimated',
                    activity_window: `${formatDate(current.timestamp)} até ${formatDate(next.timestamp)}`,
                });
            }
        }

        return events.map((event) => ({
            ...event,
            ...(nextByEventId.get(`${event.source}:${event.id}`) || {
                duration_on_domain_seconds: null,
                duration_on_domain: 'indisponível',
                duration_confidence: 'unavailable',
                activity_window: 'sem janela suficiente',
            }),
        }));
    }

    private removeInternalDomains(events: any[]) {
        return events.filter((event) => !isInternalReportDomain(event.domain));
    }

    async listEvents(filters: AuditFilters = {}) {
        await this.ensureReady();
        const params: any[] = [];
        const clauses = [`(u.vlan_id IS NULL OR u.vlan_id IN (${MANAGED_VLAN_SQL_LIST}))`];
        const limit = Math.max(1, Math.min(Number(filters.limit || 300), 1000));

        if (filters.period && !filters.start_at && !filters.end_at) {
            clauses.push(`u.occurred_at >= NOW() - INTERVAL '${periodToInterval(String(filters.period))}'`);
        } else if (!filters.start_at && !filters.end_at) {
            clauses.push(`u.occurred_at >= NOW() - INTERVAL '24 hours'`);
        }
        if (filters.start_at) {
            params.push(String(filters.start_at));
            clauses.push(`u.occurred_at >= $${params.length}::timestamptz`);
        }
        if (filters.end_at) {
            params.push(String(filters.end_at));
            clauses.push(`u.occurred_at <= $${params.length}::timestamptz`);
        }
        if (filters.ip || filters.client_ip) {
            params.push(String(filters.ip || filters.client_ip));
            clauses.push(`u.client_ip = $${params.length}`);
        }
        if (filters.domain) {
            params.push(`%${normalizeText(filters.domain)}%`);
            clauses.push(`LOWER(u.domain) LIKE $${params.length}`);
        }
        if (filters.vlan || filters.vlan_id) {
            params.push(Number(filters.vlan || filters.vlan_id));
            clauses.push(`u.vlan_id = $${params.length}`);
        }
        if (filters.action) {
            params.push(String(filters.action));
            clauses.push(`u.action = $${params.length}`);
        }
        if (filters.category) {
            params.push(String(filters.category));
            clauses.push(`u.category = $${params.length}`);
        }
        if (filters.source) {
            params.push(String(filters.source));
            clauses.push(`u.source = $${params.length}`);
        }
        if (filters.policy_id) {
            params.push(Number(filters.policy_id));
            clauses.push(`dp.id = $${params.length}`);
        }
        if (filters.policy) {
            params.push(`%${normalizeText(filters.policy)}%`);
            clauses.push(`LOWER(COALESCE(dp.name, '')) LIKE $${params.length}`);
        }

        params.push(limit);
        const { rows } = await pool.query(
            `
                SELECT
                    u.source,
                    u.id,
                    u.occurred_at AS timestamp,
                    u.client_ip,
                    u.vlan_id,
                    u.vlan_label,
                    u.domain,
                    u.url_or_host,
                    u.action,
                    u.policy_source,
                    u.category,
                    u.rule_id,
                    u.matched_rule,
                    u.source_detail,
                    u.matched_policy_id,
                    u.matched_policy_name,
                    u.matched_policy_type,
                    u.matched_domain,
                    u.policy_label
                FROM unified_access_events u
                WHERE ${clauses.join(' AND ')}
                ORDER BY u.occurred_at DESC
                LIMIT $${params.length}
            `,
            params,
        );

        const enriched = await this.enrichHostnames(rows, filters.hostname);
        const withoutInternalDomains = this.removeInternalDomains(enriched);
        const withDurations = this.applyDuration(withoutInternalDomains);
        const events = withDurations.sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());

        const summary = {
            total: events.length,
            blocked: events.filter((event) => event.action === 'blocked').length,
            allowed: events.filter((event) => event.action === 'allowed').length,
            bypassed: events.filter((event) => event.action === 'bypassed').length,
            unique_ips: new Set(events.map((event) => event.client_ip).filter(Boolean)).size,
            unique_domains: new Set(events.map((event) => event.domain).filter(Boolean)).size,
        };

        return {
            generated_at: new Date().toISOString(),
            filters,
            summary,
            events,
        };
    }

    async getRealtimeRadar(filters: AuditFilters = {}) {
        await this.ensureReady();
        const params: any[] = [];
        const clauses = [`(u.vlan_id IS NULL OR u.vlan_id IN (${MANAGED_VLAN_SQL_LIST}))`];
        const windowMinutes = Math.max(1, Math.min(Number(filters.window_minutes || filters.windowMinutes || 10), 120));
        const limit = Math.max(1, Math.min(Number(filters.limit || 150), 500));

        clauses.push(`u.occurred_at >= NOW() - ($${params.length + 1} || ' minutes')::interval`);
        params.push(String(windowMinutes));

        if (filters.action && filters.action !== 'all') {
            params.push(String(filters.action));
            clauses.push(`u.action = $${params.length}`);
        }
        if (filters.source && filters.source !== 'all') {
            params.push(String(filters.source));
            clauses.push(`u.source = $${params.length}`);
        }
        if (filters.vlan || filters.vlan_id) {
            params.push(Number(filters.vlan || filters.vlan_id));
            clauses.push(`u.vlan_id = $${params.length}`);
        }
        if (filters.q || filters.search) {
            params.push(`%${normalizeText(filters.q || filters.search)}%`);
            clauses.push(`(
                LOWER(COALESCE(u.client_ip, '')) LIKE $${params.length}
                OR LOWER(COALESCE(u.domain, '')) LIKE $${params.length}
                OR LOWER(COALESCE(u.policy_label, '')) LIKE $${params.length}
            )`);
        }

        const ignoredPatterns = await dnsIgnoredService.loadActive().catch(() => []);
        const noiseFilter = dnsIgnoredService.buildSqlFilter(ignoredPatterns, 'u.domain');

        params.push(limit);
        const { rows } = await pool.query(
            `
                SELECT
                    u.source,
                    u.id,
                    u.event_uid,
                    u.occurred_at AS timestamp,
                    u.client_ip,
                    u.vlan_id,
                    u.vlan_label,
                    u.domain,
                    u.url_or_host,
                    u.action,
                    u.policy_source,
                    u.category,
                    u.source_detail,
                    u.matched_policy_id,
                    u.matched_policy_name,
                    u.matched_policy_type,
                    u.policy_label
                FROM unified_access_events u
                WHERE ${clauses.join(' AND ')}
                  ${noiseFilter}
                ORDER BY u.occurred_at DESC
                LIMIT $${params.length}
            `,
            params,
        );

        const enriched = await this.enrichHostnames(rows);
        const events = this.removeInternalDomains(enriched);
        const summary = {
            window_minutes: windowMinutes,
            total: events.length,
            dns: events.filter((event) => event.source === 'dns').length,
            proxy: events.filter((event) => event.source === 'proxy').length,
            blocked: events.filter((event) => event.action === 'blocked').length,
            allowed: events.filter((event) => event.action === 'allowed').length,
            bypassed: events.filter((event) => event.action === 'bypassed').length,
            unique_ips: new Set(events.map((event) => event.client_ip).filter(Boolean)).size,
            unique_domains: new Set(events.map((event) => event.domain).filter(Boolean)).size,
            last_seen_at: events[0]?.timestamp || null,
        };

        return {
            generated_at: new Date().toISOString(),
            realtime: true,
            filters: { ...filters, window_minutes: windowMinutes, limit },
            summary,
            events,
        };
    }

    private drawPdfHeader(doc: PDFKit.PDFDocument, title: string, subtitle: string) {
        doc.rect(0, 0, doc.page.width, 88).fill('#0f172a');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text(REPORT_ORG, 42, 20, { width: 430 });
        doc.fillColor('#cbd5e1').font('Helvetica').fontSize(9).text(REPORT_ENTITY, 42, 40);
        doc.fillColor('#cbd5e1').font('Helvetica').fontSize(9).text(REPORT_SYSTEM, 42, 54);
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(17).text(title, 42, 116);
        doc.fillColor('#475569').font('Helvetica').fontSize(10).text(subtitle, 42, 140, { width: 510 });
        doc.moveTo(42, 164).lineTo(553, 164).strokeColor('#e2e8f0').stroke();
    }

    private drawPdfFooter(doc: PDFKit.PDFDocument, page: number) {
        doc.moveTo(42, 760).lineTo(553, 760).strokeColor('#e2e8f0').stroke();
        doc.fillColor('#64748b').font('Helvetica').fontSize(8)
            .text(`Gerado em ${formatDate(new Date())}`, 42, 772)
            .text(`${REPORT_ORG} • ${REPORT_ENTITY}`, 180, 772, { width: 220, align: 'center' })
            .text(`Página ${page}`, 500, 772, { align: 'right', width: 53 });
    }

    async exportPdf(filters: AuditFilters = {}) {
        const data = await this.listEvents({ ...filters, limit: filters.limit || 600 });
        const title = filters.domain
            ? `Relatório governamental de acessos por domínio: ${filters.domain}`
            : filters.ip || filters.client_ip
                ? `Relatório governamental de acessos por IP: ${filters.ip || filters.client_ip}`
                : 'Relatório governamental de acessos';

        return new Promise<Buffer>((resolve, reject) => {
            const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
            const chunks: Buffer[] = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            let page = 1;
            this.drawPdfHeader(doc, title, 'Documento institucional para evidenciar acessos observados, decisão aplicada, política correspondente e trilha operacional consolidada.');

            doc.fillColor('#334155').font('Helvetica-Bold').fontSize(11).text('Resumo executivo', 42, 184);
            const stats = [
                ['Eventos', data.summary.total],
                ['Bloqueados', data.summary.blocked],
                ['Liberados', data.summary.allowed],
                ['Bypass', data.summary.bypassed],
                ['IPs únicos', data.summary.unique_ips],
                ['Domínios únicos', data.summary.unique_domains],
            ];
            let x = 42;
            let y = 208;
            for (const [label, value] of stats) {
                doc.roundedRect(x, y, 76, 48, 6).fillAndStroke('#f8fafc', '#e2e8f0');
                doc.fillColor('#64748b').font('Helvetica').fontSize(7).text(String(label).toUpperCase(), x + 8, y + 9, { width: 60 });
                doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14).text(String(value), x + 8, y + 25, { width: 60 });
                x += 85;
            }

            y = 284;
            doc.fillColor('#334155').font('Helvetica-Bold').fontSize(11).text('Filtros aplicados', 42, y);
            y += 18;
            const filterText = Object.entries(filters)
                .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
                .map(([key, value]) => `${key}: ${value}`)
                .join('  |  ') || 'period: 24h';
            doc.fillColor('#475569').font('Helvetica').fontSize(9).text(filterText, 42, y, { width: 510 });

            y += 36;
            doc.fillColor('#334155').font('Helvetica-Bold').fontSize(11).text('Destinatário institucional', 42, y);
            y += 18;
            doc.fillColor('#475569').font('Helvetica').fontSize(9).text(`${REPORT_ORG} • ${REPORT_ENTITY}`, 42, y, { width: 510 });
            y += 28;

            const columns = [
                { label: 'Data/Hora', width: 82 },
                { label: 'IP / Hostname', width: 104 },
                { label: 'Domínio', width: 122 },
                { label: 'Ação', width: 62 },
                { label: 'Política', width: 88 },
                { label: 'Tempo', width: 52 },
            ];
            const drawTableHeader = () => {
                let colX = 42;
                doc.roundedRect(42, y, 511, 22, 4).fill('#e2e8f0');
                for (const column of columns) {
                    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7).text(column.label, colX + 4, y + 7, { width: column.width - 8 });
                    colX += column.width;
                }
                y += 26;
            };

            doc.fillColor('#334155').font('Helvetica-Bold').fontSize(11).text('Eventos', 42, y);
            y += 18;
            drawTableHeader();

            for (const event of data.events) {
                if (y > 730) {
                    this.drawPdfFooter(doc, page);
                    doc.addPage();
                    page += 1;
                    this.drawPdfHeader(doc, title, 'Continuação dos eventos filtrados.');
                    y = 184;
                    drawTableHeader();
                }
                const rowHeight = 38;
                doc.rect(42, y, 511, rowHeight).fillAndStroke('#ffffff', '#e2e8f0');
                let colX = 42;
                const values = [
                    formatDate(event.timestamp),
                    `${event.client_ip || '-'}\n${event.hostname || UNKNOWN_HOSTNAME}`,
                    event.domain || '-',
                    actionLabel(event.action),
                    event.policy_label || '-',
                    event.duration_on_domain || 'indisponível',
                ];
                values.forEach((value, index) => {
                    doc.fillColor(index === 3 && event.action === 'blocked' ? '#b91c1c' : '#334155')
                        .font(index === 3 ? 'Helvetica-Bold' : 'Helvetica')
                        .fontSize(7)
                        .text(String(value), colX + 4, y + 7, { width: columns[index].width - 8, height: rowHeight - 8 });
                    colX += columns[index].width;
                });
                y += rowHeight;
            }

            this.drawPdfFooter(doc, page);
            doc.end();
        });
    }
}

export const blockingAuditService = new BlockingAuditService();
