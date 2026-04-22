import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';
import { env } from '../config/env';
import { runCommand } from '../utils/process';
import { ensureProxySchema } from './proxy-schema-service';

type CertificateMeta = {
    id: number;
    name: string;
    file_path: string;
    key_path: string;
    fingerprint: string;
    valid_from: string;
    valid_until: string;
    active: boolean;
    created_at: string;
};

const parseOpenSslDate = (value: string) => {
    const parsed = new Date(value.trim());
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Data inválida retornada pelo OpenSSL: ${value}`);
    }
    return parsed.toISOString();
};

export class CertificateService {
    readonly certificatesDir = path.join(env.proxyStateDir, 'certificates');
    readonly currentDir = path.join(this.certificatesDir, 'current');

    async ensureActiveCertificate() {
        await ensureProxySchema();
        fs.mkdirSync(this.certificatesDir, { recursive: true });
        fs.mkdirSync(this.currentDir, { recursive: true });

        const active = await this.getActiveCertificate();
        if (active && fs.existsSync(active.file_path) && fs.existsSync(active.key_path)) return active;
        return this.regenerate('system');
    }

    async getActiveCertificate() {
        await ensureProxySchema();
        const { rows } = await pool.query(
            `
                SELECT id, name, file_path, key_path, fingerprint, valid_from, valid_until, active, created_at
                FROM proxy_certificates
                WHERE active = TRUE
                ORDER BY created_at DESC
                LIMIT 1
            `,
        );
        return (rows[0] || null) as CertificateMeta | null;
    }

    async regenerate(requestedBy = 'system') {
        await ensureProxySchema();
        fs.mkdirSync(this.certificatesDir, { recursive: true });
        fs.mkdirSync(this.currentDir, { recursive: true });

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const dir = path.join(this.certificatesDir, `proxy-ca-${stamp}`);
        fs.mkdirSync(dir, { recursive: true });

        const keyPath = path.join(dir, 'proxy-ca.key.pem');
        const certPath = path.join(dir, 'proxy-ca.crt.pem');
        const derPath = path.join(dir, 'proxy-ca.der');
        const currentKeyPath = path.join(this.currentDir, 'proxy-ca.key.pem');
        const currentPemPath = path.join(this.currentDir, 'proxy-ca.crt.pem');
        const currentDerPath = path.join(this.currentDir, 'proxy-ca.der');
        const subject = `/C=BR/O=Becker Corp/OU=Controle Becker Corp - V8/CN=Becker Proxy CA ${stamp}`;

        try {
            await runCommand('openssl', ['genrsa', '-out', keyPath, '4096']);
            await runCommand('openssl', ['req', '-x509', '-new', '-nodes', '-key', keyPath, '-sha256', '-days', '825', '-out', certPath, '-subj', subject]);
            await runCommand('openssl', ['x509', '-in', certPath, '-outform', 'der', '-out', derPath]);
        } catch (error: any) {
            throw new Error(`Falha ao gerar CA do proxy com OpenSSL: ${error.message || error}`);
        }

        fs.chmodSync(dir, 0o700);
        fs.chmodSync(keyPath, 0o600);
        fs.chmodSync(certPath, 0o644);
        fs.chmodSync(derPath, 0o644);

        fs.copyFileSync(keyPath, currentKeyPath);
        fs.copyFileSync(certPath, currentPemPath);
        fs.copyFileSync(derPath, currentDerPath);
        fs.mkdirSync(path.dirname(env.certFile), { recursive: true });
        fs.copyFileSync(derPath, env.certFile);
        fs.chmodSync(currentKeyPath, 0o600);
        fs.chmodSync(currentPemPath, 0o644);
        fs.chmodSync(currentDerPath, 0o644);
        fs.chmodSync(env.certFile, 0o644);

        const fpResult = await runCommand('openssl', ['x509', '-in', certPath, '-noout', '-fingerprint', '-sha256']);
        const datesResult = await runCommand('openssl', ['x509', '-in', certPath, '-noout', '-dates']);

        const fingerprint = fpResult.stdout.split('=').pop()?.trim() || '';
        const [notBefore, notAfter] = datesResult.stdout.split('\n');
        const validFrom = parseOpenSslDate((notBefore || '').replace('notBefore=', ''));
        const validUntil = parseOpenSslDate((notAfter || '').replace('notAfter=', ''));

        await pool.query(`UPDATE proxy_certificates SET active = FALSE WHERE active = TRUE`);
        const { rows } = await pool.query(
            `
                INSERT INTO proxy_certificates (name, file_path, key_path, fingerprint, valid_from, valid_until, active)
                VALUES ($1, $2, $3, $4, $5, $6, TRUE)
                RETURNING id, name, file_path, key_path, fingerprint, valid_from, valid_until, active, created_at
            `,
            [`Becker Proxy CA ${stamp}`, currentDerPath, currentKeyPath, fingerprint, validFrom, validUntil],
        );

        await pool.query(
            `
                UPDATE proxy_engine_state
                SET last_action = $1,
                    last_action_by = $2,
                    updated_at = NOW()
                WHERE id = 1
            `,
            ['certificate:regenerate', requestedBy],
        );

        return rows[0] as CertificateMeta;
    }
}
