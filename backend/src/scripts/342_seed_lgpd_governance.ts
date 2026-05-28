import 'dotenv/config';
import { pool } from '../config/db';
import { lgpdService } from '../modules/lgpd/lgpd-service';

const actor = {
    username: 'seed.lgpd.governance',
    userId: null,
    ipAddress: '127.0.0.1',
    userAgent: 'SGCG LGPD governance seed',
};

const daysFromNow = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
};

const daysAgoIso = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
};

const processingActivities = [
    {
        process_name: 'Acesso ao Console SGCG',
        purpose: 'Autenticar operadores autorizados e registrar autoria das decisões administrativas e técnicas.',
        legal_basis: 'Cumprimento de obrigação legal, execução de política pública e segurança da informação.',
        controller_name: 'Prefeitura Municipal de Jacarezinho/PR',
        operator_name: 'JMB Tecnologia',
        data_categories: ['nome', 'usuario', 'perfil de acesso', 'IP', 'data e hora de acesso', 'trilha de auditoria'],
        data_subject_categories: ['servidores públicos', 'operadores autorizados', 'gestores institucionais'],
        shared_with: ['JMB Tecnologia quando necessário para suporte técnico'],
        storage_location: 'Banco institucional do SGCG em ambiente controlado',
        retention_period: 'Enquanto necessário para auditoria, segurança e prestação de contas',
        security_measures: 'Autenticação, controle de sessão, trilha de auditoria, segregação de perfis e logs imutáveis',
        international_transfer: false,
        risk_level: 'medio',
        status: 'aprovado',
    },
    {
        process_name: 'Hotspot Institucional de Visitantes',
        purpose: 'Identificar visitantes para liberação temporária de internet, segurança da rede e responsabilização institucional.',
        legal_basis: 'Execução de política pública, segurança da informação e cumprimento de obrigação legal.',
        controller_name: 'Prefeitura Municipal de Jacarezinho/PR',
        operator_name: 'JMB Tecnologia',
        data_categories: ['nome', 'CPF', 'telefone celular', 'MAC do dispositivo', 'IP', 'VLAN', 'sessão de acesso'],
        data_subject_categories: ['visitantes', 'cidadãos atendidos', 'prestadores em atendimento temporário'],
        shared_with: ['JMB Tecnologia para sustentação técnica', 'autoridades competentes mediante solicitação formal'],
        storage_location: 'Banco SGCG e logs técnicos do gateway',
        retention_period: 'Pelo período necessário à segurança da rede e auditoria institucional',
        security_measures: 'Portal cativo, autenticação, expiração de sessão, ipset runtime, logs auditáveis e limitação por finalidade',
        international_transfer: false,
        risk_level: 'alto',
        status: 'aprovado',
    },
    {
        process_name: 'Acesso Mobile de Colaboradores',
        purpose: 'Controlar acesso de dispositivos pessoais de colaboradores à rede institucional com autenticação e auditoria.',
        legal_basis: 'Execução de política pública, legítimo interesse público e segurança da informação.',
        controller_name: 'Prefeitura Municipal de Jacarezinho/PR',
        operator_name: 'JMB Tecnologia',
        data_categories: ['nome', 'CPF', 'setor', 'usuário', 'IP', 'MAC', 'sessão', 'ciência LGPD'],
        data_subject_categories: ['servidores públicos', 'colaboradores autorizados'],
        shared_with: ['JMB Tecnologia para suporte e investigação técnica autorizada'],
        storage_location: 'Banco SGCG e logs de acesso vinculados à VLAN 30',
        retention_period: 'Enquanto persistir necessidade administrativa, operacional e de auditoria',
        security_measures: 'Login individual, aceite LGPD, correlação IP/MAC, trilha de auditoria e revogação de sessão',
        international_transfer: false,
        risk_level: 'alto',
        status: 'aprovado',
    },
    {
        process_name: 'Relatórios Forenses de Navegação',
        purpose: 'Consolidar evidências técnicas de DNS, proxy e firewall para investigação, auditoria e prestação de contas.',
        legal_basis: 'Cumprimento de obrigação legal, segurança da informação e exercício regular de direitos em processo administrativo.',
        controller_name: 'Prefeitura Municipal de Jacarezinho/PR',
        operator_name: 'JMB Tecnologia',
        data_categories: ['IP', 'VLAN', 'MAC quando disponível', 'usuário correlacionado', 'domínio', 'URL técnica', 'ação', 'data e hora'],
        data_subject_categories: ['usuários da rede institucional', 'visitantes autenticados', 'colaboradores'],
        shared_with: ['gestores autorizados', 'controle interno', 'autoridades competentes mediante requisição'],
        storage_location: 'Tabelas de auditoria e eventos de navegação do SGCG',
        retention_period: 'Conforme necessidade de segurança, auditoria e prova institucional',
        security_measures: 'Imutabilidade de logs, filtros por perfil, trilha de acesso e geração controlada de relatórios',
        international_transfer: false,
        risk_level: 'critico',
        status: 'aprovado',
    },
    {
        process_name: 'Central de Chamados Institucional',
        purpose: 'Registrar solicitações de suporte, acompanhar atendimento e preservar histórico operacional.',
        legal_basis: 'Execução de política pública e atendimento de demanda administrativa.',
        controller_name: 'Prefeitura Municipal de Jacarezinho/PR',
        operator_name: 'JMB Tecnologia',
        data_categories: ['nome', 'usuário', 'setor', 'descrição do chamado', 'prioridade', 'histórico de atendimento'],
        data_subject_categories: ['colaboradores', 'operadores', 'gestores solicitantes'],
        shared_with: ['equipe técnica autorizada', 'gestores responsáveis pelo atendimento'],
        storage_location: 'Banco SGCG',
        retention_period: 'Enquanto necessário para acompanhamento, melhoria do serviço e auditoria',
        security_measures: 'Autenticação, segregação por perfil, histórico de atualização e auditoria de ações',
        international_transfer: false,
        risk_level: 'medio',
        status: 'aprovado',
    },
    {
        process_name: 'Gestão de Usuários e Perfis',
        purpose: 'Administrar usuários, permissões, responsabilidades e acessos ao sistema.',
        legal_basis: 'Execução de política pública, cumprimento de obrigação legal e segurança da informação.',
        controller_name: 'Prefeitura Municipal de Jacarezinho/PR',
        operator_name: 'JMB Tecnologia',
        data_categories: ['nome', 'usuário', 'e-mail', 'perfil', 'status de acesso', 'histórico administrativo'],
        data_subject_categories: ['operadores autorizados', 'gestores', 'equipe técnica'],
        shared_with: ['gestores autorizados', 'JMB Tecnologia para suporte técnico'],
        storage_location: 'Banco SGCG',
        retention_period: 'Enquanto houver vínculo operacional e pelo prazo necessário à auditoria',
        security_measures: 'Controle de perfil, autenticação, revogação de acesso e logs administrativos',
        international_transfer: false,
        risk_level: 'alto',
        status: 'aprovado',
    },
    {
        process_name: 'Observabilidade DNS, Proxy e Firewall',
        purpose: 'Monitorar saúde da rede, detectar bloqueios, investigar incidentes e comprovar enforcement institucional.',
        legal_basis: 'Segurança da informação, execução de política pública e cumprimento de obrigação legal.',
        controller_name: 'Prefeitura Municipal de Jacarezinho/PR',
        operator_name: 'JMB Tecnologia',
        data_categories: ['IP', 'VLAN', 'domínio consultado', 'URL técnica', 'status', 'ação', 'data e hora'],
        data_subject_categories: ['usuários da rede institucional', 'visitantes', 'colaboradores'],
        shared_with: ['equipe técnica autorizada', 'controle interno quando necessário'],
        storage_location: 'Logs técnicos, Unbound, Squid, UFW e tabelas de eventos SGCG',
        retention_period: 'Enquanto necessário para segurança, auditoria e resolução de incidentes',
        security_measures: 'Coleta controlada, finalidade institucional, acesso restrito e trilhas de auditoria',
        international_transfer: false,
        risk_level: 'critico',
        status: 'aprovado',
    },
    {
        process_name: 'Backups e Continuidade Operacional',
        purpose: 'Preservar disponibilidade, recuperação e continuidade dos serviços essenciais do SGCG.',
        legal_basis: 'Cumprimento de obrigação legal, segurança da informação e continuidade do serviço público.',
        controller_name: 'Prefeitura Municipal de Jacarezinho/PR',
        operator_name: 'JMB Tecnologia',
        data_categories: ['metadados de backup', 'logs de execução', 'responsável por operação', 'evidências de sucesso ou falha'],
        data_subject_categories: ['operadores autorizados', 'gestores responsáveis'],
        shared_with: ['equipe técnica autorizada'],
        storage_location: 'Armazenamento institucional de backup e registros de operação',
        retention_period: 'Conforme política de continuidade e necessidade de restauração',
        security_measures: 'Controle de acesso, registro de execução, segregação de responsabilidades e verificação periódica',
        international_transfer: false,
        risk_level: 'medio',
        status: 'aprovado',
    },
];

