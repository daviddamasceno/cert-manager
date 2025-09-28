import { Router } from 'express';
import { authController } from '../controllers/authController';
import { certificateController } from '../controllers/certificateController';
import { alertModelController } from '../controllers/alertModelController';
import { systemController } from '../controllers/systemController';
import { settingsController } from '../controllers/settingsController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { auditController } from '../controllers/auditController';
import { channelController } from '../controllers/channelController';

export const router = Router();

router.use('/auth', authController);
router.use('/certificates', authMiddleware, certificateController);
router.use('/alert-models', authMiddleware, alertModelController);
router.use('/channels', authMiddleware, channelController);
router.use('/settings', authMiddleware, settingsController);
router.use('/audit-logs', authMiddleware, auditController);
router.use('/', systemController);
