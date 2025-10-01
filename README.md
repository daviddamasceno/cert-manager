# Cert Manager

## 1. Visão geral
O Cert Manager centraliza o ciclo de vida de certificados digitais com foco em notificações multicanal. A plataforma inclui:

- **Gestão de certificados** com vínculos a modelos de alerta e canais configuráveis.
- **Modelos de alerta** parametrizados por datas e agendamentos recorrentes.
- **Canais de notificação** (e-mail, chat, etc.) com suporte a parâmetros e segredos criptografados.
- **Auditoria append-only** registrando cada alteração sensível e disparo de alerta.
- **Gestão de usuários** com administrador inicial e autenticação via JWT.

A arquitetura é composta por:

- **Frontend** em React/Vite servido por Nginx.
- **Backend/worker** em Node.js (Express + jobs agendados).
- **Google Sheets** atuando como armazenamento principal ("banco").
- **Containers Docker** para isolar frontend, backend e scheduler.

## 2. Pré-requisitos
Antes de iniciar, garanta que você possui:

- Docker e Docker Compose instalados na máquina de orquestração.
- Ferramentas de linha de comando `openssl` e `base64` disponíveis (Linux/macOS).
- Conta Google com acesso ao Google Cloud Console para criar projeto, ativar APIs e gerar Service Account.

## 3. Variáveis PRINCIPAIS (obrigatórias)
Preencha `backend/.env` a partir de `backend/.env.example`. Cada valor deve ser gerado conforme instruções abaixo.

| NOME | O QUE É | COMO OBTER/GERAR | COMANDO |
| --- | --- | --- | --- |
| `APP_BASE_URL` | Origem HTTPS autorizada para o frontend. | Determine a URL pública final do frontend (produção ou ambiente de testes). | `APP_BASE_URL='https://localhost:3000'` (substitua pelo endereço real; exemplo ilustrativo)
| `JWT_SECRET` | Segredo para assinar tokens JWT de sessão. | Gere uma sequência aleatória forte e armazene em local seguro. | `openssl rand -hex 64`
| `ADMIN_EMAIL` | E-mail que identifica o administrador padrão. | Defina o endereço corporativo que será usado para o login inicial. | `ADMIN_EMAIL='admin@sua-empresa.com'` (ajuste para o e-mail corporativo desejado)
| `ADMIN_PASSWORD_HASH` | Hash BCrypt da senha inicial do administrador. | Instale dependências do backend, defina uma senha forte e gere o hash com `bcryptjs`. | `cd backend && npm install && ADMIN_PASSWORD='SuaSenhaForteAqui' node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12));"`
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | Credenciais da Service Account codificadas em Base64. | Após baixar o arquivo JSON da Service Account, converta-o para Base64 sem quebras de linha. | `openssl base64 -A -in caminho/para/service-account.json`
| `SHEETS_SPREADSHEET_ID` | Identificador da planilha Google Sheets usada como banco. | Copie o ID presente na URL da planilha criada no Google Sheets. | `SHEETS_SPREADSHEET_ID='1AbCdEfGhIjKlMnOpQrStUvWxYz'` (substitua pelo ID copiado da URL)
| `ENCRYPTION_KEY` | Chave simétrica usada para criptografar segredos de canais (AES-256-GCM). | Gere 32 bytes aleatórios e converta para Base64. | `openssl rand -base64 32`

> Armazene cada valor em um cofre seguro. Sempre que atualizar algum segredo, lembre-se de rotacioná-lo também nos ambientes de execução.

## 4. Variáveis OPCIONAIS (defaults no código)
As variáveis abaixo já possuem valores padrão definidos diretamente no código. Sobrescreva manualmente no `.env` apropriado apenas quando precisar alterar o comportamento padrão.

### Backend

