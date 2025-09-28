import { Router } from 'express';
import { auditService } from '../services/container';

export const auditController = Router();

auditController.get('/', async (req, res) => {
  const logs = await auditService.list({
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    entity: req.query.entity ? String(req.query.entity) : undefined,
    entityId: req.query.entity_id ? String(req.query.entity_id) : undefined,
    actorUserId: req.query.actor ? String(req.query.actor) : undefined,
    action: req.query.action ? String(req.query.action) : undefined,
    from: req.query.from ? String(req.query.from) : undefined,
    to: req.query.to ? String(req.query.to) : undefined,
    query: req.query.q ? String(req.query.q) : undefined
  });
  res.json(logs);
});