const requests = [
    {
        requester_name: 'Joao Carlos da Silva',
        requester_email: 'joao.silva@example.invalid',
        requester_document: '***.***.***-11',
        request_type: 'acesso',
        status: 'em-analise',
        due_date: daysFromNow(10),
        response_summary: 'Solicitação recebida para levantamento dos registros vinculados ao acesso institucional.',
        notes: 'Exemplo institucional para demonstrar o fluxo de atendimento a pedido de acesso.',
    },
    {
        requester_name: 'Maria Aparecida Souza',
        requester_email: 'maria.souza@example.invalid',
        requester_document: '***.***.***-22',
        request_type: 'correcao',
        status: 'recebido',
        due_date: daysFromNow(12),
        response_summary: 'Pedido de correção cadastral recebido e aguardando validação da unidade responsável.',
        notes: 'Usar como modelo para pedidos de atualização de dados.',
    },
    {
        requester_name: 'Servidor Municipal - Secretaria de Administracao',
        requester_email: 'administracao@example.invalid',
        requester_document: '',
        request_type: 'confirmacao',
        status: 'atendido',
        due_date: daysFromNow(-2),
        response_summary: 'Confirmação de tratamento respondida com indicação das finalidades institucionais.',
        notes: 'Registro modelo de pedido concluído.',
    },
    {
        requester_name: 'Colaborador de Unidade Operacional',
        requester_email: 'colaborador@example.invalid',
        requester_document: '',
        request_type: 'informacao-compartilhamento',
        status: 'em-analise',
        due_date: daysFromNow(8),
        response_summary: 'Solicitada informação sobre compartilhamento técnico de logs com equipe de sustentação.',
        notes: 'Resposta deve indicar acesso restrito e finalidade de suporte/auditoria.',
    },
];