| NOME | DEFAULT | DESCRIÇÃO |
| --- | --- | --- |
| `PORT` | `8080` | Porta HTTP exposta pelo backend.
| `NODE_ENV` | `development` | Ambiente lógico (`development`, `production`).
| `JWT_EXPIRES_IN` | `15m` | Duração do token de acesso em formato compatível com `jsonwebtoken`.
| `JWT_REFRESH_EXPIRES_IN` | `14d` | Duração padrão do refresh token.
| `JWT_COOKIE_SAMESITE` | `lax` | Política SameSite aplicada aos cookies de sessão.
| `CACHE_TTL_SECONDS` | `60` | Tempo de vida do cache in-memory para leituras no Sheets.
| `TZ` | `America/Fortaleza` | Fuso horário base usado no scheduler e registros.
| `SCHEDULER_ENABLED` | `false` | Liga ou desliga o worker de agendamentos.
| `SCHEDULER_INTERVAL_MINUTES` | `1` | Frequência mínima de execução do scheduler (em minutos).
| `METRICS_ENABLED` | `true` | Controla a exposição do endpoint `/api/metrics`.
| `LOG_LEVEL` | `info` | Nível mínimo de log do backend.
| `RATE_LIMIT_GLOBAL_WINDOW_MS` | `60000` | Janela (ms) do rate limit global.
| `RATE_LIMIT_GLOBAL_MAX` | `300` | Número máximo de requisições por janela global.
| `RATE_LIMIT_TEST_WINDOW_MS` | `60000` | Janela (ms) aplicada aos testes de canais.
| `RATE_LIMIT_TEST_MAX` | `5` | Número máximo de testes de canais por janela.
| `RATE_LIMIT_SENSITIVE_WINDOW_MS` | `60000` | Janela (ms) aplicada a rotas sensíveis (`/test`, `/send`).
| `RATE_LIMIT_SENSITIVE_MAX` | `10` | Número máximo de requisições sensíveis por janela.

### Frontend

| NOME | DEFAULT | DESCRIÇÃO |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:4000` | URL padrão do backend consumida pelo frontend. Ajuste `frontend/.env` para apontar para outra origem.

## 5. Passo a passo: preparar o “banco” (Google Sheets + Service Account)
1. **Criar projeto no Google Cloud**
   - Acesse o [Google Cloud Console](https://console.cloud.google.com/) e crie um novo projeto dedicado ao Cert Manager.

2. **Ativar APIs necessárias**
   - No menu “APIs e serviços”, habilite a **Google Sheets API** para o projeto.

3. **Criar Service Account e chave JSON**
   - Em “IAM e administrador” → “Contas de serviço”, crie uma nova conta.
   - Conceda pelo menos o papel “Editor” ao projeto.
   - Gere uma chave JSON e armazene o arquivo com segurança.
   - Converta o conteúdo da chave para Base64 com o comando descrito na tabela de variáveis.

4. **Criar a planilha no Google Sheets**
   - Crie uma planilha vazia, renomeie conforme desejar e copie o ID exibido na URL (entre `/d/` e `/edit`).

5. **Compartilhar a planilha**
   - Compartilhe a planilha com o e-mail da Service Account concedendo permissão **Editor**.

6. **Configurar o backend e instalar dependências**
   - `cd backend`
   - `npm install`
   - Copie `backend/.env.example` para `backend/.env` e preencha as variáveis principais.

7. **Executar o seed de estrutura**
   - Ainda em `backend/`, rode `npm run build` se desejar gerar o código compilado.
   - Defina a variável `ADMIN_INITIAL_PASSWORD` com a senha temporária desejada (`export ADMIN_INITIAL_PASSWORD=<senha>`).
   - Opcionalmente defina `ADMIN_INITIAL_NAME` antes do próximo comando para ajustar o nome exibido nos registros iniciais (`export ADMIN_INITIAL_NAME=<nome>`).
   - Execute o seed que cria abas, cabeçalhos e garante o usuário admin inicial:<br>
     `npm run seed:sheets`

8. **Executar migrações adicionais (quando necessário)**
   - Sempre que novas colunas forem adicionadas a modelos existentes, execute `npm run migrate:sheets:alert-schedule` para ajustar as abas legadas.

## 6. Como rodar
1. Garanta que o `.env` esteja configurado e que os scripts de seed/migração foram executados.
2. Suba os serviços com Docker Compose:
   ```bash
   docker compose up -d --build
   ```
3. Monitore os containers e health checks:
   - `docker compose ps` — confirma estados e health checks.
   - `docker compose logs -f backend` — acompanha inicialização da API.
   - `docker compose exec backend curl -fsS http://localhost:8080/api/health` — verifica o health check HTTP.
   - `docker compose logs -f scheduler` ou `docker compose exec scheduler cat /tmp/scheduler-heartbeat.json` — confirma batimentos do worker.
4. A interface web ficará disponível na porta publicada pelo serviço `frontend` (padrão 3000) e consumirá a API do backend.

## 7. Como rotacionar chaves
1. Gere novos segredos (JWT, ENCRYPTION_KEY, etc.) usando os mesmos comandos da seção de variáveis.
2. Atualize os arquivos `.env` de todos os ambientes e distribua as novas credenciais com segurança.
3. Para `ENCRYPTION_KEY`, descriptografe os segredos atuais com a chave antiga, recriptografe com a nova e atualize o Google Sheets via scripts ou rotina dedicada.
4. Reinicie os containers afetados (`docker compose up -d backend scheduler frontend`) para aplicar as mudanças.
5. Revogue e destrua as chaves antigas após verificar que o sistema opera com os novos valores.

