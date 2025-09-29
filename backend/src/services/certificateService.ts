import { v4 as uuid } from 'uuid';
import {
  AuditActor,
  Certificate,
  CertificateStatus,
  CertificateChannelLink
} from '../domain/types';
import { CertificateRepository, ChannelRepository } from '../repositories/interfaces';
import { AuditService } from './auditService';
import { normalizeEmailList, sanitizeString } from '../utils/validators';

const DISABLED_ALERT_MODEL_ID = 'disabled';

export interface CertificateInput {
  name: string;
  ownerEmail: string;
  issuedAt: string;
  expiresAt: string;
  status?: CertificateStatus;
  alertModelId?: string;
  notes?: string;
  channelIds?: string[];
}

export class CertificateService {
  constructor(
    private readonly certificateRepository: CertificateRepository,
    private readonly auditService: AuditService,
    private readonly channelRepository: ChannelRepository
  ) {}

  async list(): Promise<Certificate[]> {
    return this.certificateRepository.listCertificates();
  }

  async get(id: string): Promise<Certificate | null> {
    return this.certificateRepository.getCertificate(id);
  }

  async create(input: CertificateInput, actor: AuditActor): Promise<Certificate> {
    const sanitizedChannelIds = this.normalizeChannelIds(input.channelIds);
    const { valid: validChannelIds, invalid: invalidChannelIds } = await this.validateChannelIds(
      sanitizedChannelIds
    );
    if (invalidChannelIds.length) {
      throw new Error(
        `Alguns canais selecionados não estão disponíveis: ${invalidChannelIds.join(', ')}`
      );
    }

    const certificate: Certificate = {
      id: uuid(),
      name: this.normalizeCertificateName(input.name),
      ownerEmail: this.normalizeOwnerEmail(input.ownerEmail),
      issuedAt: this.normalizeDate(input.issuedAt, 'issued_at'),
      expiresAt: this.normalizeDate(input.expiresAt, 'expires_at'),
      status: this.parseStatus(input.status, 'active'),
      alertModelId: this.normalizeOptionalString(input.alertModelId),
      notes: this.normalizeNotes(input.notes),
      channelIds: validChannelIds
    };

    await this.certificateRepository.createCertificate(certificate);
    await this.syncChannels(certificate.id, certificate.channelIds, actor);
    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'certificate',
      entityId: certificate.id,
      action: 'create',
      diff: { name: { new: certificate.name } },
      ip: actor.ip,
      userAgent: actor.userAgent
    });

    return certificate;
  }

  async update(
    id: string,
    input: Partial<CertificateInput>,
    actor: AuditActor
  ): Promise<Certificate> {
    const current = await this.get(id);
    if (!current) {
      throw new Error('Certificate not found');
    }

    const sanitizedUpdates: Partial<CertificateInput> = {};

    if (input.name !== undefined) {
      sanitizedUpdates.name = this.normalizeCertificateName(input.name);
    }
    if (input.ownerEmail !== undefined) {
      sanitizedUpdates.ownerEmail = this.normalizeOwnerEmail(input.ownerEmail);
    }
    if (input.issuedAt !== undefined) {
      sanitizedUpdates.issuedAt = this.normalizeDate(input.issuedAt, 'issued_at');
    }
    if (input.expiresAt !== undefined) {
      sanitizedUpdates.expiresAt = this.normalizeDate(input.expiresAt, 'expires_at');
    }
    if (input.status !== undefined) {
      sanitizedUpdates.status = this.parseStatus(input.status, current.status);
    }
    const alertModelIdProvided = input.alertModelId !== undefined;
    if (alertModelIdProvided) {
      sanitizedUpdates.alertModelId = this.normalizeOptionalString(input.alertModelId);
    }
    if (input.notes !== undefined) {
      sanitizedUpdates.notes = this.normalizeNotes(input.notes);
    }
    let channelIdsToSync: string[] | undefined;
    if (input.channelIds !== undefined) {
      const normalizedChannelIds = this.normalizeChannelIds(input.channelIds);
      const { valid, invalid } = await this.validateChannelIds(normalizedChannelIds);
      if (invalid.length) {
        throw new Error(`Alguns canais selecionados não estão disponíveis: ${invalid.join(', ')}`);
      }
      sanitizedUpdates.channelIds = valid;
      channelIdsToSync = valid;
    }

    const updated = await this.certificateRepository.updateCertificate(id, {
      ...sanitizedUpdates,
      channelIds: channelIdsToSync ?? current.channelIds
    });

    if (channelIdsToSync !== undefined) {
      await this.syncChannels(id, channelIdsToSync, actor);
    }

    const diff: Record<string, { old?: unknown; new?: unknown }> = {};
    if (sanitizedUpdates.name) {
      diff.name = { old: current.name, new: sanitizedUpdates.name };
    }
    if (channelIdsToSync !== undefined) {
      diff.channelIds = { old: current.channelIds, new: channelIdsToSync };
    }
    if (alertModelIdProvided && sanitizedUpdates.alertModelId !== current.alertModelId) {
      diff.alertModelId = { old: current.alertModelId, new: sanitizedUpdates.alertModelId };
    }

    let note: string | undefined;
    if (
      alertModelIdProvided &&
      sanitizedUpdates.alertModelId === DISABLED_ALERT_MODEL_ID &&
      current.alertModelId !== DISABLED_ALERT_MODEL_ID
    ) {
      note = 'Modelo de alerta configurado como desabilitado para este certificado.';
    }

    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'certificate',
      entityId: id,
      action: 'update',
      diff,
      ip: actor.ip,
      userAgent: actor.userAgent,
      note
    });

    return updated;
  }

  async delete(id: string, actor: AuditActor): Promise<void> {
    await this.certificateRepository.deleteCertificate(id);
    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'certificate',
      entityId: id,
      action: 'delete',
      diff: {},
      ip: actor.ip,
      userAgent: actor.userAgent
    });
  }

  async getChannelLinks(id: string): Promise<CertificateChannelLink[]> {
    return this.certificateRepository.getCertificateChannels(id);
  }

  async setChannelLinks(id: string, channelIds: string[], actor: AuditActor): Promise<void> {
    const normalizedChannelIds = this.normalizeChannelIds(channelIds);
    const { valid, invalid } = await this.validateChannelIds(normalizedChannelIds);
    if (invalid.length) {
      throw new Error(`Alguns canais selecionados não estão disponíveis: ${invalid.join(', ')}`);
    }
    await this.syncChannels(id, valid, actor);
    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'certificate',
      entityId: id,
      action: 'update',
      diff: { channelIds: { old: 'replaced', new: valid } },
      ip: actor.ip,
      userAgent: actor.userAgent
    });
  }

  private normalizeCertificateName(value: string): string {
    const normalized = sanitizeString(value);
    if (!normalized) {
      throw new Error('Nome do certificado é obrigatório.');
    }
    return normalized;
  }

  private normalizeOwnerEmail(value: string): string {
    const normalized = normalizeEmailList(value, 'owner_email');
    if (!normalized) {
      throw new Error('owner_email é obrigatório.');
    }
    return normalized;
  }

  private normalizeDate(value: string, fieldName: string): string {
    const normalized = sanitizeString(value);
    if (!normalized) {
      throw new Error(`O campo ${fieldName} é obrigatório.`);
    }
    if (Number.isNaN(Date.parse(normalized))) {
      throw new Error(`O campo ${fieldName} deve ser uma data ISO válida.`);
    }
    return normalized;
  }

  private normalizeOptionalString(value?: string): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    const normalized = sanitizeString(value);
    return normalized || undefined;
  }

  private normalizeNotes(value?: string): string | undefined {
    return this.normalizeOptionalString(value);
  }

  private normalizeChannelIds(channelIds?: string[]): string[] {
    if (!channelIds) {
      return [];
    }
    return channelIds.map((id) => sanitizeString(id)).filter((id) => id.length > 0);
  }

  private parseStatus(value: unknown, fallback: CertificateStatus): CertificateStatus {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    if (value === 'active' || value === 'expired' || value === 'revoked') {
      return value;
    }
    throw new Error('Status de certificado inválido.');
  }

  private async syncChannels(
    certificateId: string,
    channelIds: string[],
    actor: AuditActor
  ): Promise<void> {
    const links: CertificateChannelLink[] = channelIds.map((channelId) => ({
      certificateId,
      channelId,
      linkedAt: new Date().toISOString(),
      linkedByUserId: actor.id
    }));
    await this.certificateRepository.setCertificateChannels(certificateId, links);
  }

  private async validateChannelIds(channelIds: string[]): Promise<{
    valid: string[];
    invalid: string[];
  }> {
    if (!channelIds.length) {
      return { valid: [], invalid: [] };
    }

    const channels = await this.channelRepository.listChannels();
    const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
    const valid: string[] = [];
    const invalid: string[] = [];
    const seen = new Set<string>();

    for (const channelId of channelIds) {
      if (seen.has(channelId)) {
        continue;
      }
      seen.add(channelId);

      const channel = channelMap.get(channelId);
      if (!channel || channel.deleted || !channel.enabled) {
        invalid.push(channelId);
      } else {
        valid.push(channelId);
      }
    }

    return { valid, invalid };
  }
}
