import { Router } from 'express';
import { auditService } from '../services/container';

const MAX_LIMIT = 500;
const MIN_LIMIT = 1;

const parseLimit = (value: unknown): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const limit = Number(value);
  if (!Number.isFinite(limit)) {
    throw new Error('Parametro limit invalido');
  }
  if (limit < MIN_LIMIT || limit > MAX_LIMIT) {
    throw new Error(`Parametro limit deve estar entre ${MIN_LIMIT} e ${MAX_LIMIT}`);
  }
  return Math.floor(limit);
};

const parseIsoDate = (value: unknown, field: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`Parametro ${field} invalido`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Parametro ${field} invalido`);
  }
  return parsed.toISOString();
};

const parseText = (value: unknown, field: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`Parametro ${field} invalido`);
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

export const auditController = Router();

auditController.get('/', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit);
    const entity = parseText(req.query.entity, 'entity');
    const entityId = parseText(req.query.entity_id, 'entity_id');
    const actorUserId = parseText(req.query.actor, 'actor');
    const action = parseText(req.query.action, 'action');
    const query = parseText(req.query.q, 'q');
    const from = parseIsoDate(req.query.from, 'from');
    const to = parseIsoDate(req.query.to, 'to');

    const logs = await auditService.list({
      limit,
      entity,
      entityId,
      actorUserId,
      action,
      from,
      to,
      query
    });
    res.json(logs);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Parametros invalidos';
    res.status(400).json({ message });
  }
});

auditController.all('/', (_req, res) => {
  res.status(405).json({ message: 'Metodo nao permitido nesta rota' });
});


