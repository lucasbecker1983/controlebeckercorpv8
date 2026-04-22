import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { runCommand } from '../utils/process';

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
}
