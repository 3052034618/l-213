import { Router } from 'express';
import { reportController } from '../controllers/report.controller';
import { validateDto } from '../middleware/validation.middleware';
import { createOperationLog } from '../middleware/operationLog.middleware';
import {
  CreateReminderTaskDto, UpdateReminderTaskDto,
  CreateReceiverDto, UpdateReceiverDto,
  QueryReminderHistoryDto
} from '../dto/report.dto';

const router = Router();

router.post(
  '/reminders/tasks',
  validateDto(CreateReminderTaskDto),
  createOperationLog({ module: 'report', operation: 'createReminderTask', getBusinessKey: r => r.body.taskName || '' }),
  reportController.createReminderTask
);
router.put(
  '/reminders/tasks/:id',
  validateDto(UpdateReminderTaskDto),
  createOperationLog({ module: 'report', operation: 'updateReminderTask', getBusinessKey: r => r.params.id }),
  reportController.updateReminderTask
);
router.delete(
  '/reminders/tasks/:id',
  createOperationLog({ module: 'report', operation: 'deleteReminderTask', getBusinessKey: r => r.params.id }),
  reportController.deleteReminderTask
);
router.get('/reminders/tasks', reportController.listReminderTasks);
router.post(
  '/reminders/tasks/:id/run',
  createOperationLog({ module: 'report', operation: 'runReminderTask', getBusinessKey: r => r.params.id }),
  reportController.runReminderTask
);
router.post(
  '/reminders/tasks/run/all',
  createOperationLog({ module: 'report', operation: 'runAllReminderTasks' }),
  reportController.runAllReminderTasks
);

router.get('/reminders/histories', validateDto(QueryReminderHistoryDto), reportController.listReminderHistories);

router.post(
  '/reminders/receivers',
  validateDto(CreateReceiverDto),
  createOperationLog({ module: 'report', operation: 'createReceiver', getBusinessKey: r => r.body.name || '' }),
  reportController.createReceiver
);
router.put(
  '/reminders/receivers/:id',
  validateDto(UpdateReceiverDto),
  createOperationLog({ module: 'report', operation: 'updateReceiver', getBusinessKey: r => r.params.id }),
  reportController.updateReceiver
);
router.delete(
  '/reminders/receivers/:id',
  createOperationLog({ module: 'report', operation: 'deleteReceiver', getBusinessKey: r => r.params.id }),
  reportController.deleteReceiver
);
router.get('/reminders/receivers', reportController.listReceivers);

router.get('/policies/expiring/grouped', reportController.getExpiringGrouped);
router.get('/policies/renewal/export', reportController.exportRenewalCsv);

router.get('/trace/chain', reportController.traceBusinessChain);

router.get('/finance/summary', reportController.getFinanceReport);
router.get('/finance/export', reportController.exportFinanceReport);

export default router;
