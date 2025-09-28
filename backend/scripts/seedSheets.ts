import { google, sheets_v4 } from 'googleapis';
import { v4 as uuid } from 'uuid';
import config from '../src/config/env';
import logger from '../src/utils/logger';
import { withRetry } from '../src/utils/retry';
import { hashSecret } from '../src/utils/passwordHasher';

type HeaderMap = Record<string, string[]>;

const HEADERS: HeaderMap = {
  certificates: [
    'id',
    'name',
    'owner_email',
    'issued_at',
    'expires_at',
    'status',
    'alert_model_id',
    'notes',
    'channel_ids'
  ],
  alert_models: [
    'id',
    'name',
    'offset_days_before',
    'offset_days_after',
    'repeat_every_days',
    'template_subject',
    'template_body'
  ],
  channels: ['id', 'name', 'type', 'enabled', 'created_at', 'updated_at'],
  channel_params: ['channel_id', 'key', 'value', 'updated_at'],
  channel_secrets: ['channel_id', 'key', 'value_ciphertext', 'updated_at'],
  certificate_channels: ['certificate_id', 'channel_id', 'linked_at', 'linked_by_user_id'],
  audit_logs: [
    'timestamp',
    'actor_user_id',
    'actor_email',
    'entity',
    'entity_id',
    'action',
    'diff_json',
    'ip',
    'user_agent',
    'note'
  ],
  users: [
    'id',
    'email',
    'name',
    'role',
    'status',
    'created_at',
    'updated_at',
    'last_login_at',
    'mfa_enabled'
  ],
  user_credentials: ['user_id', 'password_hash', 'password_updated_at', 'password_needs_reset'],
  refresh_tokens: ['id', 'user_id', 'token_hash', 'issued_at', 'expires_at', 'user_agent', 'ip', 'revoked']
};

type SheetsClient = sheets_v4.Sheets;

type SeedContext = {
  sheets: SheetsClient;
  spreadsheetId: string;
};

async function ensureSheet(context: SeedContext, tab: string, header: string[]): Promise<void> {
  const range = `${tab}!A1:${String.fromCharCode(65 + header.length - 1)}1`;

  const response = await withRetry(() =>
    context.sheets.spreadsheets.values.get({
      spreadsheetId: context.spreadsheetId,
      range
    })
  );

  const values = response.data.values;
  if (!values || !values.length) {
    await withRetry(() =>
      context.sheets.spreadsheets.values.update({
        spreadsheetId: context.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [header] }
      })
    );
    logger.info({ tab }, 'Header created');
    return;
  }

  const current = values[0];
  const matches = header.every((value, index) => current[index] === value);
  if (!matches) {
    await withRetry(() =>
      context.sheets.spreadsheets.values.update({
        spreadsheetId: context.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [header] }
      })
    );
    logger.warn({ tab }, 'Header replaced to match expected schema');
  }
}

const requiredEnv = (value: string | undefined, name: string): string => {
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
};

async function seedAdminUser(context: SeedContext): Promise<void> {
  const adminEmail = requiredEnv(process.env.SEED_ADMIN_EMAIL, 'SEED_ADMIN_EMAIL').toLowerCase();
  const adminName = (process.env.SEED_ADMIN_NAME || 'Administrador').trim();
  const tempPassword = requiredEnv(process.env.SEED_ADMIN_TEMP_PASSWORD, 'SEED_ADMIN_TEMP_PASSWORD');

  const usersRange = 'users!A:Z';
  const response = await withRetry(() =>
    context.sheets.spreadsheets.values.get({
      spreadsheetId: context.spreadsheetId,
      range: usersRange
    })
  );
  const rows = response.data.values ?? [];
  const existing = rows
    .slice(1)
    .find((row) => (row[1] || '').toString().toLowerCase() === adminEmail);

  if (existing) {
    logger.info({ adminEmail }, 'Admin user already present, skipping seed');
    return;
  }

  const timestamp = new Date().toISOString();
  const userId = uuid();

  await withRetry(() =>
    context.sheets.spreadsheets.values.append({
      spreadsheetId: context.spreadsheetId,
      range: 'users!A:I',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [
          [
            userId,
            adminEmail,
            adminName,
            'admin',
            'active',
            timestamp,
            timestamp,
            '',
            'false'
          ]
        ]
      }
    })
  );

  const passwordHash = await hashSecret(tempPassword);

  await withRetry(() =>
    context.sheets.spreadsheets.values.append({
      spreadsheetId: context.spreadsheetId,
      range: 'user_credentials!A:D',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[userId, passwordHash, timestamp, 'true']]
      }
    })
  );

  logger.info({ adminEmail }, 'Seeded initial admin user');
}

async function main(): Promise<void> {
  const credentials = JSON.parse(config.googleServiceAccountJson);
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets: SheetsClient = google.sheets({ version: 'v4', auth });
  const context: SeedContext = { sheets, spreadsheetId: config.googleSheetsId };

  for (const [tab, header] of Object.entries(HEADERS)) {
    await ensureSheet(context, tab, header);
  }

  await seedAdminUser(context);

  logger.info('Google Sheets seed completed');
}

main().catch((error) => {
  logger.error({ error }, 'Failed to seed Google Sheets');
  process.exit(1);
});
