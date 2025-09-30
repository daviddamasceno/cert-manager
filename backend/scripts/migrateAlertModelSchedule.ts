import { google, sheets_v4 } from 'googleapis';
import config from '../src/config/config';
import logger from '../src/utils/logger';
import { withRetry } from '../src/utils/retry';

const TAB_ALERT_MODELS = 'alert_models';
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

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const toRange = (tab: string): string => `${tab}!A:Z`;

const normalizeRow = (header: string[], row: string[]): Record<string, string> => {
  const result: Record<string, string> = {};
  header.forEach((column, index) => {
    result[column] = row[index] ?? '';
  });
  return result;
};

const buildRow = (record: Record<string, string>): string[] =>
  EXPECTED_HEADER.map((column) => {
    if (column === 'schedule_type') {
      const value = record[column]?.toLowerCase();
      return value === 'daily' ? 'daily' : 'hourly';
    }
    if (column === 'schedule_time') {
      return record[column] ?? '';
    }
    if (column === 'enabled') {
      const normalized = record[column]?.toLowerCase();
      if (normalized === 'false') {
        return 'false';
      }
      return 'true';
    }
    return record[column] ?? '';
  });

async function createSheetsClient(): Promise<sheets_v4.Sheets> {
  const credentials = JSON.parse(config.googleServiceAccountJson);
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key.replace(/\\n/g, '\n'),
    scopes: SCOPES
  });

  return google.sheets({ version: 'v4', auth });
}

async function migrate(): Promise<void> {
  const sheets = await createSheetsClient();
  const spreadsheetId = config.googleSheetsId;

  const response = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: toRange(TAB_ALERT_MODELS)
    })
  );

  const values = response.data.values || [];

  if (values.length === 0) {
    await withRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: toRange(TAB_ALERT_MODELS),
        valueInputOption: 'RAW',
        requestBody: { values: [EXPECTED_HEADER] }
      })
    );
    logger.info('Cabeçalho de alert_models criado com campos de agendamento.');
    return;
  }

  const [currentHeader, ...rows] = values;
  const updatedRows = rows.map((row) => {
    const record = normalizeRow(currentHeader, row);

    if (!record['schedule_type']) {
      record['schedule_type'] = 'hourly';
    }
    if (!record['schedule_time']) {
      record['schedule_time'] = '';
    }
    if (!record['enabled']) {
      record['enabled'] = 'true';
    }

    return buildRow(record);
  });

  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: toRange(TAB_ALERT_MODELS),
      valueInputOption: 'RAW',
      requestBody: { values: [EXPECTED_HEADER, ...updatedRows] }
    })
  );

  logger.info({ rows: updatedRows.length }, 'Planilha alert_models atualizada com campos de agendamento.');
}

migrate().catch((error) => {
  logger.error({ error }, 'Falha ao atualizar planilha alert_models');
  process.exitCode = 1;
});
