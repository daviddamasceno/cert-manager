import { v4 as uuid } from 'uuid';
import nodemailer from 'nodemailer';
import axios from 'axios';
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
    params: ['chat_ids', 'timeout_ms'],
    secrets: ['bot_token']
  },
  slack_webhook: {
    params: ['channel_override', 'timeout_ms'],
    secrets: ['webhook_url']
  },
  googlechat_webhook: {
    params: ['space_name', 'timeout_ms'],
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
    input: Record<string, unknown>,
    actor: { id: string; email: string }
  ): Promise<ChannelTestResult> {
    const channel = await this.repository.getChannel(id);
    if (!channel) {
      throw new Error('Channel not found');
    }

    if (!channel.enabled) {
      throw new Error('Channel disabled');
    }

    const [params, secrets] = await Promise.all([
      this.repository.getChannelParams(id),
      this.repository.getChannelSecrets(id)
    ]);

    const paramMap = this.composeParamMap(channel.type, params);
    const secretMap = new Map(secrets.map((secret) => [secret.key, secret.valueCiphertext]));
    let destinationDescription = '';

    try {
      switch (channel.type) {
        case 'email_smtp': {
          const to = this.extractEmailRecipient(input);
          destinationDescription = `email ${to}`;
          await this.sendSmtpTest(channel, params, secrets, to);
          break;
        }
        case 'telegram_bot': {
          destinationDescription = await this.sendTelegramTest(channel, paramMap, secretMap);
          break;
        }
        case 'slack_webhook': {
          destinationDescription = await this.sendSlackTest(channel, paramMap, secretMap);
          break;
        }
        case 'googlechat_webhook': {
          destinationDescription = await this.sendGoogleChatTest(channel, paramMap, secretMap);
          break;
        }
        default:
          throw new Error('Channel type does not support test operation yet');
      }

      await this.auditService.record({
        actorUserId: actor.id,
        actorEmail: actor.email,
        entity: 'channel',
        entityId: id,
        action: 'test_send',
        diff: {},
        note: `${channel.type} test sent to ${destinationDescription}`
      });
      return { success: true };
    } catch (error) {
      const message = this.extractErrorMessage(error);
      await this.auditService.record({
        actorUserId: actor.id,
        actorEmail: actor.email,
        entity: 'channel',
        entityId: id,
        action: 'test_send',
        diff: {},
        note: `${channel.type} test failed${destinationDescription ? ` for ${destinationDescription}` : ''}: ${message}`
      });
      return { success: false, error: message };
    }
  }

  private extractEmailRecipient(input: Record<string, unknown>): string {
    const toRaw = [input['to'], input['to_email']]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .find((value) => value.length > 0);
    if (!toRaw) {
      throw new Error('Parâmetro to_email obrigatório');
    }
    return toRaw;
  }

  private async sendTelegramTest(
    channel: ChannelInstance,
    paramMap: Record<string, string>,
    secretMap: Map<string, string>
  ): Promise<string> {
    const chatIds = paramMap['chat_ids']
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (chatIds.length === 0) {
      throw new Error('Nenhum chat_id configurado. Atualize o canal antes de testar.');
    }

    const tokenCipher = secretMap.get('bot_token');
    if (!tokenCipher) {
      throw new Error('Token do bot não configurado.');
    }
    const token = decryptSecret(tokenCipher);

    const timeout = this.parsePositiveNumber(paramMap['timeout_ms'], 15000);
    const message = `Teste de integração: ${channel.name}`;
    const baseUrl = `https://api.telegram.org/bot${token}`;

    for (const chatId of chatIds) {
      await this.executeWithRetry(async () => {
        const response = await axios.post(
          `${baseUrl}/sendMessage`,
          { chat_id: chatId, text: message },
          { timeout }
        );
        if (!response.data?.ok) {
          const description = response.data?.description || 'Falha ao enviar mensagem ao Telegram';
          throw new Error(description);
        }
      });
    }

    return `Telegram chats: ${chatIds.join(', ')}`;
  }

  private async sendSlackTest(
    channel: ChannelInstance,
    paramMap: Record<string, string>,
    secretMap: Map<string, string>
  ): Promise<string> {
    const webhookCipher = secretMap.get('webhook_url');
    if (!webhookCipher) {
      throw new Error('Webhook URL não configurado.');
    }
    const webhookUrl = decryptSecret(webhookCipher);
    const channelOverride = paramMap['channel_override']?.trim();
    const timeout = this.parsePositiveNumber(paramMap['timeout_ms'], 15000);

    const payload: Record<string, unknown> = {
      text: `Teste de integração: ${channel.name}`
    };
    if (channelOverride) {
      payload.channel = channelOverride;
    }

    await this.executeWithRetry(async () => {
      const response = await axios.post(webhookUrl, payload, {
        timeout,
        headers: { 'Content-Type': 'application/json' }
      });
      if (typeof response.data === 'string' && response.data !== 'ok') {
        throw new Error(response.data);
      }
    });

    return channelOverride
      ? `Slack channel ${channelOverride}`
      : 'Slack default webhook destination';
  }

  private async sendGoogleChatTest(
    channel: ChannelInstance,
    paramMap: Record<string, string>,
    secretMap: Map<string, string>
  ): Promise<string> {
    const webhookCipher = secretMap.get('webhook_url');
    if (!webhookCipher) {
      throw new Error('Webhook do Google Chat não configurado.');
    }
    const webhookUrl = decryptSecret(webhookCipher);
    const spaceName = paramMap['space_name']?.trim();
    const timeout = this.parsePositiveNumber(paramMap['timeout_ms'], 15000);

    await this.executeWithRetry(async () => {
      await axios.post(
        webhookUrl,
        { text: `Teste de integração: ${channel.name}` },
        { timeout, headers: { 'Content-Type': 'application/json' } }
      );
    });

    return spaceName ? `Google Chat space ${spaceName}` : 'Google Chat webhook padrão';
  }

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    const maxAttempts = 3;
    let attempt = 0;
    let delayMs = 200;

    while (true) {
      try {
        return await fn();
      } catch (error) {
        attempt += 1;
        if (attempt >= maxAttempts) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2;
      }
    }
  }

  private parsePositiveNumber(value: string | undefined, fallback: number): number {
    if (!value) {
      return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private extractErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const responseData = error.response?.data;
      if (responseData) {
        if (typeof responseData === 'string') {
          return responseData;
        }
        if (typeof responseData === 'object') {
          const maybeMessage =
            (responseData as { description?: string }).description ||
            (responseData as { error?: string }).error ||
            (responseData as { message?: string }).message;
          if (maybeMessage) {
            return maybeMessage;
          }
        }
      }
      if (error.code === 'ECONNABORTED') {
        return 'Tempo limite excedido ao contatar o serviço externo';
      }
      return error.message;
    }
    return error instanceof Error ? error.message : String(error);
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

    const host = this.sanitize(paramMap['smtp_host']);
    const port = this.parsePositiveNumber(paramMap['smtp_port'], 587);
    const user = this.sanitize(paramMap['smtp_user']);
    const fromName = this.sanitize(paramMap['from_name']) || 'Cert Manager';
    const fromEmail = this.sanitize(paramMap['from_email']) || user;
    const tlsFlag = this.sanitize(paramMap['tls']).toLowerCase();
    const timeout = this.parsePositiveNumber(paramMap['timeout_ms'], 15000);
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

  private sanitize(value: string | undefined): string {
    return value?.trim() ?? '';
  }
}
