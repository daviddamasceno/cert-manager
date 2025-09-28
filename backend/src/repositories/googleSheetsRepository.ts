import { google, sheets_v4 } from 'googleapis';
import NodeCache from 'node-cache';
import { v4 as uuid } from 'uuid';
import config from '../config/env';
import {
  AlertModel,
  AuditLog,
  Certificate,
  ChannelInstance,
  ChannelParam,
  ChannelSecret,
  CertificateChannelLink,
  ChannelType,
  RefreshTokenRecord,
  User,
  UserCredentials
} from '../domain/types';
import {
  AlertModelRepository,
  AuditLogRepository,
  CertificateRepository,
  ChannelRepository,
  UserRepository
} from './interfaces';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';

const SHEET_CERTIFICATES = 'certificates';
const SHEET_ALERT_MODELS = 'alert_models';
const SHEET_CHANNELS = 'channels';
const SHEET_CHANNEL_PARAMS = 'channel_params';
const SHEET_CHANNEL_SECRETS = 'channel_secrets';
const SHEET_CERTIFICATE_CHANNELS = 'certificate_channels';
const SHEET_AUDIT_LOGS = 'audit_logs';
const SHEET_USERS = 'users';
const SHEET_USER_CREDENTIALS = 'user_credentials';
const SHEET_REFRESH_TOKENS = 'refresh_tokens';
const SHEET_SMTP_HISTORY = 'smtp_sends_history';

