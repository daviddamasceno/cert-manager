import { v4 as uuid } from 'uuid';
import nodemailer from 'nodemailer';
import {
  ChannelInstance,
  ChannelParam,
  ChannelSecret,
  ChannelType
} from '../domain/types';
import { ChannelRepository } from '../repositories/interfaces';
import { decryptSecret, encryptSecret } from '../utils/crypto';
import { AuditService } from './auditService';

const CHANNEL_DEFINITIONS: Record<ChannelType, { params: string[]; secrets: string[] }> = {
  email_smtp: {
    params: ['smtp_host', 'smtp_port', 'smtp_user', 'from_name', 'from_email', 'tls', 'timeout_ms'],
    secrets: ['smtp_pass']
  },
  telegram_bot: {
    params: ['chat_ids'],
    secrets: ['bot_token']
  },
  slack_webhook: {
    params: ['channel_override'],
    secrets: ['webhook_url']
  },
  googlechat_webhook: {
    params: ['space_name'],
    secrets: ['webhook_url']
  }
};

export interface ChannelSecretSummary {
  key: string;
  hasValue: boolean;
}

export interface ChannelResponse {
  channel: ChannelInstance;
  params: Record<string, string>;
  secrets: ChannelSecretSummary[];
}

export interface ChannelTestResult {
  success: boolean;
  error?: string;
}

export interface ChannelInput {
  name: string;
  type: ChannelType;
  enabled?: boolean;
  params?: Record<string, string>;
  secrets?: Record<string, string | null | undefined>;
}

const nowIso = (): string => new Date().toISOString();

export class ChannelService {
  constructor(
    private readonly repository: ChannelRepository,
    private readonly auditService: AuditService
  ) {}

  async list(): Promise<ChannelResponse[]> {
    const channels = await this.repository.listChannels();
    const responses: ChannelResponse[] = [];

    for (const channel of channels) {
      const params = await this.repository.getChannelParams(channel.id);
      const secrets = await this.repository.getChannelSecrets(channel.id);
      responses.push({
        channel,
        params: this.composeParamMap(channel.type, params),
        secrets: this.composeSecretSummaries(channel.type, secrets)
      });
    }

    responses.sort((a, b) => b.channel.createdAt.localeCompare(a.channel.createdAt));
    return responses;
  }

  async create(input: ChannelInput, actor: { id: string; email: string }): Promise<ChannelResponse> {
    const id = uuid();
    const timestamp = nowIso();
    const type = input.type;
    const definition = CHANNEL_DEFINITIONS[type];
    if (!definition) {
      throw new Error(`Unsupported channel type: ${type}`);
    }

    const instance: ChannelInstance = {
      id,
      name: input.name,
      type,
      enabled: input.enabled !== undefined ? input.enabled : true,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const params = await this.buildParams(type, id, input.params || {}, timestamp);
    const secrets = await this.buildSecrets(type, id, input.secrets || {}, timestamp, []);

    await this.repository.createChannel(instance, params, secrets);
    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'channel',
      entityId: id,
      action: 'create',
      diff: {
        name: { new: input.name },
        type: { new: type }
      }
    });

