import { Router } from 'express';
import { assetController } from '../controllers/asset.controller';
import { validateDto } from '../middleware/validation.middleware';
import { createOperationLog } from '../middleware/operationLog.middleware';
import { CreateAssetDto } from '../dto/asset.dto';

const router = Router();

router.post(
  '/',
  validateDto(CreateAssetDto),
  createOperationLog({
    module: 'asset',
    operation: 'create',
    getBusinessKey: (req) => req.body.assetNo
  }),
  assetController.createAsset
);

router.get('/:assetNo', assetController.getAsset);
router.get('/', assetController.getAllAssets);

export default router;
