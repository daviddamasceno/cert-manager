# Cert Manager – Guia de Implantação

## 1. Visão geral
O Cert Manager centraliza o ciclo de vida de certificados e alertas:
- **Gestão de certificados** com controle de validade, responsáveis e canais vinculados.
- **Modelos de alerta** para definir assunto, conteúdo e frequência dos avisos.
- **Canais de notificação** com parâmetros e segredos criptografados.
- **Auditoria append-only** para todas as ações relevantes.
- **Gestão de usuários** com autenticação baseada em cookies HTTP-only.

Arquitetura resumida:
- **Frontend** em React/Vite distribuído por Nginx.
- **Backend/Worker** em Node.js (Express + scheduler) com filas cronometradas.
- **Google Sheets** funciona como a "base de dados" do sistema.
- **Containers Docker** orquestram frontend, backend e scheduler via Docker Compose.

## 2. Pré-requisitos
- Docker e Docker Compose instalados.
- Ferramentas `openssl` e `base64` disponíveis (Linux/macOS já possuem por padrão).
- Conta Google com acesso ao Google Cloud Console para criar projeto, ativar APIs e gerar Service Account.

## 3. Variáveis PRINCIPAIS (obrigatórias)
Crie `backend/.env` a partir de `backend/.env.example` e preencha todas as variáveis abaixo.

| NOME | O QUE É | COMO OBTER/GERAR | COMANDO |
| --- | --- | --- | --- |
| `APP_BASE_URL` | Origem autorizada para o frontend consumir o backend e receber cookies. | Defina para a URL pública do frontend ou do ambiente local. | `read -p 'Informe a URL pública do frontend: ' APP_BASE_URL && printf '%s\n' "$APP_BASE_URL"` |
| `JWT_SECRET` | Segredo usado para assinar os tokens de sessão. | Gere um valor aleatório de alta entropia. | `openssl rand -base64 48` |
| `ADMIN_EMAIL` | E-mail do usuário administrador inicial, usado no seed. | Utilize um endereço controlado pela equipe responsável. | `read -p 'Informe o e-mail administrativo primário: ' ADMIN_EMAIL && printf '%s\n' "$ADMIN_EMAIL"` |
| `ADMIN_PASSWORD_HASH` | Hash BCrypt (custo 12) da senha do administrador inicial. | Gere uma senha forte e converta para hash. | `read -s -p 'Defina a senha do admin: ' ADMIN_PASSWORD && printf '\n' && env ADMIN_PASSWORD="$ADMIN_PASSWORD" node -e "const bcrypt=require('bcryptjs');console.log(bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12));"` |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | Credenciais da Service Account codificadas em Base64 (string única). | Após gerar a chave JSON, converta o arquivo para Base64 sem quebras de linha. | `openssl base64 -A -in CAMINHO/DA/SERVICE-ACCOUNT.json` |
| `SHEETS_SPREADSHEET_ID` | Identificador da planilha do Google Sheets usada como banco. | Copie o trecho entre `/spreadsheets/d/` e `/edit` da URL da planilha. | `read -p 'Cole o ID da planilha do Google Sheets: ' SHEETS_SPREADSHEET_ID && printf '%s\n' "$SHEETS_SPREADSHEET_ID"` |
| `ENCRYPTION_KEY` | Chave AES-256 em Base64 usada para cifrar segredos de canais. | Gere 32 bytes aleatórios e codifique em Base64. | `openssl rand -base64 32` |

> Execute o comando de hash dentro do diretório `backend` após instalar as dependências (`npm install`). Após gerar todos os valores, preencha-os manualmente no `backend/.env` e mantenha os segredos em local seguro.

## 4. Variáveis OPCIONAIS (defaults definidos no código)
Caso deseje alterar qualquer valor abaixo, adicione a variável correspondente manualmente no seu `.env`. Sem sobrescrita, o backend utilizará os padrões a seguir.

| NOME | DEFAULT | DESCRIÇÃO |
| --- | --- | --- |
| `PORT` | `8080` | Porta HTTP exposta pelo backend.
| `NODE_ENV` | `development` | Ambiente lógico usado para logs e diagnósticos.
| `JWT_EXPIRES_IN` | `15m` | Validade do token de acesso.
| `JWT_REFRESH_EXPIRES_IN` | `14d` | Validade do token de refresh.
| `JWT_COOKIE_SAMESITE` | `lax` | Política SameSite aplicada ao cookie de sessão.
| `CACHE_TTL_SECONDS` | `60` | Tempo de vida do cache em memória para leituras do Sheets.
| `TZ` | `America/Fortaleza` | Fuso horário base para logs e agendamentos.
| `SCHEDULER_ENABLED` | `false` | Ativa (`true`) ou desativa (`false`) o worker de agendamentos.
| `SCHEDULER_INTERVAL_MINUTES` | `1` | Intervalo mínimo entre execuções do scheduler (valores menores que 1 são corrigidos para 1).
| `METRICS_ENABLED` | `true` | Controla a exposição do endpoint `/api/metrics`.
| `LOG_LEVEL` | `info` | Nível de log estruturado.
| `RATE_LIMIT_GLOBAL_WINDOW_MS` | `60000` | Janela global (ms) do limitador de requisições.
| `RATE_LIMIT_GLOBAL_MAX` | `300` | Total de requisições permitidas por IP na janela global.
| `RATE_LIMIT_TEST_WINDOW_MS` | `60000` | Janela (ms) para testes de canais.
| `RATE_LIMIT_TEST_MAX` | `5` | Limite de testes de canais na janela configurada.
| `RATE_LIMIT_SENSITIVE_WINDOW_MS` | `60000` | Janela (ms) para rotas sensíveis.
| `RATE_LIMIT_SENSITIVE_MAX` | `10` | Limite de requisições em rotas sensíveis.