const incidents = [
    {
        title: 'Tentativas de login administrativo recusadas',
        severity: 'medio',
        status: 'contido',
        occurred_at: daysAgoIso(6),
        reported_at: daysAgoIso(6),
        affected_data: ['usuario', 'IP de origem', 'data e hora', 'resultado da autenticacao'],
        affected_subjects_estimate: 1,
        authority_notified: false,
        summary: 'Tentativas inválidas de autenticação foram registradas e bloqueadas. Não houve confirmação de acesso indevido.',
        containment_actions: 'Validação de logs, manutenção da sessão protegida e acompanhamento pela auditoria de acesso.',
        notes: 'Incidente operacional controlado para demonstrar fluxo de registro.',
    },
    {
        title: 'Revisao de relatorio com dados tecnicos de navegacao',
        severity: 'alto',
        status: 'investigacao',
        occurred_at: daysAgoIso(3),
        reported_at: daysAgoIso(3),
        affected_data: ['IP', 'VLAN', 'dominio consultado', 'horario do evento'],
        affected_subjects_estimate: 5,
        authority_notified: false,
        summary: 'Relatório técnico foi sinalizado para revisão antes de compartilhamento administrativo.',
        containment_actions: 'Compartilhamento suspenso até revisão de necessidade, finalidade e destinatários autorizados.',
        notes: 'Modelo de incidente que exige decisão gestora sobre comunicação formal.',
    },
    {
        title: 'Correção de cadastro de visitante no Hotspot',
        severity: 'baixo',
        status: 'encerrado',
        occurred_at: daysAgoIso(10),
        reported_at: daysAgoIso(10),
        affected_data: ['nome', 'telefone celular', 'CPF mascarado'],
        affected_subjects_estimate: 1,
        authority_notified: false,
        authority_notified_at: '',
        summary: 'Dado cadastral de visitante foi corrigido no fluxo administrativo sem exposição externa.',
        containment_actions: 'Registro revisado, histórico preservado e procedimento encerrado.',
        notes: 'Exemplo de ocorrência simples encerrada.',
    },
];

