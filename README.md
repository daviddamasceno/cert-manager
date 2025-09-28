# Cert Manager – Base de Integração

Este repositório entrega o alicerce do gerenciador de certificados com API Express, persistência em Google Sheets e frontend Vite. A base já incorpora preocupações de segurança e observabilidade:

- CORS restrito à `APP_BASE_URL` definida em ambiente.
- Autenticação JWT em cookie `httpOnly` com refresh automático e expiração configurável.
- Rate limiting dedicado para endpoints sensíveis (`/test` e `/send`).
- Logs estruturados em JSON (Pino) e métricas Prometheus opcionais.

## Estrutura do projeto
```
backend/   API Express + serviços + repositórios (TypeScript)
frontend/  Aplicação Vite (React + Tailwind) pronta para a UI
scripts/   Utilitários (ex.: seed do Google Sheets)
```

## Google Sheets – criação das abas e cabeçalhos
1. Crie uma planilha vazia no Google Sheets e anote o ID (parte após `/spreadsheets/d/`).
2. Execute o seed (`npm run seed:sheets` dentro de `backend/`) após configurar as variáveis de ambiente – ele cria/atualiza todas as abas necessárias.
3. Caso precise montar manualmente, utilize a tabela abaixo:

| Aba | Cabeçalhos |
| --- | --- |
| `certificates` | `id`, `name`, `owner_email`, `issued_at`, `expires_at`, `status`, `alert_model_id`, `notes`, `channel_ids` |
| `alert_models` | `id`, `name`, `offset_days_before`, `offset_days_after`, `repeat_every_days`, `template_subject`, `template_body` |
| `channels` | `id`, `name`, `type`, `enabled`, `created_at`, `updated_at` |
| `channel_params` | `channel_id`, `key`, `value`, `updated_at` |
| `channel_secrets` | `channel_id`, `key`, `value_ciphertext`, `updated_at` |
| `certificate_channels` | `certificate_id`, `channel_id`, `linked_at`, `linked_by_user_id` |
| `audit_logs` | `timestamp`, `actor_user_id`, `actor_email`, `entity`, `entity_id`, `action`, `diff_json`, `ip`, `user_agent`, `note` |

> As abas `certificates` e `alert_models` continuam compatíveis com dados antigos (apenas adicionamos `channel_ids`).

## Service Account e permissões
1. No Google Cloud, crie um projeto e habilite a Sheets API.
2. Crie uma Service Account, gere a chave JSON e salve o arquivo com segurança.
3. Compartilhe a planilha com o e-mail da Service Account (permissão **Editor**).
4. Converta o JSON para Base64 (`cat service-account.json | openssl base64 -A`) e preencha `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`.
5. Caso troque a chave, atualize o `.env`, substitua os segredos criptografados (ver seção abaixo) e remova a chave antiga.

## Variáveis de ambiente, criptografia e segredos
### Arquivos `.env`
- `backend/.env.example` lista todas as variáveis exigidas pelo backend. Copie para `backend/.env` e preencha valores reais.
- `frontend/.env.example` expõe `VITE_API_URL`; copie para `frontend/.env` para apontar o frontend ao backend desejado.

### Principais variáveis
| Variável | Descrição |
| --- | --- |
| `APP_BASE_URL` | Origem autorizada para CORS (ex.: `http://localhost:3000`). |
| `PORT` | Porta HTTP do backend (default `8080`). |
| `JWT_SECRET` | Segredo para assinatura dos JWT. Gere ao menos 32 caracteres aleatórios. |
| `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Duração dos tokens (formato `15m`, `7d`, ...). |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` | Credenciais iniciais do administrador (hash BCrypt). |
| `SHEETS_SPREADSHEET_ID` | ID da planilha Google Sheets criada. |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | JSON da Service Account em Base64. |
| `ENCRYPTION_KEY` | Chave AES-256 (32 bytes Base64) usada para criptografar segredos de canais. |
| `CACHE_TTL_SECONDS` | TTL do cache in-memory dos repositórios. |
| `TZ` | Fuso horário padrão da aplicação/scheduler. |
| `SCHEDULER_ENABLED` / `SCHEDULER_*_CRON` | Ativação e cron expressions do scheduler. |
| `METRICS_ENABLED` | Expõe (`true`) ou oculta (`false`) o endpoint `/api/metrics`. |
| `LOG_LEVEL` | Nível de log (ex.: `info`, `debug`). |
| `RATE_LIMIT_TEST_WINDOW_MS` / `RATE_LIMIT_TEST_MAX` | Janela e limite para testes de canais (`/test`). |
| `RATE_LIMIT_SENSITIVE_WINDOW_MS` / `RATE_LIMIT_SENSITIVE_MAX` | Janela e limite para endpoints sensíveis (`/test`, `/send`). |