    return {
      channel: instance,
      params: this.composeParamMap(type, params),
      secrets: this.composeSecretSummaries(type, secrets, input.secrets)
    };
  }

  async update(
    id: string,
    input: Partial<ChannelInput>,
    actor: { id: string; email: string }
  ): Promise<ChannelResponse> {
    const existing = await this.repository.getChannel(id);
    if (!existing) {
      throw new Error('Channel not found');
    }

    const newType = input.type ?? existing.type;
    const definition = CHANNEL_DEFINITIONS[newType];
    if (!definition) {
      throw new Error(`Unsupported channel type: ${newType}`);
    }

    const channel: ChannelInstance = {
      ...existing,
      name: input.name ?? existing.name,
      type: newType,
      enabled: input.enabled !== undefined ? input.enabled : existing.enabled,
      updatedAt: nowIso()
    };

    const currentParams = await this.repository.getChannelParams(id);
    const currentSecrets = await this.repository.getChannelSecrets(id);

    const params = await this.buildParams(channel.type, id, input.params || {}, channel.updatedAt, currentParams);
    const secrets = await this.buildSecrets(
      channel.type,
      id,
      input.secrets || {},
      channel.updatedAt,
      currentSecrets
    );

    await this.repository.updateChannel(channel, params, secrets);
    const diff: Record<string, { old?: unknown; new?: unknown }> = {};
    if (input.name) {
      diff.name = { old: existing.name, new: input.name };
    }
    if (input.enabled !== undefined) {
      diff.enabled = { old: existing.enabled, new: input.enabled };
    }
    if (input.type && input.type !== existing.type) {
      diff.type = { old: existing.type, new: input.type };
    }
    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'channel',
      entityId: id,
      action: 'update',
      diff
    });

    return {
      channel,
      params: this.composeParamMap(channel.type, params),
      secrets: this.composeSecretSummaries(channel.type, secrets, input.secrets)
    };
  }

  async softDelete(id: string, actor: { id: string; email: string }): Promise<void> {
    await this.repository.softDeleteChannel(id, nowIso());
    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'channel',
      entityId: id,
      action: 'delete',
      diff: {}
    });
  }

  async testChannel(
    id: string,
    input: { to: string },
    actor: { id: string; email: string }
  ): Promise<ChannelTestResult> {
    const channel = await this.repository.getChannel(id);
    if (!channel) {
      throw new Error('Channel not found');
    }

    if (!channel.enabled) {
      throw new Error('Channel disabled');
    }

    if (channel.type !== 'email_smtp') {
      throw new Error('Channel type does not support test operation yet');
    }

    const [params, secrets] = await Promise.all([
      this.repository.getChannelParams(id),
      this.repository.getChannelSecrets(id)
    ]);

    try {
      await this.sendSmtpTest(channel, params, secrets, input.to);
      await this.auditService.record({
        actorUserId: actor.id,
        actorEmail: actor.email,
        entity: 'channel',
        entityId: id,
        action: 'test_send',
        diff: {},
        note: `SMTP test sent to ${input.to}`
      });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.auditService.record({
        actorUserId: actor.id,
        actorEmail: actor.email,
        entity: 'channel',
        entityId: id,
        action: 'test_send',
        diff: {},
        note: `SMTP test failed for ${input.to}: ${message}`
      });
      return { success: false, error: message };
    }
  }

  private async buildParams(
    type: ChannelType,
    channelId: string,
    incoming: Record<string, string>,
    timestamp: string,
    existing: ChannelParam[] = []
  ): Promise<ChannelParam[]> {
    const definition = CHANNEL_DEFINITIONS[type];
    const currentMap = new Map(existing.map((param) => [param.key, param.value]));

    definition.params.forEach((key) => {
      const value = incoming[key] ?? currentMap.get(key) ?? '';
      currentMap.set(key, String(value));
    });

    return Array.from(currentMap.entries()).map(([key, value]) => ({
      channelId,
      key,
      value,
      updatedAt: timestamp
    }));
  }

  private async buildSecrets(
    type: ChannelType,
    channelId: string,
    incoming: Record<string, string | null | undefined>,
    timestamp: string,
    existing: ChannelSecret[]
  ): Promise<ChannelSecret[]> {
    const definition = CHANNEL_DEFINITIONS[type];
    const currentMap = new Map(existing.map((secret) => [secret.key, secret.valueCiphertext]));

    definition.secrets.forEach((key) => {
      if (incoming[key] === undefined) {
        return;
      }
      const value = incoming[key];
      if (value === null || value === '') {
        currentMap.delete(key);
      } else {
        currentMap.set(key, encryptSecret(String(value)));
      }
    });

    return Array.from(currentMap.entries()).map(([key, valueCiphertext]) => ({
      channelId,
      key,
      valueCiphertext,
      updatedAt: timestamp
    }));
  }

  private composeParamMap(type: ChannelType, params: ChannelParam[]): Record<string, string> {
    const definition = CHANNEL_DEFINITIONS[type];
    const map = new Map(params.map((param) => [param.key, param.value]));
    definition.params.forEach((key) => {
      if (!map.has(key)) {
        map.set(key, '');
      }
    });
    return Object.fromEntries(map.entries());
  }

  private composeSecretSummaries(
    type: ChannelType,
    secrets: ChannelSecret[],
    provided?: Record<string, string | null | undefined>
  ): ChannelSecretSummary[] {
    const definition = CHANNEL_DEFINITIONS[type];
    const stored = new Map(secrets.map((secret) => [secret.key, secret.valueCiphertext]));
    return definition.secrets.map((key) => ({
      key,
      hasValue:
        provided && Object.prototype.hasOwnProperty.call(provided, key)
          ? Boolean(provided[key])
          : stored.has(key)
    }));
  }

  private async sendSmtpTest(
    channel: ChannelInstance,
    params: ChannelParam[],
    secrets: ChannelSecret[],
    to: string
  ): Promise<void> {
    const paramMap = this.composeParamMap(channel.type, params);
    const secretMap = new Map(secrets.map((secret) => [secret.key, secret.valueCiphertext]));

    const sanitize = (value: string | undefined): string => value?.trim() ?? '';
    const parsePositiveNumber = (value: string | undefined, fallback: number): number => {
      if (!value) {
        return fallback;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };

    const host = sanitize(paramMap['smtp_host']);
    const port = parsePositiveNumber(paramMap['smtp_port'], 587);
    const user = sanitize(paramMap['smtp_user']);
    const fromName = sanitize(paramMap['from_name']) || 'Cert Manager';
    const fromEmail = sanitize(paramMap['from_email']) || user;
    const tlsFlag = sanitize(paramMap['tls']).toLowerCase();
    const timeout = parsePositiveNumber(paramMap['timeout_ms'], 15000);
    const encryptedPass = secretMap.get('smtp_pass');
    const pass = encryptedPass ? decryptSecret(encryptedPass) : undefined;

    if (!host) {
      throw new Error('Configuração SMTP ausente: host obrigatório');
    }
    if (!port) {
      throw new Error('Configuração SMTP ausente ou inválida: porta');
    }
    if (!fromEmail) {
      throw new Error('Configuração SMTP ausente: from_email obrigatório');
    }

    const useTls = tlsFlag === 'on';

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: useTls || port === 465,
      requireTLS: useTls,
      auth: user ? { user, pass } : undefined,
      connectionTimeout: timeout,
      greetingTimeout: timeout,
      socketTimeout: timeout
    });

    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    await transporter.sendMail({
      from,
      to,
      subject: 'Teste de SMTP',
      text: 'Teste de SMTP realizado com sucesso pelo Cert Manager.'
    });
  }
}
