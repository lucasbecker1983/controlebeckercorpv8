import { spawn } from 'child_process';

type RunOptions = {
    cwd?: string;
    input?: string;
    elevated?: boolean;
    allowFailure?: boolean;
};

type RunResult = {
    stdout: string;
    stderr: string;
    code: number;
};

const elevatedCommandPaths: Record<string, string> = {
    ufw: '/usr/sbin/ufw',
};

const withPrivilege = (command: string, args: string[], elevated?: boolean) => {
    if (!elevated) return { command, args };
    const resolvedCommand = elevatedCommandPaths[command] || command;
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
        return {
            command: resolvedCommand,
            args,
        };
    }
    return {
        command: 'sudo',
        args: ['-n', resolvedCommand, ...args],
    };
};

export const runCommand = async (
    command: string,
    args: string[] = [],
    options: RunOptions = {},
): Promise<RunResult> => {
    const target = withPrivilege(command, args, options.elevated);

    return new Promise((resolve, reject) => {
        const child = spawn(target.command, target.args, {
            cwd: options.cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });

        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        child.on('error', reject);

        child.on('close', (code) => {
            const result = {
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                code: code ?? 0,
            };

            if ((code ?? 0) !== 0 && !options.allowFailure) {
                const error = new Error(result.stderr || result.stdout || `Command failed: ${command}`);
                Object.assign(error, result);
                reject(error);
                return;
            }

            resolve(result);
        });

        if (options.input) {
            child.stdin.write(options.input);
        }
        child.stdin.end();
    });
};
