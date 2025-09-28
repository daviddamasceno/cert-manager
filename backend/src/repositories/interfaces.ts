import {
  AlertModel,
  AuditLog,
  Certificate,
  ChannelInstance,
  ChannelParam,
  ChannelSecret,
  CertificateChannelLink,
  User
} from '../domain/types';

export interface CertificateRepository {
  listCertificates(): Promise<Certificate[]>;
  getCertificate(id: string): Promise<Certificate | null>;
  createCertificate(input: Certificate): Promise<void>;
  updateCertificate(id: string, input: Partial<Certificate>): Promise<Certificate>;
  deleteCertificate(id: string): Promise<void>;
  getCertificateChannels(id: string): Promise<CertificateChannelLink[]>;
  setCertificateChannels(id: string, links: CertificateChannelLink[]): Promise<void>;
}

export interface AlertModelRepository {
  listAlertModels(): Promise<AlertModel[]>;
  getAlertModel(id: string): Promise<AlertModel | null>;
  createAlertModel(model: AlertModel): Promise<void>;
  updateAlertModel(id: string, input: Partial<AlertModel>): Promise<AlertModel>;
  deleteAlertModel(id: string): Promise<void>;
}

export interface ChannelRepository {
  listChannels(): Promise<ChannelInstance[]>;
  getChannel(id: string): Promise<ChannelInstance | null>;
  createChannel(channel: ChannelInstance, params: ChannelParam[], secrets: ChannelSecret[]): Promise<void>;
  updateChannel(channel: ChannelInstance, params: ChannelParam[], secrets: ChannelSecret[]): Promise<void>;
  softDeleteChannel(id: string, timestamp: string): Promise<void>;
  getChannelParams(id: string): Promise<ChannelParam[]>;
  getChannelSecrets(id: string): Promise<ChannelSecret[]>;
}

export interface AuditLogRepository {
  appendAuditLog(entry: AuditLog): Promise<void>;
  listAuditLogs(options: {
    limit?: number;
    entity?: string;
    entityId?: string;
    actorUserId?: string;
    action?: string;
    from?: string;
    to?: string;
    query?: string;
  }): Promise<AuditLog[]>;
}

export interface UserRepository {
  getUserByEmail(email: string): Promise<User | null>;
  createUser(user: User): Promise<void>;
  listUsers(): Promise<User[]>;
}
