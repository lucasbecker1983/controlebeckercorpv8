# Frontend Rebrand SGCG - Estado Atual

Data: `2026-04-23`
Ambiente: `/opt/controlebeckercorp-v8`

## Objetivo solicitado

Reestruturar a camada visual do frontend para um posicionamento mais institucional/governamental, com:

- troca do nome `Controle Becker Corp - V8` para `SGCG - Sistema de Governança e Controle Governamental da JMB Tecnologia`
- rebrand da tela de login
- rebrand do sidebar
- remocao da secao `Sessão atual`
- mover o usuario logado para o rodape do sidebar com avatar e acao de logout
- criar um modulo inicial de `Configurações`
- incluir toggle de temas e cores

## O que ja foi mapeado

Arquivos principais do frontend envolvidos:

- `frontend/src/App.jsx`
- `frontend/src/pages/Login.jsx`
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/components/ui/Sidebar.jsx`
- `frontend/src/components/ui/Topbar.jsx`
- `frontend/src/components/ui/AppShell.jsx`
- `frontend/src/index.css`

## Estado atual encontrado

### Shell do app

- `App.jsx` controla autenticacao, tema e rotas
- o token continua em `localStorage` com a chave `becker_token`
- o usuario continua em `localStorage` com a chave `becker_user`
- o tema atual usa a chave `becker_theme`

### Sidebar

- o menu real vem de `frontend/src/components/Sidebar.jsx`
- a renderizacao visual do sidebar esta em `frontend/src/components/ui/Sidebar.jsx`
- o sidebar atual ainda mostra:
  - `Controle Becker Corp`
  - `V8 Core`
  - secao `Sessão atual`
  - botao de logout separado no rodape

### Login

- a tela atual esta em `frontend/src/pages/Login.jsx`
- ela ainda usa a marca `BeckerCorp - V8`
- ja possui toggle simples de tema
- o layout atual usa uma linguagem mais de datacenter/infraestrutura do que institucional/governamental

### Tema global

- a base visual global esta em `frontend/src/index.css`
- existe suporte atual a `light` e `dark` via `data-theme`
- ainda nao existe suporte estruturado para paleta/cor institucional selecionavel

## Logotipo JMB localizado

Foi encontrado um ativo aproveitavel em outro projeto do host:

- origem: `/opt/dracarla/public/jmb-logo.png`
- dimensao: `220x96`

Esse arquivo ja foi copiado para:

- destino: `frontend/public/jmb-logo.png`

## Decisao de implementacao

A implementacao planejada e esta:

1. Centralizar `theme` e `accent color` no `App.jsx`
2. Passar esse estado para `Login`, `Topbar` e novo modulo `Configurações`
3. Rebrand do `Login.jsx` para `SGCG`
4. Rebrand do `Sidebar.jsx` para identidade JMB/SGCG
5. Remover a caixa `Sessão atual`
6. Criar rodape do sidebar com:
   - avatar
   - nome do usuario logado
   - cargo/descricao curta
   - icone/botao de logout
7. Criar pagina `frontend/src/pages/Settings.jsx`
8. Adicionar rota e item de menu para `Configurações`
9. Expandir `index.css` para suportar tema + selecao de cor institucional
10. Rodar `vite build` para validar

## Implementacao concluida nesta etapa

Arquivos alterados:

- `frontend/src/App.jsx`
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/components/ui/Sidebar.jsx`
- `frontend/src/components/ui/Topbar.jsx`
- `frontend/src/pages/Login.jsx`
- `frontend/src/pages/Settings.jsx`
- `frontend/src/index.css`
- `frontend/public/jmb-logo.png`

## Resultado entregue

### Rebrand institucional

- login rebatizado para `SGCG`
- linguagem visual trocada para posicionamento institucional/governamental
- marca `JMB` aplicada na tela de login e no sidebar
- nomenclatura principal atual:
  - `SGCG`
  - `Sistema de Governança e Controle Governamental`
  - `Plataforma institucional da JMB Tecnologia`

### Sidebar

- removida a secao `Sessão atual`
- incluido rodape com usuario logado
- incluido avatar com inicial do usuario
- incluido papel/perfil do usuario
- logout convertido em icone/acao no rodape do sidebar

### Configuracoes

Foi criado o modulo:

- `frontend/src/pages/Settings.jsx`

Com:

- seletor de tema `claro/escuro`
- seletor de cor institucional
- opcoes:
  - `Governamental`
  - `Institucional`
  - `Executivo`

### Shell e estado global

- `App.jsx` agora centraliza:
  - `theme`
  - `accent`
- persistencia em:
  - `localStorage.sgcg_theme`
  - `localStorage.sgcg_accent`
- compatibilidade mantida com `becker_theme`

### Topbar

- adicionada referencia textual ao `SGCG`
- toggle de tema mantido

## Validacao executada

Build validado com sucesso:

- `cd frontend && npm run build`

Resultado observado:

- build concluido sem erros
- bundle gerado em `frontend/dist/`
