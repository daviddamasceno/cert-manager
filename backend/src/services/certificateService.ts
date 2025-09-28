import { v4 as uuid } from 'uuid';
import { Certificate, CertificateStatus, CertificateChannelLink } from '../domain/types';
import { CertificateRepository } from '../repositories/interfaces';
import { AuditService } from './auditService';

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
    private readonly auditService: AuditService
  ) {}

  async list(): Promise<Certificate[]> {
    return this.certificateRepository.listCertificates();
  }

  async get(id: string): Promise<Certificate | null> {
    return this.certificateRepository.getCertificate(id);
  }

  async create(input: CertificateInput, actor: { id: string; email: string }): Promise<Certificate> {
    const certificate: Certificate = {
      id: uuid(),
      name: input.name,
      ownerEmail: input.ownerEmail,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      status: input.status || 'active',
      alertModelId: input.alertModelId,
      notes: input.notes,
      channelIds: input.channelIds || []
    };

    await this.certificateRepository.createCertificate(certificate);
    await this.syncChannels(certificate.id, certificate.channelIds, actor);
    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'certificate',
      entityId: certificate.id,
      action: 'create',
      diff: { name: { new: certificate.name } }
    });

    return certificate;
  }

  async update(
    id: string,
    input: Partial<CertificateInput>,
    actor: { id: string; email: string }
  ): Promise<Certificate> {
    const current = await this.get(id);
    if (!current) {
      throw new Error('Certificate not found');
    }

    const updated = await this.certificateRepository.updateCertificate(id, {
      ...input,
      channelIds: input.channelIds ?? current.channelIds
    });

    if (input.channelIds) {
      await this.syncChannels(id, input.channelIds, actor);
    }

    const diff: Record<string, { old?: unknown; new?: unknown }> = {};
    if (input.name) {
      diff.name = { old: current.name, new: input.name };
    }
    if (input.channelIds) {
      diff.channelIds = { old: current.channelIds, new: input.channelIds };
    }
    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'certificate',
      entityId: id,
      action: 'update',
      diff
    });

    return updated;
  }

  async delete(id: string, actor: { id: string; email: string }): Promise<void> {
    await this.certificateRepository.deleteCertificate(id);
    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'certificate',
      entityId: id,
      action: 'delete',
      diff: {}
    });
  }

  async getChannelLinks(id: string): Promise<CertificateChannelLink[]> {
    return this.certificateRepository.getCertificateChannels(id);
  }

  async setChannelLinks(
    id: string,
    channelIds: string[],
    actor: { id: string; email: string }
  ): Promise<void> {
    await this.syncChannels(id, channelIds, actor);
    await this.auditService.record({
      actorUserId: actor.id,
      actorEmail: actor.email,
      entity: 'certificate',
      entityId: id,
      action: 'update',
      diff: { channelIds: { old: 'replaced', new: channelIds } }
    });
  }

  private async syncChannels(
    certificateId: string,
    channelIds: string[],
    actor: { id: string; email: string }
  ): Promise<void> {
    const links: CertificateChannelLink[] = channelIds.map((channelId) => ({
      certificateId,
      channelId,
      linkedAt: new Date().toISOString(),
      linkedByUserId: actor.id
    }));
    await this.certificateRepository.setCertificateChannels(certificateId, links);
  }
}
