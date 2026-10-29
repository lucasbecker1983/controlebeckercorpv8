import { runCommand } from '../utils/process';

/*
 * Resultado do `unbound-checkconf` com cache.
 *
 * Com a lista de segurança (618 mil entradas) o checkconf leva de 3 a 4 s e as telas de status o
 * chamavam várias vezes por pedido (health, status, overview e contingência = 7,7 s).
 * Regras:
 *  - até FRESH_MS (60 s) devolve o resultado guardado;
 *  - entre 60 s e STALE_MS (10 min) devolve o guardado na hora e renova em segundo plano;
 *  - mais velho que isso, ou depois de invalidate(), espera uma execução nova;
 *  - chamadas simultâneas dividem a mesma execução.
 * Quem aplica regras (compile/apply) deve chamar invalidateUnboundCheckconf().
 */

type CheckResult = Awaited<ReturnType<typeof runCommand>>;

const FRESH_MS = 60_000;
const STALE_MS = 10 * 60_000;

let cached: { at: number; result: CheckResult } | null = null;
let inflight: Promise<CheckResult> | null = null;
let generation = 0;

const run = (): Promise<CheckResult> => {
    if (!inflight) {
        const startedIn = generation;
        inflight = runCommand('unbound-checkconf', [], { elevated: true, allowFailure: true })
            .then((result) => {
                // Se houve invalidação durante a execução, o resultado já nasceu velho: não guarda.
                if (startedIn === generation) cached = { at: Date.now(), result };
                return result;
            })
            .finally(() => { inflight = null; });
    }
    return inflight;
};

export const invalidateUnboundCheckconf = () => {
    generation += 1;
    cached = null;
};

export const cachedUnboundCheckconf = async (): Promise<CheckResult> => {
    if (cached) {
        const age = Date.now() - cached.at;
        if (age < FRESH_MS) return cached.result;
        if (age < STALE_MS) {
            run().catch(() => undefined);
            return cached.result;
        }
    }
    return run();
};

// Aquece o cache logo depois da inicialização, para a primeira tela não esperar.
setTimeout(() => { run().catch(() => undefined); }, 15_000).unref();
