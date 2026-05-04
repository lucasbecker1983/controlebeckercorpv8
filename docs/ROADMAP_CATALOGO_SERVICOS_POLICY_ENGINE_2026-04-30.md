# Roadmap — Catálogo de Serviços e Policy Engine SGCG

Data: 2026-04-30

## Objetivo

Evoluir o SGCG de um conjunto de regras técnicas para uma plataforma de governança operacional baseada em serviços digitais.

A proposta é criar uma camada declarativa em que o operador define a intenção institucional, e o sistema diagnostica, simula e futuramente compila essa intenção para DNS/RPZ, Squid, UFW, iptables/ipset, QoS, auditoria e relatórios.

## Problema que motivou a ideia

O caso do WhatsApp mostrou uma limitação importante:

- a política por FQDN estava correta;
- o DNS/RPZ permitia WhatsApp;
- o bloqueio por range de IP da Meta era necessário para Facebook/Instagram;
- mas WhatsApp compartilha infraestrutura com a Meta e passou a depender de exceções dinâmicas por IP, mídia e portas de chamada.

Ou seja: o SGCG precisa enxergar "serviço digital" e não apenas domínio, IP, porta ou regra isolada.

## Princípio de implementação

Implementar com menor impacto possível:

1. criar leitura e diagnóstico sem aplicar mudanças;
2. simular antes de alterar runtime;
3. aplicar somente em escopos pequenos e validados;
4. manter UFW como firewall oficial;
5. não substituir Unbound, Squid, iptables/ipset ou compilador atual no primeiro momento;
6. preservar auditoria, rastreabilidade e rollback.

## Fase 1 — Catálogo somente-leitura

Criar um módulo/tabela de serviços digitais sem alterar runtime.

Serviços iniciais recomendados:

- WhatsApp completo
- WhatsApp Web
- Redes sociais bloqueadas
- Ponto RH / OpenDNS
- gov.br
- DoH resolvers

Campos sugeridos:

- nome do serviço
- categoria
- criticidade
- fundamento institucional
- domínios/FQDNs
- portas necessárias
- ipsets relacionados
- VLANs permitidas/bloqueadas
- dependências conhecidas
- política atual inferida

Impacto esperado: baixo. A primeira entrega apenas organiza conhecimento hoje espalhado em scripts, listas, CODEX.md, RPZ, ipset e UFW.

## Fase 2 — Diagnóstico por serviço

Criar uma visão "Saúde dos Serviços".

Para cada serviço, diagnosticar:

- DNS resolve?
- está em RPZ?
- está em allowlist?
- está em blocklist?
- IP resolvido cai em range bloqueado?
- existe ACCEPT antes do DROP?
- portas essenciais estão bloqueadas?
- há conflito entre política e runtime?
- há divergência entre política institucional e aplicação técnica?

Exemplo de alerta esperado:

```text
WhatsApp: permitido por FQDN, mas IPs de mídia resolvidos caem em sgcg_social_blocked.
Impacto provável: WhatsApp Web abre, mas mídia ou chamadas podem falhar.
```

## Fase 3 — Simulador de política

Adicionar simulação antes de aplicar.

Exemplo de intenção:

```yaml
servico: WhatsApp
estado: permitido
escopo:
  vlans: [10, 30, 50, 70]
funcionalidades:
  texto: permitido
  web: permitido
  midia: permitido
  voz: permitido
  video: permitido
fundamento: Comunicação operacional institucional
risco: medio
```

A simulação deve exibir:

- domínios afetados;
- IPs resolvidos;
- ipsets impactados;
- portas necessárias;
- regras que seriam criadas;
- conflitos previstos;
- risco operacional;
- plano de rollback;
- evidências de validação necessárias.

## Fase 4 — Aplicador controlado

Somente após validação da fase 3.

Requisitos obrigatórios:

- backup antes de alterar;
- diff operacional;
- aplicação em ordem segura;
- validação automática;
- rollback em falha;
- registro em auditoria;
- registro no CODEX.md;
- execução limitada por serviço e VLAN.

Escopo inicial sugerido:

1. WhatsApp completo
2. Redes sociais bloqueadas
3. Ponto RH / OpenDNS

## Fase 5 — Expansão gradual

Após validar o escopo inicial:

- gov.br
- bancos
- sistemas municipais
- IA generativa
- streaming
- mensageria
- serviços de backup
- serviços críticos de fornecedores

## Arquitetura mínima sugerida

Tabelas:

```text
service_catalog
service_domains
service_ports
service_runtime_checks
service_policy_bindings
service_policy_simulations
```

Serviços backend sugeridos:

```text
backend-proxy/src/services/service-catalog-service.ts
backend-proxy/src/services/service-diagnostics-service.ts
backend-proxy/src/services/service-policy-simulator.ts
backend-proxy/src/services/service-policy-applier.ts
```

Frontend sugerido:

```text
frontend/src/pages/ServiceCatalog.jsx
frontend/src/components/ServiceHealthPanel.jsx
frontend/src/components/PolicySimulationDrawer.jsx
```

## UX recomendada

Evitar uma tela técnica centrada em regras.

A UI deve responder perguntas operacionais:

- Este serviço está funcionando?
- Está permitido ou bloqueado por decisão institucional?
- Qual camada está aplicando a decisão?
- Existe conflito?
- Qual impacto se eu alterar?
- Como valido?
- Como desfaço?

Estados recomendados:

- Operacional
- Parcial
- Bloqueado por política
- Quebrado por conflito
- Sem evidência suficiente
- Em simulação

## Critérios para retomar

Retomar este roadmap quando houver disponibilidade para validar em ambiente real.

Antes de implementar:

- escolher uma VLAN de teste;
- escolher um dispositivo cliente;
- validar WhatsApp texto, web, mídia, voz e vídeo;
- validar que Instagram/Facebook/TikTok continuam bloqueados;
- garantir janela operacional para rollback;
- evitar mexer em sexta-feira/fim de expediente sem equipe presente.

## Próxima ação recomendada

Quando a implementação for retomada, começar pela Fase 1 e Fase 2:

1. criar catálogo somente-leitura;
2. popular manualmente WhatsApp, redes sociais e Ponto RH;
3. criar diagnóstico de conflito política/runtime;
4. não aplicar nenhuma regra automaticamente na primeira entrega.
