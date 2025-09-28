import { google } from 'googleapis';
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
  ]
};

type SheetsAuth = ReturnType<typeof google.auth.JWT>;

async function ensureSheet(
  sheets: ReturnType<typeof google.sheets>,
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

async function main(): Promise<void> {
  const credentials = JSON.parse(config.googleServiceAccountJson);
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets = google.sheets({ version: 'v4', auth });

  for (const [tab, header] of Object.entries(HEADERS)) {
    await ensureSheet(sheets, config.googleSheetsId, tab, header);
  }

  logger.info('Google Sheets seed completed');
}

main().catch((error) => {
  logger.error({ error }, 'Failed to seed Google Sheets');
  process.exit(1);
});
