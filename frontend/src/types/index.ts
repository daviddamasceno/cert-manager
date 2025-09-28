export type CertificateStatus = 'active' | 'expired' | 'revoked';

export type ChannelType = 'email_smtp' | 'telegram_bot' | 'slack_webhook' | 'googlechat_webhook';

export type UserRole = 'admin' | 'editor' | 'viewer';
export type UserStatus = 'active' | 'inactive' | 'disabled';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

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

export interface ChannelSummary {
  channel: ChannelInstance;
  params: Record<string, string>;
  secrets: Array<{ key: string; hasValue: boolean }>;
}

export interface AuditLog {
  timestamp: string;
  actorUserId: string;
  actorEmail: string;
  entity: string;
  entityId: string;
  action: string;
  diffJson: string;
  ip?: string;
  userAgent?: string;
  note?: string;
}

export interface SettingsResponse {
  timezone: string;
  scheduler: {
    enabled: boolean;
    hourlyCron: string;
    dailyCron: string;
  };
  sheets: {
    spreadsheetId: string;
  };
}
