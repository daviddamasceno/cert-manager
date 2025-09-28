import { GoogleSheetsRepository } from '../repositories/googleSheetsRepository';
import { NotificationService } from './notificationService';
import { CertificateService } from './certificateService';
import { AlertModelService } from './alertModelService';
import { AuditService } from './auditService';
import { ChannelService } from './channelService';
import { AuthService } from './authService';

const sheetsRepository = new GoogleSheetsRepository();

export const auditService = new AuditService(sheetsRepository);
export const channelService = new ChannelService(sheetsRepository, auditService);
export const certificateService = new CertificateService(sheetsRepository, auditService);
export const alertModelService = new AlertModelService(sheetsRepository);
export const notificationService = new NotificationService(auditService, channelService);
export const authService = new AuthService(sheetsRepository, sheetsRepository, sheetsRepository);

export const initializeServices = (): void => {
  // reserved for future initialisation (plugins, caches, etc.)
};