## 5. Passo a passo – preparando o "banco" (Google Sheets + Service Account)
1. **Criar projeto**: no [Google Cloud Console](https://console.cloud.google.com/), crie um projeto dedicado ao Cert Manager.
2. **Ativar API**: habilite a *Google Sheets API* para o projeto.
3. **Service Account**:
   - Crie uma Service Account com permissão mínima de *Editor* na API do Sheets.
   - Gere uma chave JSON e armazene o arquivo com segurança.
   - Converta o JSON em Base64 com `openssl base64 -A -in CAMINHO/DA/SERVICE-ACCOUNT.json` e preencha `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`.
4. **Planilha**:
   - Crie uma planilha vazia no Google Sheets e anote o ID.
   - Compartilhe a planilha com o e-mail da Service Account concedendo o papel **Editor**.
5. **Configurar ambiente local**:
   - `cd backend`.
   - `cp .env.example .env` e preencha as variáveis principais.
6. **Seed/Migrate**:
   - Garanta que os pacotes estejam instalados: `npm install`.
   - Execute `ADMIN_INITIAL_PASSWORD="$(openssl rand -base64 24)" npm run seed:sheets`. Esse comando cria/atualiza as abas, cabeçalhos e garante o usuário administrador usando a senha fornecida.
   - Caso esteja atualizando uma planilha existente criada em versões anteriores, rode também `npm run migrate:sheets:alert-schedule`.
7. **Registrar a senha inicial**: guarde a senha gerada para entregar ao administrador. Solicite que altere no primeiro acesso.

## 6. Como rodar
1. Do diretório raiz, construa e inicie os serviços: `docker compose up -d`.
2. Acompanhe os health checks:
   - `docker compose ps` para verificar o status geral.
   - `docker compose logs backend -f` para logs da API.
   - `docker compose logs scheduler -f` para o worker de agendamentos.
   - `docker compose exec backend curl -f http://localhost:8080/api/health` para validar o endpoint de saúde.
3. O frontend fica disponível na porta exposta pelo container (por padrão 3000 via Nginx).

## 7. Como rotacionar chaves
1. Gere novas credenciais com `openssl rand -base64 48` para `JWT_SECRET` e `openssl rand -base64 32` para `ENCRYPTION_KEY`.
2. Atualize os valores seguros no cofre/gerenciador de segredos da sua infraestrutura.
3. Edite o `.env` (e quaisquer variáveis gerenciadas por pipelines) com os novos valores.
4. Reinicie os containers afetados: `docker compose up -d backend scheduler`.
5. Para a Service Account, gere uma nova chave, atualize `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`, rode `docker compose up -d backend scheduler` e revogue a chave antiga no Google Cloud.

## 8. Observações de segurança
- Utilize cookies `httpOnly` e `Secure` em produção (o backend já configura automaticamente ao detectar HTTPS).
- Ative mecanismos de rate limit adicionais em front-ends públicos ou WAFs se necessário.
- A auditoria salva todos os eventos como registros append-only; nunca edite diretamente a aba `audit_logs`.
- Segredos (JWT, chave de criptografia, JSON da Service Account) não devem ser versionados nem compartilhados fora de canais seguros.

## 9. FAQ / Troubleshooting
| Problema | Como resolver |
| --- | --- |
| Erro de permissão ao acessar o Google Sheets | Verifique se a Service Account foi compartilhada como **Editor** e se a Sheets API está habilitada. Revise também o ID da planilha no `.env`. |
| Falha ao decodificar `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | Gere novamente o Base64 sem quebras de linha usando `openssl base64 -A -in CAMINHO/DA/SERVICE-ACCOUNT.json`. |
| Mensagem de Base64 inválido em `ENCRYPTION_KEY` | Confirme se a saída de `openssl rand -base64 32` foi copiada sem espaços extras. |
| Abas ausentes após o seed | Execute novamente `ADMIN_INITIAL_PASSWORD="$(openssl rand -base64 24)" npm run seed:sheets` e confirme no log se todas as abas foram criadas. |
| Login do admin falhando | Refaça o seed garantindo que `ADMIN_EMAIL` e `ADMIN_PASSWORD_HASH` coincidam com os valores presentes no `.env` e que `ADMIN_INITIAL_PASSWORD` foi informado ao rodar o seed. |
| Base64 da Service Account com caracteres quebrados no `.env` | Cole o valor em uma linha única e utilize aspas apenas se o seu gerenciador exigir. |
| Scheduler sem enviar alertas | Confirme se `SCHEDULER_ENABLED` está configurado como `true` no `.env` e reinicie o container `scheduler`. |

> Persistindo algum problema, consulte os logs dos containers (`docker compose logs <serviço> -f`) para detalhes adicionais.