### Criptografia, backup e rotação
- Segredos de canais são criptografados com AES-256-GCM (`backend/src/utils/crypto.ts`). Guarde `ENCRYPTION_KEY` de forma segura (ex.: cofre de segredos) e gere um backup offline.
- Para rotacionar a chave de criptografia:
  1. Gere uma nova chave Base64 de 32 bytes e atualize `ENCRYPTION_KEY`.
  2. Escreva um script de migração (ou use o seed) para ler segredos existentes, descriptografar com a chave antiga e salvar com a nova.
  3. Atualize o cofre/backup com a nova chave e destrua a anterior.
- A mesma política vale para `JWT_SECRET` e `ADMIN_PASSWORD_HASH`: mantenha versões antigas apenas durante o período de transição e revogue acessos antigos.

## Repositórios Google Sheets
`backend/src/repositories/googleSheetsRepository.ts` encapsula toda a persistência (retry + cache). Endpoints da API não tocam diretamente o Sheets – utilize os serviços (`certificateService`, `channelService`, etc.) para garantir validações e auditoria.

## Execução local (modo desenvolvimento)
```bash
# Backend
cd backend
cp .env.example .env   # preencha os valores
npm install
npm run dev

# Frontend
cd ../frontend
cp .env.example .env
npm install
npm run dev
```
- Backend (API): http://localhost:8080
- Frontend: http://localhost:5173

## Docker Compose e health checks
```bash
docker compose up --build -d
```
Serviços:
- `backend`: API com health check em `/api/health`.
- `scheduler`: worker (`node dist/scheduler.js`) com heartbeat em `/tmp/scheduler-heartbeat.json` validado pelo health check.
- `frontend`: UI servida por Nginx (porta 3000).

Use `docker compose ps` para acompanhar o estado – os health checks garantirão que os containers só fiquem “healthy” após passarem nas verificações.

## Criptografia e auditoria
- Logs estruturados (Pino) são enviados para `stdout` em JSON, facilitando ingestão em sistemas de observabilidade.
- `requestLogger` registra todas as requisições; erros passam por `errorHandler` (também estruturado).
- Auditorias de ações (criação/atualização/testes) são salvas em `audit_logs` com o usuário autenticado.

## Adicionando novos tipos de canal
1. **Definição básica**: inclua o tipo em `CHANNEL_DEFINITIONS` (`backend/src/services/channelService.ts`) especificando parâmetros (`params`) e segredos (`secrets`).
2. **Validação**: atualize `validateChannelParams`/`validateChannelSecret` com as regras específicas (URLs, portas, tokens, etc.) e, se necessário, ajuste `deliverMessage` para enviar a notificação.
3. **Testes / Retry**: reutilize os utilitários existentes ou acrescente novos métodos `send*` no `ChannelService` para integrar com o serviço externo.
4. **Frontend**: exponha os novos campos em `frontend/src/pages/ChannelsPage.tsx` e adapte `frontend/src/services/channels.ts` para enviar/formatar os parâmetros e segredos.
5. **Documentação**: atualize o README descrevendo parâmetros obrigatórios, formato dos segredos e passos de teste.

## Fluxo operacional (canal → teste → vincular → disparo)
1. **Criar canal**: preencha nome, tipo, parâmetros e segredos no frontend. O backend valida URLs, portas e e-mails antes de salvar.
2. **Testar canal**: use o botão "Testar". O rate limit evita abuso (configurável via `RATE_LIMIT_*`).
3. **Vincular a certificados**: em “Certificados”, associe os canais ativos ao certificado desejado.
4. **Disparo de alertas**:
   - Manual: botão “Enviar notificação de teste” (`/certificates/:id/test-notification`).
   - Automático: scheduler avalia o vencimento via `AlertSchedulerJob` e registra auditoria para cada envio.

## Próximos passos sugeridos
- Evoluir a UI para gerenciamento completo de canais/segredos.
- Integrar autenticação multiusuário real (a base para auditoria já existe).
- Implementar testes de integração para os repositórios (Google Sheets).
- Acrescentar observabilidade (dashboards/alerts) consumindo os logs JSON e métricas.
