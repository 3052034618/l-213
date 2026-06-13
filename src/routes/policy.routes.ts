import { Router } from 'express';
import { policyController } from '../controllers/policy.controller';
import { validateDto } from '../middleware/validation.middleware';
import { createOperationLog } from '../middleware/operationLog.middleware';
import { CreatePolicyDto, RenewalQueryDto } from '../dto/policy.dto';

const router = Router();

router.post(
  '/',
  validateDto(CreatePolicyDto),
  createOperationLog({
    module: 'policy',
    operation: 'create',
    getBusinessKey: (req) => req.body.policyNo || ''
  }),
  policyController.createPolicy
);

router.get('/:policyNo', policyController.getPolicy);
router.get('/asset/:assetNo', policyController.getPoliciesByAssetNo);
router.get('/', policyController.queryPolicies);
router.get('/expiring/list', policyController.getExpiringPolicies);

router.post(
  '/renewal/list',
  validateDto(RenewalQueryDto),
  createOperationLog({
    module: 'policy',
    operation: 'generateRenewalList'
  }),
  policyController.generateRenewalList
);

router.get('/fee/summary', policyController.getFeeSummary);

router.post(
  '/:policyNo/renew',
  createOperationLog({
    module: 'policy',
    operation: 'renew',
    getBusinessKey: (req) => req.params.policyNo
  }),
  policyController.renewPolicy
);

export default router;