const HEADERS: Record<string, string[]> = {
  [SHEET_CERTIFICATES]: [
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
  [SHEET_ALERT_MODELS]: [
    'id',
    'name',
    'offset_days_before',
    'offset_days_after',
    'repeat_every_days',
    'template_subject',
    'template_body'
  ],
  [SHEET_CHANNELS]: ['id', 'name', 'type', 'enabled', 'created_at', 'updated_at'],
  [SHEET_CHANNEL_PARAMS]: ['channel_id', 'key', 'value', 'updated_at'],
  [SHEET_CHANNEL_SECRETS]: ['channel_id', 'key', 'value_ciphertext', 'updated_at'],
  [SHEET_CERTIFICATE_CHANNELS]: ['certificate_id', 'channel_id', 'linked_at', 'linked_by_user_id'],
  [SHEET_AUDIT_LOGS]: [
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
  [SHEET_USERS]: [
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
  [SHEET_USER_CREDENTIALS]: [
    'user_id',
    'password_hash',
    'password_updated_at',
    'password_needs_reset'
  ],
  [SHEET_REFRESH_TOKENS]: [
    'id',
    'user_id',
    'token_hash',
    'issued_at',
    'expires_at',
    'user_agent',
    'ip',
    'revoked'
  ],
  [SHEET_SMTP_HISTORY]: ['id', 'channel_id', 'to', 'subject', 'status', 'error', 'timestamp']
};

type SheetRow = string[];
type SheetRows = SheetRow[];

type SheetRowMap = Record<string, string>;

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export class GoogleSheetsRepository
  implements
    CertificateRepository,
    AlertModelRepository,
    ChannelRepository,
    AuditLogRepository,
    UserRepository {
  private readonly sheets: sheets_v4.Sheets;
  private readonly cache: NodeCache;

  constructor() {
    const credentials = JSON.parse(config.googleServiceAccountJson);
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key.replace(/\\n/g, '\n'),
      scopes: SCOPES
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    this.cache = new NodeCache({ stdTTL: config.cacheTtlSeconds });
  }

  private cacheKey(tab: string): string {
    return `sheet:${tab}`;
  }

  private range(tab: string): string {
    return `${tab}!A:Z`;
  }

  private async fetch(tab: string): Promise<SheetRows> {
    const key = this.cacheKey(tab);
    const cached = this.cache.get<SheetRows>(key);
    if (cached) {
      return cached;
    }

    const response = await withRetry(() =>
      this.sheets.spreadsheets.values.get({
        spreadsheetId: config.googleSheetsId,
        range: this.range(tab)
      })
    );
    const rows = response.data.values || [];
    this.cache.set(key, rows);
    return rows;
  }

  private async write(tab: string, rows: SheetRows): Promise<void> {
    await withRetry(() =>
      this.sheets.spreadsheets.values.update({
        spreadsheetId: config.googleSheetsId,
        range: this.range(tab),
        valueInputOption: 'RAW',
        requestBody: { values: rows }
      })
    );
    this.cache.del(this.cacheKey(tab));
  }

  private async append(tab: string, row: SheetRow): Promise<void> {
    await withRetry(() =>
      this.sheets.spreadsheets.values.append({
        spreadsheetId: config.googleSheetsId,
        range: this.range(tab),
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] }
      })
    );
    this.cache.del(this.cacheKey(tab));
  }

  private headersMatch(current: string[], expected: string[]): boolean {
    if (current.length < expected.length) {
      return false;
    }
    return expected.every((value, index) => current[index] === value);
  }

  private async ensureHeader(tab: string, expected: string[]): Promise<SheetRows> {
    const rows = await this.fetch(tab);

    if (!rows.length) {
      await this.write(tab, [expected]);
      logger.info({ sheet: tab }, 'Header initialized');
      return [expected];
    }

    const [header, ...data] = rows;

    if (!this.headersMatch(header, expected)) {
      logger.warn({ sheet: tab }, 'Unexpected header detected, attempting to realign');
      return this.realignSheet(tab, header, data, expected);
    }

    return rows;
  }

  private async realignSheet(tab: string, header: string[], data: SheetRow[], expected: string[]): Promise<SheetRows> {
    const mapped = data.map((row) => {
      const record: SheetRowMap = {};
      header.forEach((column, index) => {
        record[column] = row[index] ?? '';
      });
      return record;
    });

    const rebuilt: SheetRows = [expected];
    mapped.forEach((record) => {
      const row = expected.map((column) => record[column] ?? '');
      rebuilt.push(row);
    });

    await this.write(tab, rebuilt);
    return rebuilt;
  }

  private async readSheetWithHeader(tab: string, header: string[]): Promise<{ header: string[]; rows: SheetRow[] }> {
    const rows = await this.ensureHeader(tab, header);
    const [currentHeader, ...data] = rows;
    return { header: currentHeader, rows: data };
  }

  private mapRow(header: string[], row: SheetRow): SheetRowMap {
    const map: SheetRowMap = {};
    header.forEach((column, index) => {
      map[column] = row[index] ?? '';
    });
    return map;
  }

  private async replaceRows(tab: string, header: string[], predicate: (row: SheetRow) => boolean, newRows: SheetRow[]): Promise<void> {
    const { rows } = await this.readSheetWithHeader(tab, header);
    const filtered = rows.filter((row) => !predicate(row));
    await this.write(tab, [header, ...filtered, ...newRows]);
  }

  /* Certificates */

  async listCertificates(): Promise<Certificate[]> {
    const { header, rows } = await this.readSheetWithHeader(SHEET_CERTIFICATES, HEADERS[SHEET_CERTIFICATES]);
    return rows.map((row) => {
      const map = this.mapRow(header, row);
      return {
        id: map['id'] || uuid(),
        name: map['name'] || '',
        ownerEmail: map['owner_email'] || '',
        issuedAt: map['issued_at'] || '',
        expiresAt: map['expires_at'] || '',
        status: (map['status'] as Certificate['status']) || 'active',
        alertModelId: map['alert_model_id'] || undefined,
        notes: map['notes'] || undefined,
        channelIds: map['channel_ids'] ? map['channel_ids'].split(',').map((c) => c.trim()).filter(Boolean) : []
      };
    });
  }

  async getCertificate(id: string): Promise<Certificate | null> {
    const certificates = await this.listCertificates();
    return certificates.find((certificate) => certificate.id === id) ?? null;
  }

  async createCertificate(input: Certificate): Promise<void> {
    await this.append(SHEET_CERTIFICATES, [
      input.id,
      input.name,
      input.ownerEmail,
      input.issuedAt,
      input.expiresAt,
      input.status,
      input.alertModelId || '',
      input.notes || '',
      input.channelIds.join(',')
    ]);
  }

  async updateCertificate(id: string, input: Partial<Certificate>): Promise<Certificate> {
    const { header, rows } = await this.readSheetWithHeader(SHEET_CERTIFICATES, HEADERS[SHEET_CERTIFICATES]);

    let updated: Certificate | null = null;

    const newRows = rows.map((row) => {
      const map = this.mapRow(header, row);
      if (map['id'] !== id) {
        return row;
      }

      const merged: Certificate = {
        id,
        name: input.name ?? map['name'] ?? '',
        ownerEmail: input.ownerEmail ?? map['owner_email'] ?? '',
        issuedAt: input.issuedAt ?? map['issued_at'] ?? '',
        expiresAt: input.expiresAt ?? map['expires_at'] ?? '',
        status: (input.status as Certificate['status']) ?? (map['status'] as Certificate['status']) ?? 'active',
        alertModelId: input.alertModelId ?? (map['alert_model_id'] || undefined),
        notes: input.notes ?? (map['notes'] || undefined),
        channelIds:
          input.channelIds ?? (map['channel_ids'] ? map['channel_ids'].split(',').map((c) => c.trim()).filter(Boolean) : [])
      };

      updated = merged;

      return [
        merged.id,
        merged.name,
        merged.ownerEmail,
        merged.issuedAt,
        merged.expiresAt,
        merged.status,
        merged.alertModelId || '',
        merged.notes || '',
        merged.channelIds.join(',')
      ];
    });

    if (!updated) {
      throw new Error(`Certificate with id ${id} not found`);
    }

    await this.write(SHEET_CERTIFICATES, [header, ...newRows]);
    return updated;
  }

  async deleteCertificate(id: string): Promise<void> {
    const { header, rows } = await this.readSheetWithHeader(SHEET_CERTIFICATES, HEADERS[SHEET_CERTIFICATES]);
    const filtered = rows.filter((row) => row[0] !== id);
    await this.write(SHEET_CERTIFICATES, [header, ...filtered]);
    await this.replaceRows(
      SHEET_CERTIFICATE_CHANNELS,
      HEADERS[SHEET_CERTIFICATE_CHANNELS],
      (row) => row[0] === id,
      []
    );
  }

  async getCertificateChannels(id: string): Promise<CertificateChannelLink[]> {
    const { header, rows } = await this.readSheetWithHeader(
      SHEET_CERTIFICATE_CHANNELS,
      HEADERS[SHEET_CERTIFICATE_CHANNELS]
    );
    return rows
      .filter((row) => row[0] === id)
      .map((row) => {
        const map = this.mapRow(header, row);
        return {
          certificateId: map['certificate_id'],
          channelId: map['channel_id'],
          linkedAt: map['linked_at'],
          linkedByUserId: map['linked_by_user_id']
        };
      });
  }

  async setCertificateChannels(id: string, links: CertificateChannelLink[]): Promise<void> {
    const linkRows = links.map((link) => [link.certificateId, link.channelId, link.linkedAt, link.linkedByUserId]);
    await this.replaceRows(
      SHEET_CERTIFICATE_CHANNELS,
      HEADERS[SHEET_CERTIFICATE_CHANNELS],
      (row) => row[0] === id,
      linkRows
    );

    const { header, rows: certificateRows } = await this.readSheetWithHeader(
      SHEET_CERTIFICATES,
      HEADERS[SHEET_CERTIFICATES]
    );
    const updatedRows = certificateRows.map((row) => {
      if (row[0] !== id) {
        return row;
      }
      const clone = [...row];
      const channelIdx = header.indexOf('channel_ids');
      if (channelIdx >= 0) {
        clone[channelIdx] = links.map((link) => link.channelId).join(',');
      }
      return clone;
    });
    await this.write(SHEET_CERTIFICATES, [header, ...updatedRows]);
  }

  /* Alert models */

  async listAlertModels(): Promise<AlertModel[]> {
    const { header, rows } = await this.readSheetWithHeader(SHEET_ALERT_MODELS, HEADERS[SHEET_ALERT_MODELS]);
    return rows.map((row) => {
      const map = this.mapRow(header, row);
      return {
        id: map['id'] || uuid(),
        name: map['name'] || '',
        offsetDaysBefore: Number(map['offset_days_before'] || 0),
        offsetDaysAfter: map['offset_days_after'] ? Number(map['offset_days_after']) : undefined,
        repeatEveryDays: map['repeat_every_days'] ? Number(map['repeat_every_days']) : undefined,
        templateSubject: map['template_subject'] || '',
        templateBody: map['template_body'] || ''
      };
    });
  }

  async getAlertModel(id: string): Promise<AlertModel | null> {
    const models = await this.listAlertModels();
    return models.find((model) => model.id === id) ?? null;
  }

  async createAlertModel(model: AlertModel): Promise<void> {
    await this.append(SHEET_ALERT_MODELS, [
      model.id,
      model.name,
      model.offsetDaysBefore.toString(),
      model.offsetDaysAfter?.toString() || '',
      model.repeatEveryDays?.toString() || '',
      model.templateSubject,
      model.templateBody
    ]);
  }

  async updateAlertModel(id: string, input: Partial<AlertModel>): Promise<AlertModel> {
    const { header, rows } = await this.readSheetWithHeader(SHEET_ALERT_MODELS, HEADERS[SHEET_ALERT_MODELS]);

    let updated: AlertModel | null = null;

    const newRows = rows.map((row) => {
      const map = this.mapRow(header, row);
      if (map['id'] !== id) {
        return row;
      }

      const merged: AlertModel = {
        id,
        name: input.name ?? map['name'] ?? '',
        offsetDaysBefore: input.offsetDaysBefore ?? Number(map['offset_days_before'] || 0),
        offsetDaysAfter: input.offsetDaysAfter ?? (map['offset_days_after'] ? Number(map['offset_days_after']) : undefined),
        repeatEveryDays: input.repeatEveryDays ?? (map['repeat_every_days'] ? Number(map['repeat_every_days']) : undefined),
        templateSubject: input.templateSubject ?? map['template_subject'] ?? '',
        templateBody: input.templateBody ?? map['template_body'] ?? ''
      };

      updated = merged;

      return [
        merged.id,
        merged.name,
        merged.offsetDaysBefore.toString(),
        merged.offsetDaysAfter?.toString() || '',
        merged.repeatEveryDays?.toString() || '',
        merged.templateSubject,
        merged.templateBody
      ];
    });

    if (!updated) {
      throw new Error(`Alert model with id ${id} not found`);
    }

    await this.write(SHEET_ALERT_MODELS, [header, ...newRows]);
    return updated;
  }

  async deleteAlertModel(id: string): Promise<void> {
    const { header, rows } = await this.readSheetWithHeader(SHEET_ALERT_MODELS, HEADERS[SHEET_ALERT_MODELS]);
    const filtered = rows.filter((row) => row[0] !== id);
    await this.write(SHEET_ALERT_MODELS, [header, ...filtered]);
  }

  /* Channels */

  async listChannels(): Promise<ChannelInstance[]> {
    const { header, rows } = await this.readSheetWithHeader(SHEET_CHANNELS, HEADERS[SHEET_CHANNELS]);
    return rows.map((row) => {
      const map = this.mapRow(header, row);
      return {
        id: map['id'] || uuid(),
        name: map['name'] || '',
        type: (map['type'] as ChannelType) || 'email_smtp',
        enabled: (map['enabled'] || 'true').toLowerCase() === 'true',
        createdAt: map['created_at'] || new Date().toISOString(),
        updatedAt: map['updated_at'] || new Date().toISOString()
      };
    });
  }

  async getChannel(id: string): Promise<ChannelInstance | null> {
    const channels = await this.listChannels();
    return channels.find((channel) => channel.id === id) ?? null;
  }

  async createChannel(channel: ChannelInstance, params: ChannelParam[], secrets: ChannelSecret[]): Promise<void> {
    await this.append(SHEET_CHANNELS, [
      channel.id,
      channel.name,
      channel.type,
      channel.enabled ? 'true' : 'false',
      channel.createdAt,
      channel.updatedAt
    ]);
    await this.replaceChannelParams(channel.id, params);
    await this.replaceChannelSecrets(channel.id, secrets);
  }

  async updateChannel(channel: ChannelInstance, params: ChannelParam[], secrets: ChannelSecret[]): Promise<void> {
    const { header, rows } = await this.readSheetWithHeader(SHEET_CHANNELS, HEADERS[SHEET_CHANNELS]);

    const newRows = rows.map((row) => {
      const map = this.mapRow(header, row);
      if (map['id'] !== channel.id) {
        return row;
      }
      return [
        channel.id,
        channel.name,
        channel.type,
        channel.enabled ? 'true' : 'false',
        map['created_at'] || channel.createdAt,
        channel.updatedAt
      ];
    });

    await this.write(SHEET_CHANNELS, [header, ...newRows]);
    await this.replaceChannelParams(channel.id, params);
    await this.replaceChannelSecrets(channel.id, secrets);
  }

  async softDeleteChannel(id: string, timestamp: string): Promise<void> {
    const channel = await this.getChannel(id);
    if (!channel) {
      return;
    }
    await this.updateChannel(
      {
        ...channel,
        enabled: false,
        updatedAt: timestamp
      },
      await this.getChannelParams(id),
      await this.getChannelSecrets(id)
    );
  }

  async getChannelParams(id: string): Promise<ChannelParam[]> {
    const { header, rows } = await this.readSheetWithHeader(SHEET_CHANNEL_PARAMS, HEADERS[SHEET_CHANNEL_PARAMS]);
    return rows
      .filter((row) => row[0] === id)
      .map((row) => {
        const map = this.mapRow(header, row);
        return {
          channelId: map['channel_id'],
          key: map['key'],
          value: map['value'],
          updatedAt: map['updated_at']
        };
      });
  }

  async getChannelSecrets(id: string): Promise<ChannelSecret[]> {
    const { header, rows } = await this.readSheetWithHeader(
      SHEET_CHANNEL_SECRETS,
      HEADERS[SHEET_CHANNEL_SECRETS]
    );
    return rows
      .filter((row) => row[0] === id)
      .map((row) => {
        const map = this.mapRow(header, row);
        return {
          channelId: map['channel_id'],
          key: map['key'],
          valueCiphertext: map['value_ciphertext'],
          updatedAt: map['updated_at']
        };
      });
  }

  private async replaceChannelParams(channelId: string, params: ChannelParam[]): Promise<void> {
    const rows = params.map((param) => [channelId, param.key, param.value, param.updatedAt]);
    await this.replaceRows(
      SHEET_CHANNEL_PARAMS,
      HEADERS[SHEET_CHANNEL_PARAMS],
      (row) => row[0] === channelId,
      rows
    );
  }

  private async replaceChannelSecrets(channelId: string, secrets: ChannelSecret[]): Promise<void> {
    const rows = secrets.map((secret) => [channelId, secret.key, secret.valueCiphertext, secret.updatedAt]);
    await this.replaceRows(
      SHEET_CHANNEL_SECRETS,
      HEADERS[SHEET_CHANNEL_SECRETS],
      (row) => row[0] === channelId,
      rows
    );
  }

  /* Users */

  private mapUserRow(map: SheetRowMap): User {
    return {
      id: map['id'],
      email: map['email'],
      name: map['name'],
      role: (map['role'] as User['role']) || 'viewer',
      status: (map['status'] as User['status']) || 'active',
      createdAt: map['created_at'],
      updatedAt: map['updated_at'] || map['created_at'],
      lastLoginAt: map['last_login_at'] || undefined,
      mfaEnabled: map['mfa_enabled'] === 'true'
    };
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase();
    const { header, rows } = await this.readSheetWithHeader(SHEET_USERS, HEADERS[SHEET_USERS]);
    const match = rows.find((row) => {
      const map = this.mapRow(header, row);
      return map['email'].toLowerCase() === normalized;
    });
    return match ? this.mapUserRow(this.mapRow(header, match)) : null;
  }

  async getUserById(id: string): Promise<User | null> {
    const { header, rows } = await this.readSheetWithHeader(SHEET_USERS, HEADERS[SHEET_USERS]);
    const match = rows.find((row) => row[0] === id);
    return match ? this.mapUserRow(this.mapRow(header, match)) : null;
  }

  async createUser(user: User, credentials: UserCredentials): Promise<void> {
    await this.append(SHEET_USERS, [
      user.id,
      user.email,
      user.name,
      user.role,
      user.status,
      user.createdAt,
      user.updatedAt,
      user.lastLoginAt || '',
      user.mfaEnabled ? 'true' : 'false'
    ]);
    await this.saveUserCredentials(credentials);
  }

  async updateUser(user: User): Promise<void> {
    const { header, rows } = await this.readSheetWithHeader(SHEET_USERS, HEADERS[SHEET_USERS]);
    const updatedRows = rows.map((row) => {
      if (row[0] !== user.id) {
        return row;
      }
      return [
        user.id,
        user.email,
        user.name,
        user.role,
        user.status,
        user.createdAt,
        user.updatedAt,
        user.lastLoginAt || '',
        user.mfaEnabled ? 'true' : 'false'
      ];
    });
    await this.write(SHEET_USERS, [header, ...updatedRows]);
  }

  async listUsers(): Promise<User[]> {
    const { header, rows } = await this.readSheetWithHeader(SHEET_USERS, HEADERS[SHEET_USERS]);
    return rows.map((row) => this.mapUserRow(this.mapRow(header, row)));
  }

  async saveUserCredentials(credentials: UserCredentials): Promise<void> {
    const { header, rows } = await this.readSheetWithHeader(
      SHEET_USER_CREDENTIALS,
      HEADERS[SHEET_USER_CREDENTIALS]
    );

    const newRows = rows.filter((row) => row[0] !== credentials.userId);
    newRows.push([
      credentials.userId,
      credentials.passwordHash,
      credentials.passwordUpdatedAt,
      credentials.passwordNeedsReset ? 'true' : 'false'
    ]);

    await this.write(SHEET_USER_CREDENTIALS, [header, ...newRows]);
  }

  async getUserCredentials(userId: string): Promise<UserCredentials | null> {
    const { header, rows } = await this.readSheetWithHeader(
      SHEET_USER_CREDENTIALS,
      HEADERS[SHEET_USER_CREDENTIALS]
    );
    const match = rows.find((row) => row[0] === userId);
    if (!match) {
      return null;
    }
    const map = this.mapRow(header, match);
    return {
      userId: map['user_id'],
      passwordHash: map['password_hash'],
      passwordUpdatedAt: map['password_updated_at'],
      passwordNeedsReset: map['password_needs_reset'] === 'true'
    };
  }

  async listRefreshTokens(userId: string): Promise<RefreshTokenRecord[]> {
    const { header, rows } = await this.readSheetWithHeader(
      SHEET_REFRESH_TOKENS,
      HEADERS[SHEET_REFRESH_TOKENS]
    );
    return rows
      .filter((row) => row[1] === userId)
      .map((row) => {
        const map = this.mapRow(header, row);
        return {
          id: map['id'],
          userId: map['user_id'],
          tokenHash: map['token_hash'],
          issuedAt: map['issued_at'],
          expiresAt: map['expires_at'],
          userAgent: map['user_agent'] || undefined,
          ip: map['ip'] || undefined,
          revoked: map['revoked'] === 'true'
        };
      });
  }

  async storeRefreshToken(record: RefreshTokenRecord): Promise<void> {
    await this.append(SHEET_REFRESH_TOKENS, [
      record.id,
      record.userId,
      record.tokenHash,
      record.issuedAt,
      record.expiresAt,
      record.userAgent || '',
      record.ip || '',
      record.revoked ? 'true' : 'false'
    ]);
  }

  async revokeRefreshToken(id: string): Promise<void> {
    await this.updateRefreshToken(id, (record) => ({ ...record, revoked: true }));
  }

  async revokeTokensByUser(userId: string): Promise<void> {
    const tokens = await this.listRefreshTokens(userId);
    for (const token of tokens) {
      await this.revokeRefreshToken(token.id);
    }
  }

  async findRefreshToken(id: string): Promise<RefreshTokenRecord | null> {
    const { header, rows } = await this.readSheetWithHeader(
      SHEET_REFRESH_TOKENS,
      HEADERS[SHEET_REFRESH_TOKENS]
    );
    const match = rows.find((row) => row[0] === id);
    if (!match) {
      return null;
    }
    const map = this.mapRow(header, match);
    return {
      id: map['id'],
      userId: map['user_id'],
      tokenHash: map['token_hash'],
      issuedAt: map['issued_at'],
      expiresAt: map['expires_at'],
      userAgent: map['user_agent'] || undefined,
      ip: map['ip'] || undefined,
      revoked: map['revoked'] === 'true'
    };
  }

  private async updateRefreshToken(
    id: string,
    updater: (record: RefreshTokenRecord) => RefreshTokenRecord
  ): Promise<void> {
    const { header, rows } = await this.readSheetWithHeader(
      SHEET_REFRESH_TOKENS,
      HEADERS[SHEET_REFRESH_TOKENS]
    );

    let found = false;
    const updatedRows = rows.map((row) => {
      if (row[0] !== id) {
        return row;
      }
      found = true;
      const record = updater({
        id: row[0],
        userId: row[1],
        tokenHash: row[2],
        issuedAt: row[3],
        expiresAt: row[4],
        userAgent: row[5] || undefined,
        ip: row[6] || undefined,
        revoked: row[7] === 'true'
      });
      return [
        record.id,
        record.userId,
        record.tokenHash,
        record.issuedAt,
        record.expiresAt,
        record.userAgent || '',
        record.ip || '',
        record.revoked ? 'true' : 'false'
      ];
    });

    if (!found) {
      return;
    }

    await this.write(SHEET_REFRESH_TOKENS, [header, ...updatedRows]);
  }

  /* Audit */

  async appendAuditLog(entry: AuditLog): Promise<void> {
    await this.append(SHEET_AUDIT_LOGS, [
      entry.timestamp,
      entry.actorUserId,
      entry.actorEmail,
      entry.entity,
      entry.entityId,
      entry.action,
      entry.diffJson,
      entry.ip || '',
      entry.userAgent || '',
      entry.note || ''
    ]);
  }

  async listAuditLogs(options: {
    limit?: number;
    entity?: string;
    entityId?: string;
    actorUserId?: string;
    action?: string;
    from?: string;
    to?: string;
    query?: string;
  }): Promise<AuditLog[]> {
    const { header, rows } = await this.readSheetWithHeader(SHEET_AUDIT_LOGS, HEADERS[SHEET_AUDIT_LOGS]);
    const logs = rows.map((row) => {
      const map = this.mapRow(header, row);
      return {
        timestamp: map['timestamp'],
        actorUserId: map['actor_user_id'],
        actorEmail: map['actor_email'],
        entity: map['entity'],
        entityId: map['entity_id'],
        action: map['action'] as AuditLog['action'],
        diffJson: map['diff_json'],
        ip: map['ip'] || undefined,
        userAgent: map['user_agent'] || undefined,
        note: map['note'] || undefined
      };
    });

    const {
      entity,
      entityId,
      actorUserId,
      action,
      from,
      to,
      query,
      limit = 200
    } = options;

    return logs
      .filter((log) => {
        if (entity && log.entity !== entity) {
          return false;
        }
        if (entityId && log.entityId !== entityId) {
          return false;
        }
        if (actorUserId && log.actorUserId !== actorUserId) {
          return false;
        }
        if (action && log.action !== action) {
          return false;
        }
        if (from && log.timestamp < from) {
          return false;
        }
        if (to && log.timestamp > to) {
          return false;
        }
        if (query) {
          const normalized = query.toLowerCase();
          if (
            !(
              log.actorEmail.toLowerCase().includes(normalized) ||
              log.entity.toLowerCase().includes(normalized) ||
              log.diffJson.toLowerCase().includes(normalized) ||
              (log.note || '').toLowerCase().includes(normalized)
            )
          ) {
            return false;
          }
        }
        return true;
      })
      .slice(-limit);
  }
}

