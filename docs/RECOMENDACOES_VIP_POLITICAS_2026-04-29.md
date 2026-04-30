# Recomendações Técnicas - VIP e Políticas & Escopos

Data: 2026-04-29

## Recomendações Prioritárias

1. Criar `GET /api/bloqueios-liberacoes/exceptions/:id` para inspeção individual de VIP/exceção. Hoje o frontend lista por `GET /exceptions`, mas auditoria e suporte ficam melhores com rota direta.

2. Remover a dependência obrigatória de `ufw` em todos os caminhos de runtime. O ambiente atual usa `iptables`/`nftables` e não possui o binário `ufw`, então qualquer `sudo -n ufw reload` deve ter fallback seguro.

3. Separar persistência de política e aplicação de runtime em respostas mais explícitas. Quando uma política salva no banco, mas a aplicação de firewall/DNS falha, a API deve informar `persisted=true` e `runtime_applied=false`, sem mascarar a causa.

4. Padronizar DTOs de frontend para VIP e Políticas & Escopos. O frontend não deve reenviar registros inteiros do banco com `created_at`, `updated_at`, `revoked_at`, `id` e campos derivados.

5. Criar validação explícita de duplicidade também para políticas nomeadas. O domínio/URL não deve ficar duplicado de forma conflitante no mesmo escopo, especialmente em regras `allow` e `block` concorrentes.

6. Sanear dados legados: existem VIPs ativos com `lifecycle_status='revoked'`. Recomenda-se rotina administrativa para alinhar `active`, `revoked_at`, `revoked_by` e `lifecycle_status`.

7. Persistir evidências de aplicação de runtime. Cada `apply` deveria registrar paths gerados, hashes de ACL/RPZ, status do Unbound/Squid e resumo das regras de firewall efetivamente aplicadas.

8. Expor saúde do motor por camada no frontend: Banco, ACL Squid, RPZ Unbound, firewall runtime e interceptação seletiva. Isso ajuda o operador a diferenciar erro de cadastro de erro de infraestrutura.

9. Adicionar testes automatizados de API para `domain-policies` e `exceptions`, cobrindo criar, editar, alternar status, duplicidade, payload parcial, IP/VLAN inválidos e aplicação sem `ufw`.

10. Documentar o contrato de bypass total VIP: banco `policy_exceptions`, sincronização em `dns_vip` e `proxy_vips`, ACL `proxy_ip_bypass.acl`, RPZ `vip-bypass.conf` e regra firewall `ACCEPT` antes dos bloqueios.

## Resultado Esperado

O operador deve conseguir editar VIPs e políticas sem erro de frontend, com aplicação imediata em ACL/RPZ/firewall quando a infraestrutura estiver disponível, e com mensagens técnicas claras quando alguma camada do runtime estiver degradada.