## 8. Observações de segurança
- Cookies de sessão são enviados como `httpOnly` e devem ser marcados como `Secure` em produção.
- Endpoints críticos possuem rate limit configurável; mantenha valores conservadores e monitore abusos.
- Registros de auditoria são append-only — não altere linhas existentes na planilha manualmente.
- Nunca versione segredos ou arquivos `.env`. Utilize cofres e restrinja o acesso aos administradores necessários.

## 9. FAQ / Troubleshooting
| Sintoma | Possível causa | Como resolver |
| --- | --- | --- |
| Erro “The caller does not have permission” ao acessar o Sheets | Planilha não compartilhada com a Service Account ou API desativada. | Confirme o compartilhamento como Editor e verifique se a Google Sheets API está habilitada para o projeto correto.
| Erro ao decodificar `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | Base64 com quebras de linha ou arquivo JSON inválido. | Refaça a codificação usando `openssl base64 -A -in ...` e valide com `echo "$VALOR" | base64 --decode` antes de salvar no `.env`.
| Campos/abas ausentes após seed | Seed não executou ou falhou antes de concluir. | Revise logs de `npm run seed:sheets`, corrija variáveis ausentes (ex.: `ADMIN_INITIAL_PASSWORD`) e execute novamente.
| Login falha mesmo com credenciais corretas | Hash do admin divergente ou senha inicial não sincronizada na planilha. | Gere novo `ADMIN_PASSWORD_HASH`, atualize o `.env`, rode o seed com a senha desejada e tente novamente.
| Frontend não enxerga a API | `VITE_API_URL` não aponta para o backend correto. | Ajuste `frontend/.env` com a URL desejada e reconstrua o container/frontend local (`npm run dev` ou `docker compose up -d frontend`).

> Dúvidas adicionais? Consulte os logs estruturados (`docker compose logs`) e os registros de auditoria na aba `audit_logs` para rastrear ações recentes.

## 10. Testes (backend e frontend)
- **Backend**
  1. `cd backend`
  2. `npm install`
  3. Garanta que `backend/.env` contenha as variáveis principais preenchidas.
  4. `npm run test` — executa a suíte de testes integrada (`ts-node`), reutilizando os defaults opcionais definidos no código.
- **Frontend**
  1. `cd frontend`
  2. `npm install`
  3. Ajuste `frontend/.env` apenas se precisar sobrescrever variáveis opcionais.
  4. `npm run build` — valida a geração do bundle de produção pelo Vite.

## 11. Favicon e identidade visual
O frontend utiliza um favicon customizado compatível com navegadores modernos. Para evitar o versionamento de binários, os ativos ficam codificados em Base64 dentro de `frontend/public/favicon-assets.json`. Sempre que você instala ou executa scripts do frontend, o utilitário `npm run sync:favicons` (invocado automaticamente por `npm install`, `npm run dev`, `npm run preview` e `npm run build`) decodifica esse arquivo gerando os ícones físicos em `frontend/public/`:

- `favicon.ico` — pacote multi-resoluções usado pelo link principal.
- `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png`, `favicon-64x64.png`, `favicon-128x128.png`, `favicon-256x256.png` — cobrem os tamanhos típicos exigidos pelos navegadores.
- `apple-touch-icon.png` — ícone recomendado para atalhos adicionados em dispositivos Apple.

Os arquivos gerados são ignorados pelo Git via `.gitignore`, mas permanecem acessíveis durante o desenvolvimento e no build final.

Para trocar o favicon no futuro:
1. Gere novos arquivos nas mesmas dimensões (16, 32, 48, 64, 128, 256 e 180px para Apple touch).
2. Converta cada arquivo para Base64 (ex.: `base64 -i favicon-32x32.png`) e atualize os valores correspondentes em `frontend/public/favicon-assets.json`.
3. Rode `npm run sync:favicons` para regenerar os arquivos binários na pasta `frontend/public/`.
4. Limpe o cache do navegador (ou incremente o versionamento do build) para garantir que os ícones atualizados sejam carregados.

Ferramentas sugeridas:
- [favicon.io](https://favicon.io/) permite criar ícones a partir de texto, imagens ou SVG e exportar os PNGs necessários.
- Qualquer editor vetorial (Figma, Illustrator, Inkscape) exportando versões em PNG + `.ico` funciona bem para manter a consistência do design minimalista/dark do projeto.
