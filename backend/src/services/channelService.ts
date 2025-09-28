import { v4 as uuid } from 'uuid';
import nodemailer from 'nodemailer';
import axios from 'axios';
import { AuditActor, ChannelInstance, ChannelParam, ChannelSecret, ChannelType } from '../domain/types';
import { ChannelRepository } from '../repositories/interfaces';
import { decryptSecret, encryptSecret } from '../utils/crypto';
import {
  assertValidEmail,
  assertValidHostname,
  assertValidHttpUrl,
  assertValidPort,
  assertValidPositiveInteger,
  sanitizeString
} from '../utils/validators';
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

export interface ChannelNotificationPayload {
  subject?: string;
  message: string;
  email?: {
    to: string[];
  };
}

export interface ChannelNotificationMetadata {
  certificateId?: string;
  certificateName?: string;
}

export interface ChannelNotificationResult {
  channel: ChannelInstance;
  destination: string;
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

  async create(input: ChannelInput, actor: AuditActor): Promise<ChannelResponse> {
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
      },
      ip: actor.ip,
      userAgent: actor.userAgent
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
    actor: AuditActor
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
      diff,
      ip: actor.ip,
      userAgent: actor.userAgent
    });

    return {
      channel,
      params: this.composeParamMap(channel.type, params),
      secrets: this.composeSecretSummaries(channel.type, secrets, input.secrets)
    };
  }

  async softDelete(id: string, actor: AuditActor): Promise<void> {
    await this.repository.softDeleteChannel(id, nowIso());
    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'channel',
      entityId: id,
      action: 'delete',
      diff: {},
      ip: actor.ip,
      userAgent: actor.userAgent
    });
  }

  async testChannel(
    id: string,
    input: Record<string, unknown>,
    actor: AuditActor
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
      const payload: ChannelNotificationPayload =
        channel.type === 'email_smtp'
          ? {
              subject: 'Teste de SMTP',
              message: 'Teste de SMTP realizado com sucesso pelo Cert Manager.',
              email: { to: [this.extractEmailRecipient(input)] }
            }
          : { message: `Teste de integracao: ${channel.name}` };

      destinationDescription = await this.deliverMessage(channel, paramMap, secretMap, payload);

      await this.auditService.record({
        actorUserId: actor.id,
        actorEmail: actor.email,
        entity: 'channel',
        entityId: id,
        action: 'test_send',
        diff: {},
        note: `${channel.type} test sent to ${destinationDescription}`,
        ip: actor.ip,
        userAgent: actor.userAgent
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
        note: `${channel.type} test failed${destinationDescription ? ` for ${destinationDescription}` : ''}: ${message}`,
        ip: actor.ip,
        userAgent: actor.userAgent
      });
      return { success: false, error: message };
    }
  }

  async notifyChannel(
    id: string,
    payload: ChannelNotificationPayload,
    actor: AuditActor,
    metadata?: ChannelNotificationMetadata
  ): Promise<ChannelNotificationResult> {
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

    try {
      const destination = await this.deliverMessage(channel, paramMap, secretMap, payload);
      await this.recordNotificationAudit(channel, actor, destination, metadata);
      return { channel, destination };
    } catch (error) {
      const message = this.extractErrorMessage(error);
      await this.recordNotificationAudit(channel, actor, undefined, metadata, message);
      throw new Error(message);
    }
  }

  private async deliverMessage(
    channel: ChannelInstance,
    paramMap: Record<string, string>,
    secretMap: Map<string, string>,
    payload: ChannelNotificationPayload
  ): Promise<string> {
    const message = payload.message?.trim();
    if (!message) {
      throw new Error('Mensagem do canal nao pode ser vazia');
    }

    switch (channel.type) {
      case 'email_smtp': {
        const recipients =
          payload.email?.to?.map((email) => sanitizeString(email)).filter((email) => email.length > 0) ?? [];
        if (!recipients.length) {
          throw new Error('Nenhum destinatario de email informado');
        }
        recipients.forEach((recipient) => assertValidEmail(recipient, 'email_to'));
        const subject = payload.subject?.trim() || `Alerta: ${channel.name}`;
        await this.sendEmailMessage(channel, paramMap, secretMap, {
          to: recipients,
          subject,
          text: message
        });
        return `email ${recipients.join(', ')}`;
      }
      case 'telegram_bot':
        return await this.sendTelegramMessage(channel, paramMap, secretMap, message);
      case 'slack_webhook':
        return await this.sendSlackMessage(channel, paramMap, secretMap, message);
      case 'googlechat_webhook':
        return await this.sendGoogleChatMessage(channel, paramMap, secretMap, message);
      default:
        throw new Error(`Unsupported channel type: ${channel.type}`);
    }
  }

  private async recordNotificationAudit(
    channel: ChannelInstance,
    actor: AuditActor,
    destination: string | undefined,
    metadata: ChannelNotificationMetadata | undefined,
    errorMessage?: string
  ): Promise<void> {
    const parts: string[] = [];
    if (errorMessage) {
      parts.push(
        `${channel.type} notification failed${destination ? ` for ${destination}` : ''}: ${errorMessage}`
      );
    } else {
      parts.push(`${channel.type} notification sent to ${destination ?? 'destino desconhecido'}`);
    }
    if (metadata?.certificateName) {
      parts.push(`certificate=${metadata.certificateName}`);
    }
    if (metadata?.certificateId) {
      parts.push(`certificate_id=${metadata.certificateId}`);
    }

    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'channel',
      entityId: channel.id,
      action: 'notification_sent',
      diff: {},
      note: parts.join(' | '),
      ip: actor.ip,
      userAgent: actor.userAgent
    });
  }

  private extractEmailRecipient(input: Record<string, unknown>): string {
    const toRaw = [input['to'], input['to_email']]
      .map((value) => sanitizeString(value))
      .find((value) => value.length > 0);
    if (!toRaw) {
      throw new Error('Parametro to_email obrigatorio');
    }
    assertValidEmail(toRaw, 'to_email');
    return toRaw;
  }

  private async sendEmailMessage(
    channel: ChannelInstance,
    paramMap: Record<string, string>,
    secretMap: Map<string, string>,
    options: { to: string[]; subject: string; text: string }
  ): Promise<void> {
    const host = this.sanitize(paramMap['smtp_host']);
    const port = this.parsePositiveNumber(paramMap['smtp_port'], 587);
    const user = this.sanitize(paramMap['smtp_user']);
    const fromName = this.sanitize(paramMap['from_name']) || channel.name || 'Cert Manager';
    const fromEmail = this.sanitize(paramMap['from_email']) || user;
    const tlsFlag = this.sanitize(paramMap['tls']).toLowerCase();
    const timeout = this.parsePositiveNumber(paramMap['timeout_ms'], 15000);
    const encryptedPass = secretMap.get('smtp_pass');
    const pass = encryptedPass ? decryptSecret(encryptedPass) : undefined;

    if (!host) {
      throw new Error('Configuracao SMTP ausente: host obrigatorio');
    }
    if (!port) {
      throw new Error('Configuracao SMTP ausente ou invalida: porta');
    }
    if (!fromEmail) {
      throw new Error('Configuracao SMTP ausente: from_email obrigatorio');
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
      to: options.to.join(', '),
      subject: options.subject,
      text: options.text
    });
  }

  private async sendTelegramMessage(
    channel: ChannelInstance,
    paramMap: Record<string, string>,
    secretMap: Map<string, string>,
    message: string
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
      throw new Error('Token do bot nao configurado.');
    }
    const token = decryptSecret(tokenCipher);

    const timeout = this.parsePositiveNumber(paramMap['timeout_ms'], 15000);
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

  private async sendSlackMessage(
    channel: ChannelInstance,
    paramMap: Record<string, string>,
    secretMap: Map<string, string>,
    message: string
  ): Promise<string> {
    const webhookCipher = secretMap.get('webhook_url');
    if (!webhookCipher) {
      throw new Error('Webhook URL nao configurado.');
    }
    const webhookUrl = decryptSecret(webhookCipher);
    const channelOverride = paramMap['channel_override']?.trim();
    const timeout = this.parsePositiveNumber(paramMap['timeout_ms'], 15000);

    const payload: Record<string, unknown> = { text: message };
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

  private async sendGoogleChatMessage(
    channel: ChannelInstance,
    paramMap: Record<string, string>,
    secretMap: Map<string, string>,
    message: string
  ): Promise<string> {
    const webhookCipher = secretMap.get('webhook_url');
    if (!webhookCipher) {
      throw new Error('Webhook do Google Chat nao configurado.');
    }
    const webhookUrl = decryptSecret(webhookCipher);
    const spaceName = paramMap['space_name']?.trim();
    const timeout = this.parsePositiveNumber(paramMap['timeout_ms'], 15000);

    await this.executeWithRetry(async () => {
      await axios.post(
        webhookUrl,
        { text: message },
        { timeout, headers: { 'Content-Type': 'application/json' } }
      );
    });

    return spaceName ? `Google Chat space ${spaceName}` : 'Google Chat webhook padrao';
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
      if ((error as { code?: string }).code === 'ECONNABORTED') {
        return 'Tempo limite excedido ao contatar o servico externo';
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
      if (Object.prototype.hasOwnProperty.call(incoming, key)) {
        currentMap.set(key, sanitizeString(incoming[key]));
        return;
      }
      if (currentMap.has(key)) {
        currentMap.set(key, sanitizeString(currentMap.get(key)));
        return;
      }
      currentMap.set(key, '');
    });

    this.validateChannelParams(type, currentMap);

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
      if (!Object.prototype.hasOwnProperty.call(incoming, key)) {
        return;
      }

      const value = incoming[key];
      if (value === null || value === undefined) {
        currentMap.delete(key);
        return;
      }

      const sanitized = sanitizeString(value);
      if (!sanitized) {
        currentMap.delete(key);
        return;
      }

      this.validateChannelSecret(type, key, sanitized);
      currentMap.set(key, encryptSecret(sanitized));
    });

    return Array.from(currentMap.entries()).map(([key, valueCiphertext]) => ({
      channelId,
      key,
      valueCiphertext,
      updatedAt: timestamp
    }));
  }

  private validateChannelParams(type: ChannelType, params: Map<string, string>): void {
    const timeout = params.get('timeout_ms');
    if (timeout) {
      assertValidPositiveInteger(timeout, 'timeout_ms');
    }

    switch (type) {
      case 'email_smtp': {
        const host = params.get('smtp_host');
        if (host) {
          assertValidHostname(host, 'smtp_host');
        }
        const port = params.get('smtp_port');
        if (port) {
          assertValidPort(port, 'smtp_port');
        }
        const fromEmail = params.get('from_email');
        if (fromEmail) {
          assertValidEmail(fromEmail, 'from_email');
        }
        const tls = params.get('tls');
        if (tls && tls !== 'on' && tls !== 'off') {
          throw new Error('O campo tls deve ser "on" ou "off".');
        }
        break;
      }
      case 'telegram_bot': {
        const chatIdsRaw = params.get('chat_ids');
        if (chatIdsRaw) {
          const ids = chatIdsRaw
            .split(',')
            .map((value) => sanitizeString(value))
            .filter((value) => value.length > 0);
          if (!ids.length) {
            throw new Error('Informe pelo menos um chat_id para o canal do Telegram.');
          }
          params.set('chat_ids', ids.join(','));
        }
        break;
      }
      default:
        break;
    }
  }

  private validateChannelSecret(type: ChannelType, key: string, value: string): void {
    if (key === 'webhook_url') {
      assertValidHttpUrl(value, key);
      return;
    }

    if (type === 'email_smtp' && key === 'smtp_pass') {
      return;
    }

    if (type === 'telegram_bot' && key === 'bot_token') {
      return;
    }

    if (!value) {
      throw new Error(`O segredo ${key} não pode ser vazio.`);
    }
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

  private sanitize(value: string | undefined): string {
    return value?.trim() ?? '';
  }
}
