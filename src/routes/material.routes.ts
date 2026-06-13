import { Router } from 'express';
import multer from 'multer';
import { materialController } from '../controllers/material.controller';
import { createOperationLog } from '../middleware/operationLog.middleware';

const router = Router();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post(
  '/',
  upload.single('file'),
  createOperationLog({
    module: 'material',
    operation: 'upload',
    getBusinessKey: (req) => req.body.claimNo
  }),
  materialController.uploadMaterial
);

router.get('/:claimNo', materialController.getMaterials);

router.delete(
  '/:id',
  createOperationLog({
    module: 'material',
    operation: 'delete',
    getBusinessKey: (req) => req.params.id
  }),
  materialController.deleteMaterial
);

export default router;
