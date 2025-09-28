import assert from 'assert';
import { authorizeRoles } from '../src/middlewares/authorizeRoles';
import { AuthenticatedRequest } from '../src/middlewares/authMiddleware';
import { Response } from 'express';

type Result = { status?: number; message?: string; nextCalled?: boolean };

const createResponse = (): [Result, Response] => {
  const result: Result = {};
  const res: Partial<Response> = {
    status(code: number) {
      result.status = code;
      return this as Response;
    },
    json(payload: any) {
      result.message = payload?.message;
      return this as Response;
    }
  };
  return [result, res as Response];
};

(async () => {
  const middleware = authorizeRoles('admin', 'editor');
  const req = { user: { id: '1', email: 'a@example.com', name: 'Admin', role: 'admin', status: 'active', mfaEnabled: false } } as AuthenticatedRequest;
  const [result, res] = createResponse();
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });
  assert.strictEqual(nextCalled, true, 'Next should be called for allowed role');
  assert.strictEqual(result.status, undefined);

  const viewerReq = { user: { id: '2', email: 'v@example.com', name: 'Viewer', role: 'viewer', status: 'active', mfaEnabled: false } } as AuthenticatedRequest;
  const [blockedResult, blockedRes] = createResponse();
  middleware(viewerReq, blockedRes, () => {
    throw new Error('Should not call next');
  });
  assert.strictEqual(blockedResult.status, 403, 'Viewer should be blocked');
  assert.strictEqual(blockedResult.message, 'Permissão negada');

  console.log('authorizeRoles.test.ts passed');
})();
