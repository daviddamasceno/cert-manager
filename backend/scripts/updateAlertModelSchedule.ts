import { google } from 'googleapis';
import config from '../src/config/env';
import logger from '../src/utils/logger';
import { withRetry } from '../src/utils/retry';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SHEET = 'alert_models';
const EXPECTED_HEADER = [
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
];

type SheetRow = string[];

type SheetRecord = Record<string, string>;

const buildRow = (record: SheetRecord): SheetRow => EXPECTED_HEADER.map((column) => record[column] ?? '');

const mapRow = (header: string[], row: SheetRow): SheetRecord => {
  const record: SheetRecord = {};
  header.forEach((column, index) => {
    record[column] = row[index] ?? '';
  });
  return record;
};

async function main(): Promise<void> {
  const credentials = JSON.parse(config.googleServiceAccountJson);
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key.replace(/\\n/g, '\n'),
    scopes: SCOPES
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = config.googleSheetsId;

  const response = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET}!A:Z`
    })
  );

  const rows = response.data.values ?? [];
  if (!rows.length) {
    await withRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET}!A1:${String.fromCharCode(65 + EXPECTED_HEADER.length - 1)}1`,
        valueInputOption: 'RAW',
        requestBody: { values: [EXPECTED_HEADER] }
      })
    );
    logger.info('Header created for alert_models sheet');
    return;
  }

  const [header, ...data] = rows;
  const normalizedRows = data.map((row) => {
    const record = mapRow(header, row);
    const scheduleType = (record['schedule_type'] || '').trim() || 'hourly';
    const enabled = (record['enabled'] || '').trim() || 'true';
    const scheduleTime = scheduleType === 'daily' ? (record['schedule_time'] || '').trim() : '';

    return buildRow({
      ...record,
      schedule_type: scheduleType,
      schedule_time: scheduleTime,
      enabled
    });
  });

  const output = [EXPECTED_HEADER, ...normalizedRows];

  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET}!A:Z`,
      valueInputOption: 'RAW',
      requestBody: { values: output }
    })
  );

  logger.info({ rowsUpdated: normalizedRows.length }, 'Alert model schedule columns ensured');
}

main().catch((error) => {
  logger.error({ error }, 'Failed to update alert model schedule columns');
  process.exitCode = 1;
});