async function findId(table: string, whereSql: string, params: unknown[]) {
    const { rows } = await pool.query(`SELECT id FROM ${table} WHERE ${whereSql} ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST LIMIT 1`, params);
    return rows[0]?.id ? Number(rows[0].id) : undefined;
}

async function main() {
    await lgpdService.ensureSchema();

    const program = await lgpdService.upsertProgramSettings({
        controller_name: 'Prefeitura Municipal de Jacarezinho/PR',
        controller_unit: 'Governanca de Dados e Controle Institucional',
        controller_email: 'lgpd@jacarezinho.pr.gov.br',
        dpo_name: 'Encarregado de Protecao de Dados - Prefeitura de Jacarezinho',
        dpo_email: 'lgpd@jacarezinho.pr.gov.br',
        dpo_phone: '(43) 0000-0000',
        data_subject_channel: 'Ouvidoria municipal e canal institucional LGPD',
        privacy_notice_url: '/aviso-de-privacidade',
        review_frequency_days: 180,
        last_review_at: new Date().toISOString().slice(0, 10),
        notes: 'Estrutura inicial de governanca de dados pessoais cadastrada pelo SGCG.',
    }, actor);

    for (const item of processingActivities) {
        const id = await findId('lgpd_processing_activities', 'process_name = $1', [item.process_name]);
        await lgpdService.upsertProcessingActivity(item, actor, id);
    }

    for (const item of requests) {
        const id = await findId(
            'lgpd_data_subject_requests',
            'requester_name = $1 AND request_type = $2',
            [item.requester_name, item.request_type],
        );
        await lgpdService.upsertRequest(item, actor, id);
    }

    for (const item of incidents) {
        const id = await findId('lgpd_incidents', 'title = $1', [item.title]);
        await lgpdService.upsertIncident(item, actor, id);
    }

    const [{ rows: processing }, { rows: reqRows }, { rows: incidentRows }, { rows: auditRows }] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS count FROM lgpd_processing_activities`),
        pool.query(`SELECT COUNT(*)::int AS count FROM lgpd_data_subject_requests`),
        pool.query(`SELECT COUNT(*)::int AS count FROM lgpd_incidents`),
        pool.query(`SELECT COUNT(*)::int AS count FROM lgpd_audit_logs`),
    ]);

    console.log(JSON.stringify({
        ok: true,
        program: program?.controller_name,
        processing: processing[0]?.count || 0,
        requests: reqRows[0]?.count || 0,
        incidents: incidentRows[0]?.count || 0,
        audit: auditRows[0]?.count || 0,
    }, null, 2));
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
