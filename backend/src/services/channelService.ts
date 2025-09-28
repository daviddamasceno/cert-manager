import { v4 as uuid } from 'uuid';
import {
  ChannelInstance,
  ChannelParam,
  ChannelSecret,
  ChannelType
} from '../domain/types';
import { ChannelRepository } from '../repositories/interfaces';
import { encryptSecret } from '../utils/crypto';
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
      const paramMap: Record<string, string> = {};
      params.forEach((param) => {
        paramMap[param.key] = param.value;
      });
      const secretSummaries: ChannelSecretSummary[] = secrets.map((secret) => ({
        key: secret.key,
        hasValue: Boolean(secret.valueCiphertext)
      }));

      responses.push({
        channel,
        params: paramMap,
        secrets: secretSummaries
      });
    }

    responses.sort((a, b) => b.channel.createdAt.localeCompare(a.channel.createdAt));
    return responses;
  }

  async create(input: ChannelInput, actor: { id: string; email: string }): Promise<ChannelResponse> {
    const id = uuid();
    const timestamp = nowIso();
    const type = input.type;

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
      params: Object.fromEntries(params.map((p) => [p.key, p.value])),
      secrets: CHANNEL_DEFINITIONS[type].secrets.map((key) => ({ key, hasValue: Boolean(input.secrets?.[key]) }))
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

    const channel: ChannelInstance = {
      ...existing,
      name: input.name ?? existing.name,
      type: input.type ?? existing.type,
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
    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'channel',
      entityId: id,
      action: 'update',
      diff: {
        name: input.name ? { old: existing.name, new: input.name } : undefined,
        enabled: input.enabled !== undefined ? { old: existing.enabled, new: input.enabled } : undefined
      }
    });

    return {
      channel,
      params: Object.fromEntries(params.map((p) => [p.key, p.value])),
      secrets: secrets.map((secret) => ({ key: secret.key, hasValue: Boolean(secret.valueCiphertext) }))
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
      if (incoming[key] !== undefined) {
        currentMap.set(key, String(incoming[key]));
      }
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
}
