import { Router } from 'express';
import { syncController } from '../controllers/sync.controller';
import { validateDto } from '../middleware/validation.middleware';
import { createOperationLog } from '../middleware/operationLog.middleware';
import {
  RegisterExternalSystemDto, UpdateExternalSystemDto,
  QuerySyncRecordDto, SubmitAckDto
} from '../dto/sync.dto';

const router = Router();

router.post(
  '/systems',
  validateDto(RegisterExternalSystemDto),
  createOperationLog({
    module: 'sync',
    operation: 'registerSystem',
    getBusinessKey: (req) => req.body.systemCode || ''
  }),
  syncController.registerSystem
);
router.put(
  '/systems/:id',
  validateDto(UpdateExternalSystemDto),
  createOperationLog({
    module: 'sync',
    operation: 'updateSystem',
    getBusinessKey: (req) => req.params.id
  }),
  syncController.updateSystem
);
router.get('/systems', syncController.listSystems);
router.post('/systems/:id/test', syncController.testWebhook);

router.get('/records', validateDto(QuerySyncRecordDto), syncController.queryRecords);
router.get('/records/:id', syncController.getRecordDetail);

router.post(
  '/records/:id/retry',
  createOperationLog({
    module: 'sync',
    operation: 'retry',
    getBusinessKey: (req) => req.params.id
  }),
  syncController.retryRecord
);
router.post(
  '/records/retry/all',
  createOperationLog({ module: 'sync', operation: 'retryAll' }),
  syncController.retryAllFailed
);

router.post(
  '/records/:id/ack',
  validateDto(SubmitAckDto),
  createOperationLog({
    module: 'sync',
    operation: 'ack',
    getBusinessKey: (req) => req.params.id
  }),
  syncController.submitAck
);

router.get('/statistics', syncController.getStatistics);
router.get('/retry-policies', syncController.listPolicies);
router.put(
  '/retry-policies/:id',
  createOperationLog({ module: 'sync', operation: 'updatePolicy', getBusinessKey: (req) => req.params.id }),
  syncController.updatePolicy
);

export default router;
