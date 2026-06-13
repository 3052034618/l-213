import { Router } from 'express';
import { reportController } from '../controllers/report.controller';
import { validateDto } from '../middleware/validation.middleware';
import { createOperationLog } from '../middleware/operationLog.middleware';
import { CreateReminderTaskDto, UpdateReminderTaskDto } from '../dto/report.dto';

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

router.get('/policies/expiring/grouped', reportController.getExpiringGrouped);
router.get('/policies/renewal/export', reportController.exportRenewalCsv);

router.get('/trace/chain', reportController.traceBusinessChain);

router.get('/finance/summary', reportController.getFinanceReport);
router.get('/finance/export', reportController.exportFinanceReport);

export default router;
