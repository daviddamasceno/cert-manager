import bcrypt from 'bcryptjs';
import { GaxiosError, GaxiosResponse } from 'gaxios';
import { google, sheets_v4 } from 'googleapis';
import { v4 as uuid } from 'uuid';
import config from '../src/config/config';
import logger from '../src/utils/logger';
import { withRetry } from '../src/utils/retry';

type HeaderMap = Record<string, string[]>;

type SheetRecord = Record<string, string>;

type SheetsClient = sheets_v4.Sheets;

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
    'template_body',
    'schedule_type',
    'schedule_time',
    'enabled'
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
  users: ['id', 'email', 'name', 'role', 'status', 'created_at', 'updated_at', 'last_login_at'],
  user_credentials: ['user_id', 'password_hash', 'password_updated_at', 'password_needs_reset'],
  refresh_tokens: ['id', 'user_id', 'token_hash', 'issued_at', 'expires_at', 'user_agent', 'ip', 'revoked'],
  smtp_sends_history: ['id', 'channel_id', 'to', 'subject', 'status', 'error', 'timestamp']
};

const ADMIN_PASSWORD_BCRYPT_ROUNDS = 12;

const rangeFor = (tab: string): string => `${tab}!A:Z`;

const normalizeRow = (header: string[], row: string[] = []): string[] =>
  header.map((_, index) => row[index] ?? '');

const buildRow = (header: string[], values: SheetRecord): string[] =>
  header.map((column) => values[column] ?? '');

const mapRow = (header: string[], row: string[]): SheetRecord => {
  const record: SheetRecord = {};
  header.forEach((column, index) => {
    record[column] = row[index] ?? '';
  });
  return record;
};

const isMissingSheetError = (error: unknown): error is GaxiosError => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const gaxiosError = error as GaxiosError;
  const status = gaxiosError?.response?.status;
  if (status !== 400) {
    return false;
  }

  const message =
    (gaxiosError.response?.data as { error?: { message?: string } })?.error?.message ||
    gaxiosError.message;

  return typeof message === 'string' && message.includes('Unable to parse range');
};

async function ensureSheet(
  sheets: SheetsClient,
  spreadsheetId: string,
  tab: string,
  header: string[]
): Promise<void> {
  const range = `${tab}!A1:${String.fromCharCode(65 + header.length - 1)}1`;

  let response: GaxiosResponse<sheets_v4.Schema$ValueRange> | undefined;

  try {
    response = await withRetry(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range
      })
    );
  } catch (error) {
    if (!isMissingSheetError(error)) {
      throw error;
    }

    await withRetry(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: tab
                }
              }
            }
          ]
        }
      })
    );
    logger.info({ tab }, 'Sheet created');
  }

  const values = response?.data?.values;
  if (!values || !values.length) {
    await withRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
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
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [header] }
      })
    );
    logger.warn({ tab }, 'Header replaced to match expected schema');
  }
}

async function readSheetWithHeader(
  sheets: SheetsClient,
  spreadsheetId: string,
  tab: string,
  header: string[]
): Promise<{ header: string[]; rows: string[][] }> {
  const response = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: rangeFor(tab)
    })
  );

  const values = response.data.values || [];
  if (!values.length) {
    return { header, rows: [] };
  }

  const [currentHeader, ...rows] = values;
  return { header: currentHeader, rows };
}

async function writeSheet(
  sheets: SheetsClient,
  spreadsheetId: string,
  tab: string,
  rows: string[][]
): Promise<void> {
  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: rangeFor(tab),
      valueInputOption: 'RAW',
      requestBody: { values: rows }
    })
  );
}

async function seedAdminUser(sheets: SheetsClient, spreadsheetId: string): Promise<void> {
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (!adminPassword) {
    throw new Error('Missing required environment variable: ADMIN_INITIAL_PASSWORD');
  }

  const adminEmail = config.adminEmail;
  const adminName = process.env.ADMIN_INITIAL_NAME || 'Administrator';
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(adminPassword, ADMIN_PASSWORD_BCRYPT_ROUNDS);

  const usersHeader = HEADERS.users;
  const { rows: userRows } = await readSheetWithHeader(sheets, spreadsheetId, 'users', usersHeader);
  const normalizedUsers = userRows.map((row) => normalizeRow(usersHeader, row));

  const emailIndex = usersHeader.indexOf('email');
  const existingIndex = normalizedUsers.findIndex(
    (row) => (row[emailIndex] || '').toLowerCase() === adminEmail.toLowerCase()
  );

  let adminId = uuid();
  let createdAt = now;
  let lastLoginAt = '';
  let status = 'active';
  let name = adminName;

  if (existingIndex >= 0) {
    const existingMap = mapRow(usersHeader, normalizedUsers[existingIndex]);
    adminId = existingMap['id'] || adminId;
    createdAt = existingMap['created_at'] || createdAt;
    lastLoginAt = existingMap['last_login_at'] || '';
    status = existingMap['status'] || 'active';
    name = existingMap['name'] || adminName;
  }

  const adminRow = buildRow(usersHeader, {
    id: adminId,
    email: adminEmail,
    name,
    role: 'admin',
    status,
    created_at: createdAt,
    updated_at: now,
    last_login_at: lastLoginAt
  });

  if (existingIndex >= 0) {
    normalizedUsers[existingIndex] = adminRow;
  } else {
    normalizedUsers.push(adminRow);
  }

  await writeSheet(sheets, spreadsheetId, 'users', [usersHeader, ...normalizedUsers]);
  logger.info({ email: adminEmail }, 'Admin user ensured');

  const credentialsHeader = HEADERS.user_credentials;
  const { rows: credentialRows } = await readSheetWithHeader(
    sheets,
    spreadsheetId,
    'user_credentials',
    credentialsHeader
  );
  const normalizedCredentials = credentialRows
    .map((row) => normalizeRow(credentialsHeader, row))
    .filter((row) => row[0] !== adminId);

  const credentialRow = buildRow(credentialsHeader, {
    user_id: adminId,
    password_hash: passwordHash,
    password_updated_at: now,
    password_needs_reset: 'true'
  });

  await writeSheet(sheets, spreadsheetId, 'user_credentials', [
    credentialsHeader,
    ...normalizedCredentials,
    credentialRow
  ]);
  logger.info({ email: adminEmail }, 'Admin credentials ensured');
}

async function main(): Promise<void> {
  const credentials = JSON.parse(config.googleServiceAccountJson);
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets: SheetsClient = google.sheets({ version: 'v4', auth });

  for (const [tab, header] of Object.entries(HEADERS)) {
    await ensureSheet(sheets, config.googleSheetsId, tab, header);
  }

  await seedAdminUser(sheets, config.googleSheetsId);

  logger.info('Google Sheets seed completed');
}

main().catch((error) => {
  logger.error({ error }, 'Failed to seed Google Sheets');
  process.exit(1);
});
