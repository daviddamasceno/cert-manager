# Cert Manager – Base de Integração

Este repositório fornece o esqueleto do backend/frontend e a estrutura de persistência (Google Sheets) para evoluir o sistema de gestão de certificados. O foco desta entrega é preparar o projeto com:

- Abas no Google Sheets para certificados, modelos, canais e auditoria.
- Camada de repositórios com retry/cache.
- Utilitário de criptografia AES‑256‑GCM (segredos de canais).
- Scripts de seed/migração, testes unitários e containerização via `docker-compose`.

## Estrutura do projeto
```
backend/   API Express + camada de repositórios + scripts (TypeScript)
frontend/  Placeholder (Vite) – pronto para receber UI
scripts/   (backend/scripts) seed Google Sheets
```

## Google Sheets – Schema inicial
Execute o seed (`npm run seed:sheets`) para criar/atualizar as seguintes abas com os cabeçalhos esperados:

| Aba | Cabeçalhos |
| --- | --- |
| `certificates` | `id`, `name`, `owner_email`, `issued_at`, `expires_at`, `status`, `alert_model_id`, `notes`, `channel_ids` |
| `alert_models` | `id`, `name`, `offset_days_before`, `offset_days_after`, `repeat_every_days`, `template_subject`, `template_body` |
| `channels` | `id`, `name`, `type`, `enabled`, `created_at`, `updated_at` |
| `channel_params` | `channel_id`, `key`, `value`, `updated_at` |
| `channel_secrets` | `channel_id`, `key`, `value_ciphertext`, `updated_at` |
| `certificate_channels` | `certificate_id`, `channel_id`, `linked_at`, `linked_by_user_id` |
| `audit_logs` | `timestamp`, `actor_user_id`, `actor_email`, `entity`, `entity_id`, `action`, `diff_json`, `ip`, `user_agent`, `note` |

> As abas `certificates` e `alert_models` continuam compatíveis com dados antigos (apenas adicionamos a coluna `channel_ids`).

### Script de seed
```
cd backend
npm install
npm run seed:sheets
```
O comando garante que todas as abas existam com os cabeçalhos corretos (não remove dados existentes).

## Variáveis de ambiente
Crie `backend/.env` (use `.env.example` como base). Variáveis principais:

| Variável | Descrição |
| --- | --- |
| `PORT` | Porta HTTP do backend (default `8080`) |
| `TZ` | Fuso horário padrão (ex.: `America/Fortaleza`) |
| `JWT_SECRET` | Segredo para assinar tokens JWT |
| `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Duração dos tokens (ex.: `15m`, `7d`) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` | Credenciais do usuário administrativo (hash Bcrypt) |
| `SHEETS_SPREADSHEET_ID` | ID da planilha Google Sheets |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | JSON da Service Account codificado em base64 |
| `ENCRYPTION_KEY` | Chave AES-256 (32 bytes em base64) para criptografar segredos |
| `CACHE_TTL_SECONDS` | TTL do cache in-memory (default 60s) |
| `SCHEDULER_*` | Configurações do scheduler interno |
| `METRICS_ENABLED` | Habilita `/api/metrics` |
| `RATE_LIMIT_TEST_WINDOW_MS`, `RATE_LIMIT_TEST_MAX` | Limites p/ testes de canais |

### Como gerar o JSON base64
```bash
cat service-account.json | openssl base64 -A
```

A conta de serviço deve ter acesso de edição ao Google Sheets.

## Criptografia de segredos
O utilitário `backend/src/utils/crypto.ts` usa AES‑256‑GCM. Para confirmar o funcionamento:
```
cd backend
npm test
```
O teste `tests/crypto.test.ts` valida `encryptSecret`/`decryptSecret`.

## Repositórios Google Sheets
`backend/src/repositories/googleSheetsRepository.ts` fornece operações de alto nível:

- Certificados (`list`, `get`, `create`, `update`, `delete`, `getCertificateChannels`, `setCertificateChannels`).
- Modelos de alerta (`list`, `get`, `create`, `update`, `delete`).
- Canais (`list`, `get`, `create`, `update`, `softDelete`, `getChannelParams`,`getChannelSecrets`).
- Auditoria append-only filtrável.
- Usuários (mínimo para auditoria).

Todos os acessos utilizam `withRetry` (exponencial simples) e cache leve (`node-cache`).

## Execução local
```bash
# Backend
cd backend
cp .env.example .env
# (preencha as variáveis)
npm install
npm run dev

# Frontend placeholder
cd ../frontend
npm install
npm run dev
```
- Backend: http://localhost:8080
- Frontend placeholder: http://localhost:5173

## Docker Compose
O arquivo `docker-compose.yml` publica três serviços:

- `backend` – API (`8080`).
- `scheduler` – worker usando a mesma imagem, rodando `dist/scheduler.js`.
- `frontend` – placeholder servido por Nginx na porta `3000`.

```
docker compose up --build -d
```

## Service Account / permissões
1. Crie um projeto no Google Cloud e ative a Sheets API.
2. Crie uma service account e gere uma chave JSON.
3. Compartilhe a planilha com o e-mail da service account (permissão de Editor).
4. Converta o JSON para base64 e preencha `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`.

## Próximos passos
- Implementar UI para gerenciar instâncias de canal e segredos.
- Expor autenticação real de usuários (base `users` já prevista).
- Evoluir scheduler para resolver canais vinculados.
- Acrescentar testes de integração para cada repositório.
