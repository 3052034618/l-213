import { Router } from 'express';
import { operationLogController } from '../controllers/operationLog.controller';

const router = Router();

router.get('/', operationLogController.getLogs);

export default router;
