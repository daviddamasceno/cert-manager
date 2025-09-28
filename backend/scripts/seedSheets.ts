import bcrypt from 'bcryptjs';
import { google, sheets_v4 } from 'googleapis';
import { v4 as uuid } from 'uuid';
import config from '../src/config/env';
import logger from '../src/utils/logger';
import { withRetry } from '../src/utils/retry';

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
  users: ['id', 'email', 'name', 'role', 'status', 'created_at', 'updated_at', 'last_login_at'],
  user_credentials: ['user_id', 'password_hash', 'password_updated_at', 'password_needs_reset'],
  refresh_tokens: ['id', 'user_id', 'token_hash', 'issued_at', 'expires_at', 'user_agent', 'ip', 'revoked'],
  smtp_sends_history: ['id', 'channel_id', 'to', 'subject', 'status', 'error', 'timestamp']
};

type SheetsClient = sheets_v4.Sheets;

async function ensureSheet(
  sheets: SheetsClient,
  spreadsheetId: string,
  tab: string,
  header: string[]
): Promise<void> {
  const range = `${tab}!A1:${String.fromCharCode(65 + header.length - 1)}1`;

  const response = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range
    })
  );

  const values = response.data.values;
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

async function getSheetRows(sheets: SheetsClient, spreadsheetId: string, tab: string): Promise<string[][]> {
  const response = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!A:Z`
    })
  );
  return response.data.values ?? [];
}

async function appendRow(sheets: SheetsClient, spreadsheetId: string, tab: string, row: string[]): Promise<void> {
  await withRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!A:Z`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] }
    })
  );
}

async function seedAdminUser(sheets: SheetsClient, spreadsheetId: string): Promise<void> {
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (!adminPassword) {
    throw new Error('Missing required environment variable: ADMIN_INITIAL_PASSWORD');
  }

  const adminEmail = config.adminEmail;
  const normalizedAdminEmail = adminEmail.toLowerCase();
  const adminName = process.env.ADMIN_INITIAL_NAME || 'Administrator';
  const now = new Date().toISOString();

  const userRows = await getSheetRows(sheets, spreadsheetId, 'users');
  const [userHeader, ...userData] = userRows.length
    ? [userRows[0], userRows.slice(1)]
    : [HEADERS['users'], []];

  const emailIndex = userHeader.indexOf('email');
  const idIndex = userHeader.indexOf('id');
  const nameIndex = userHeader.indexOf('name');
  const roleIndex = userHeader.indexOf('role');
  const statusIndex = userHeader.indexOf('status');
  const createdAtIndex = userHeader.indexOf('created_at');
  const updatedAtIndex = userHeader.indexOf('updated_at');
  const lastLoginIndex = userHeader.indexOf('last_login_at');

  let adminUserId: string;
  const existingAdminRowIndex = userData.findIndex(
    (row) => (row[emailIndex] || '').toLowerCase() === normalizedAdminEmail
  );

  if (existingAdminRowIndex === -1) {
    adminUserId = uuid();
    const newRow = [adminUserId, adminEmail, adminName, 'admin', 'active', now, now, ''];
    await appendRow(sheets, spreadsheetId, 'users', newRow);
    logger.info({ tab: 'users', email: adminEmail }, 'Admin user created');
  } else {
    const existingRow = userData[existingAdminRowIndex];
    adminUserId = existingRow[idIndex];
    const normalizedRow = [
      adminUserId,
      adminEmail,
      existingRow[nameIndex] || adminName,
      existingRow[roleIndex] || 'admin',
      existingRow[statusIndex] || 'active',
      existingRow[createdAtIndex] || now,
      existingRow[updatedAtIndex] || existingRow[createdAtIndex] || now,
      existingRow[lastLoginIndex] || ''
    ];

    const needsUpdate = userHeader.some((_, index) => (existingRow[index] || '') !== normalizedRow[index]);
    if (needsUpdate) {
      const updatedSheet = [userHeader, ...userData];
      updatedSheet[existingAdminRowIndex + 1] = normalizedRow;
      await withRetry(() =>
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range: 'users!A1',
          valueInputOption: 'RAW',
          requestBody: { values: updatedSheet }
        })
      );
      logger.info({ tab: 'users', email: adminEmail }, 'Admin user normalized');
    }
  }

  const credentialRows = await getSheetRows(sheets, spreadsheetId, 'user_credentials');
  const [credentialHeader, ...credentialData] = credentialRows.length
    ? [credentialRows[0], credentialRows.slice(1)]
    : [HEADERS['user_credentials'], []];

  const userIdIndex = credentialHeader.indexOf('user_id');
  const existingCredential = credentialData.find((row) => row[userIdIndex] === adminUserId);

  if (!existingCredential) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const credentialRow = [adminUserId, passwordHash, now, 'true'];
    await appendRow(sheets, spreadsheetId, 'user_credentials', credentialRow);
    logger.info({ tab: 'user_credentials', email: adminEmail }, 'Admin credential created');
  }
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
