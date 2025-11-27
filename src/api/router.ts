import { Router, json } from 'express';
import type { Response, NextFunction } from 'express';
import type { RoboxLayer } from '../RoboxLayer';
import type { RoboxRequest, RoboxRouterOptions, ApiResponse } from './types';
import { TransactionType } from '../types';
import { generateApiKey } from './utils';

/**
 * Create Express router with all Robox API endpoints
 * 
 * @example
 * ```typescript
 * import express from 'express';
 * import { RoboxLayer, InMemoryStorage, createRoboxRouter } from 'robox-clearing';
 * 
 * const app = express();
 * const robox = new RoboxLayer({ storage: new InMemoryStorage() });
 * 
 * app.use('/api/v1', createRoboxRouter({ robox }));
 * app.listen(3001);
 * ```
 */
export function createRoboxRouter(options: RoboxRouterOptions): Router {
  const {
    robox,
    apiKeyHeader = 'x-api-key',
    apiKeyQuery = 'apiKey',
  } = options;

  const router = Router();

  router.use(json());

  const apiKeyAuth = async (req: RoboxRequest, res: Response, next: NextFunction) => {
    const apiKey = (req.headers[apiKeyHeader.toLowerCase()] as string) || req.query[apiKeyQuery] as string;

    if (!apiKey) {
      return res.status(401).json(errorResponse('API key required', 'AUTH_REQUIRED'));
    }

    const robot = await robox.getAccountByApiKey(apiKey);
    if (!robot) {
      return res.status(401).json(errorResponse('Invalid API key', 'INVALID_API_KEY'));
    }

    req.robot = robot;
    req.robox = robox;
    next();
  };

  router.get('/me', apiKeyAuth, async (req: RoboxRequest, res: Response) => {
    try {
      res.json(successResponse({
        id: req.robot!.id,
        name: req.robot!.name,
        balance: req.robot!.balance,
        frozenBalance: req.robot!.frozenBalance,
        status: req.robot!.status,
        roles: req.robot!.roles,
        createdAt: req.robot!.createdAt,
      }));
    } catch (error) {
      res.status(500).json(errorResponse((error as Error).message));
    }
  });

  router.get('/balance', apiKeyAuth, async (req: RoboxRequest, res: Response) => {
    try {
      const account = await robox.getRobotAccount(req.robot!.id);
      res.json(successResponse({
        balance: account!.balance,
        frozenBalance: account!.frozenBalance,
        available: account!.balance - account!.frozenBalance,
        status: account!.status,
      }));
    } catch (error) {
      res.status(500).json(errorResponse((error as Error).message));
    }
  });

  router.post('/transfer', apiKeyAuth, async (req: RoboxRequest, res: Response) => {
    try {
      const { to, amount, type, memo, idempotencyKey } = req.body;

      if (!to || !amount) {
        return res.status(400).json(errorResponse('Missing required fields: to, amount', 'VALIDATION_ERROR'));
      }

      const tx = await robox.transfer({
        from: req.robot!.id,
        to,
        amount: Number(amount),
        type: type || TransactionType.TASK_PAYMENT,
        meta: memo ? { memo } : undefined,
        initiatedBy: req.robot!.id,
        idempotencyKey,
      });

      res.json(successResponse({
        transactionId: tx.id,
        from: tx.from,
        to: tx.to,
        amount: tx.amount,
        fee: tx.fee,
        status: tx.status,
        createdAt: tx.createdAt,
      }));
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Insufficient') ? 400 : 
                     err.message.includes('not found') ? 404 : 500;
      res.status(status).json(errorResponse(err.message));
    }
  });

  router.post('/transfer/by-api-key', apiKeyAuth, async (req: RoboxRequest, res: Response) => {
    try {
      const { recipientApiKey, amount, type, memo } = req.body;

      if (!recipientApiKey || !amount) {
        return res.status(400).json(errorResponse('Missing required fields: recipientApiKey, amount', 'VALIDATION_ERROR'));
      }

      const recipient = await robox.getAccountByApiKey(recipientApiKey);
      if (!recipient) {
        return res.status(404).json(errorResponse('Recipient not found', 'NOT_FOUND'));
      }

      const tx = await robox.transfer({
        from: req.robot!.id,
        to: recipient.id,
        amount: Number(amount),
        type: type || TransactionType.TASK_PAYMENT,
        meta: memo ? { memo } : undefined,
        initiatedBy: req.robot!.id,
      });

      res.json(successResponse({
        transactionId: tx.id,
        from: tx.from,
        to: tx.to,
        amount: tx.amount,
        status: tx.status,
        createdAt: tx.createdAt,
      }));
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Insufficient') ? 400 : 500;
      res.status(status).json(errorResponse(err.message));
    }
  });

  router.post('/deduct', apiKeyAuth, async (req: RoboxRequest, res: Response) => {
    try {
      const { amount, reason } = req.body;

      if (!amount) {
        return res.status(400).json(errorResponse('Missing required field: amount', 'VALIDATION_ERROR'));
      }

      const result = await robox.debit(req.robot!.id, Number(amount), {
        reason,
        initiatedBy: req.robot!.id,
      });

      res.json(successResponse({
        operationId: result.id,
        amount: result.amount,
        balanceAfter: result.balanceAfter,
        reason: result.reason,
        createdAt: result.createdAt,
      }));
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Insufficient') ? 400 : 500;
      res.status(status).json(errorResponse(err.message));
    }
  });

  router.post('/credit', apiKeyAuth, async (req: RoboxRequest, res: Response) => {
    try {
      const { amount, reason } = req.body;

      if (!amount) {
        return res.status(400).json(errorResponse('Missing required field: amount', 'VALIDATION_ERROR'));
      }

      const result = await robox.credit(req.robot!.id, Number(amount), {
        reason,
        initiatedBy: req.robot!.id,
      });

      res.json(successResponse({
        operationId: result.id,
        amount: result.amount,
        balanceAfter: result.balanceAfter,
        reason: result.reason,
        createdAt: result.createdAt,
      }));
    } catch (error) {
      res.status(500).json(errorResponse((error as Error).message));
    }
  });

  router.get('/transactions', apiKeyAuth, async (req: RoboxRequest, res: Response) => {
    try {
      const { limit, offset, type, status } = req.query;

      const transactions = await robox.listTransactions({
        robotId: req.robot!.id,
        type: type as string,
        status: status as any,
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0,
      });

      res.json(successResponse({
        transactions: transactions.map(tx => ({
          id: tx.id,
          from: tx.from,
          to: tx.to,
          amount: tx.amount,
          fee: tx.fee,
          type: tx.type,
          status: tx.status,
          createdAt: tx.createdAt,
        })),
        count: transactions.length,
      }));
    } catch (error) {
      res.status(500).json(errorResponse((error as Error).message));
    }
  });

  router.get('/transactions/:txId', apiKeyAuth, async (req: RoboxRequest, res: Response) => {
    try {
      const tx = await robox.getTransaction(req.params.txId);

      if (!tx) {
        return res.status(404).json(errorResponse('Transaction not found', 'NOT_FOUND'));
      }

      if (tx.from !== req.robot!.id && tx.to !== req.robot!.id) {
        return res.status(403).json(errorResponse('Access denied', 'FORBIDDEN'));
      }

      res.json(successResponse(tx));
    } catch (error) {
      res.status(500).json(errorResponse((error as Error).message));
    }
  });

  router.post('/escrow', apiKeyAuth, async (req: RoboxRequest, res: Response) => {
    try {
      const { to, amount, condition, expiresAt } = req.body;

      if (!to || !amount) {
        return res.status(400).json(errorResponse('Missing required fields: to, amount', 'VALIDATION_ERROR'));
      }

      const escrow = await robox.createEscrow({
        from: req.robot!.id,
        to,
        amount: Number(amount),
        condition,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        initiatedBy: req.robot!.id,
      });

      res.json(successResponse({
        escrowId: escrow.id,
        from: escrow.from,
        to: escrow.to,
        amount: escrow.amount,
        status: escrow.status,
        expiresAt: escrow.expiresAt,
        createdAt: escrow.createdAt,
      }));
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Insufficient') ? 400 : 
                     err.message.includes('not found') ? 404 : 500;
      res.status(status).json(errorResponse(err.message));
    }
  });

  router.post('/escrow/:escrowId/release', apiKeyAuth, async (req: RoboxRequest, res: Response) => {
    try {
      const escrow = await robox.getEscrow(req.params.escrowId);

      if (!escrow) {
        return res.status(404).json(errorResponse('Escrow not found', 'NOT_FOUND'));
      }

      if (escrow.from !== req.robot!.id && escrow.to !== req.robot!.id) {
        return res.status(403).json(errorResponse('Access denied', 'FORBIDDEN'));
      }

      const tx = await robox.releaseEscrow(req.params.escrowId, req.robot!.id);

      res.json(successResponse({
        escrowId: req.params.escrowId,
        transactionId: tx.id,
        amount: tx.amount,
        status: 'RELEASED',
      }));
    } catch (error) {
      res.status(500).json(errorResponse((error as Error).message));
    }
  });

  router.post('/escrow/:escrowId/refund', apiKeyAuth, async (req: RoboxRequest, res: Response) => {
    try {
      const escrow = await robox.getEscrow(req.params.escrowId);

      if (!escrow) {
        return res.status(404).json(errorResponse('Escrow not found', 'NOT_FOUND'));
      }

      if (escrow.from !== req.robot!.id) {
        return res.status(403).json(errorResponse('Only sender can refund', 'FORBIDDEN'));
      }

      await robox.refundEscrow(req.params.escrowId, req.robot!.id);

      res.json(successResponse({
        escrowId: req.params.escrowId,
        status: 'REFUNDED',
      }));
    } catch (error) {
      res.status(500).json(errorResponse((error as Error).message));
    }
  });

  router.get('/escrows', apiKeyAuth, async (req: RoboxRequest, res: Response) => {
    try {
      const { status } = req.query;

      const escrows = await robox.listEscrows({
        robotId: req.robot!.id,
        status: status as any,
      });

      res.json(successResponse({
        escrows: escrows.map(e => ({
          id: e.id,
          from: e.from,
          to: e.to,
          amount: e.amount,
          status: e.status,
          expiresAt: e.expiresAt,
          createdAt: e.createdAt,
        })),
        count: escrows.length,
      }));
    } catch (error) {
      res.status(500).json(errorResponse((error as Error).message));
    }
  });

  router.post('/batch', apiKeyAuth, async (req: RoboxRequest, res: Response) => {
    try {
      const { transfers, stopOnError } = req.body;

      if (!transfers || !Array.isArray(transfers) || transfers.length === 0) {
        return res.status(400).json(errorResponse('Missing or empty transfers array', 'VALIDATION_ERROR'));
      }

      const batch = await robox.batchTransfer({
        transfers: transfers.map((t: any) => ({
          from: req.robot!.id,
          to: t.to,
          amount: Number(t.amount),
          type: t.type || TransactionType.TASK_PAYMENT,
          meta: t.memo ? { memo: t.memo } : undefined,
        })),
        stopOnError: stopOnError ?? false,
        initiatedBy: req.robot!.id,
      });

      res.json(successResponse({
        batchId: batch.id,
        status: batch.status,
        totalAmount: batch.totalAmount,
        successCount: batch.successCount,
        failedCount: batch.failedCount,
        transfers: batch.transfers.map(t => ({
          to: t.to,
          amount: t.amount,
          status: t.status,
          transactionId: t.transactionId,
          error: t.error,
        })),
      }));
    } catch (error) {
      res.status(500).json(errorResponse((error as Error).message));
    }
  });

  router.get('/stats', apiKeyAuth, async (req: RoboxRequest, res: Response) => {
    try {
      const account = await robox.getRobotAccount(req.robot!.id);
      const transactions = await robox.listTransactions({ robotId: req.robot!.id });

      const sent = transactions.filter(t => t.from === req.robot!.id);
      const received = transactions.filter(t => t.to === req.robot!.id);

      res.json(successResponse({
        balance: account!.balance,
        frozenBalance: account!.frozenBalance,
        totalTransactions: transactions.length,
        totalSent: sent.reduce((sum, t) => sum + t.amount, 0),
        totalReceived: received.reduce((sum, t) => sum + t.amount, 0),
        transactionsSent: sent.length,
        transactionsReceived: received.length,
      }));
    } catch (error) {
      res.status(500).json(errorResponse((error as Error).message));
    }
  });

  return router;
}

function successResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

function errorResponse(error: string, code?: string): ApiResponse {
  return {
    success: false,
    error,
    code,
    timestamp: new Date().toISOString(),
  };
}
