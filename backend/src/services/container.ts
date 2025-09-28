import { GoogleSheetsRepository } from '../repositories/googleSheetsRepository';
import { NotificationService } from './notificationService';
import { CertificateService } from './certificateService';
import { AlertModelService } from './alertModelService';
import { AuditService } from './auditService';
import { ChannelService } from './channelService';
import { AuthService } from './authService';
import { UserService } from './userService';

const sheetsRepository = new GoogleSheetsRepository();

export const auditService = new AuditService(sheetsRepository);
export const channelService = new ChannelService(sheetsRepository, auditService);
export const certificateService = new CertificateService(
  sheetsRepository,
  auditService,
  sheetsRepository
);
export const alertModelService = new AlertModelService(sheetsRepository, auditService);
export const notificationService = new NotificationService(auditService, channelService);
export const authService = new AuthService(
  sheetsRepository,
  sheetsRepository,
  sheetsRepository,
  auditService
);
export const userService = new UserService(sheetsRepository, sheetsRepository, auditService);

export const initializeServices = (): void => {
  // reserved for future initialisation (plugins, caches, etc.)
};
