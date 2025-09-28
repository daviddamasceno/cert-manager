export type CertificateStatus = 'active' | 'expired' | 'revoked';

export type ChannelType =
  | 'email_smtp'
  | 'telegram_bot'
  | 'slack_webhook'
  | 'googlechat_webhook';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'test_send'
  | 'link'
  | 'unlink'
  | 'notification_sent'
  | 'user_create'
  | 'user_update'
  | 'user_disable'
  | 'user_password_reset';

export interface Certificate {
  id: string;
  name: string;
  ownerEmail: string;
  issuedAt: string;
  expiresAt: string;
  status: CertificateStatus;
  alertModelId?: string;
  notes?: string;
  channelIds: string[];
}

export interface AlertModel {
  id: string;
  name: string;
  offsetDaysBefore: number;
  offsetDaysAfter?: number;
  repeatEveryDays?: number;
  templateSubject: string;
  templateBody: string;
}

export interface ChannelInstance {
  id: string;
  name: string;
  type: ChannelType;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelParam {
  channelId: string;
  key: string;
  value: string;
  updatedAt: string;
}

export interface ChannelSecret {
  channelId: string;
  key: string;
  valueCiphertext: string;
  updatedAt: string;
}

export interface CertificateChannelLink {
  certificateId: string;
  channelId: string;
  linkedAt: string;
  linkedByUserId: string;
}

export interface AuditLog {
  timestamp: string;
  actorUserId: string;
  actorEmail: string;
  entity: string;
  entityId: string;
  action: AuditAction;
  diffJson: string;
  ip?: string;
  userAgent?: string;
  note?: string;
}

export type UserStatus = 'active' | 'inactive' | 'disabled';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface UserCredentials {
  userId: string;
  passwordHash: string;
  passwordUpdatedAt: string;
  passwordNeedsReset: boolean;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  issuedAt: string;
  expiresAt: string;
  userAgent?: string;
  ip?: string;
  revoked: boolean;
}

export interface NotificationContext {
  certificate: Certificate;
  alertModel: AlertModel;
  daysLeft: number;
  channel: ChannelInstance;
}
