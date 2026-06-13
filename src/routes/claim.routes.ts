import { Router } from 'express';
import { claimController } from '../controllers/claim.controller';
import { validateDto } from '../middleware/validation.middleware';
import { createOperationLog } from '../middleware/operationLog.middleware';
import { CreateClaimDto, ApproveClaimDto, RejectClaimDto } from '../dto/claim.dto';

const router = Router();

router.post(
  '/',
  validateDto(CreateClaimDto),
  createOperationLog({
    module: 'claim',
    operation: 'create',
    getBusinessKey: (req) => req.body.claimNo || ''
  }),
  claimController.createClaim
);

router.get('/:claimNo', claimController.getClaim);
router.get('/', claimController.queryClaims);
router.get('/:claimNo/status', claimController.getClaimStatus);
router.get('/statistics/data', claimController.getStatistics);

router.post(
  '/:claimNo/withdraw',
  createOperationLog({
    module: 'claim',
    operation: 'withdraw',
    getBusinessKey: (req) => req.params.claimNo
  }),
  claimController.withdrawClaim
);

router.post(
  '/:claimNo/approve',
  validateDto(ApproveClaimDto),
  createOperationLog({
    module: 'claim',
    operation: 'approve',
    getBusinessKey: (req) => req.params.claimNo
  }),
  claimController.approveClaim
);

router.post(
  '/:claimNo/reject',
  validateDto(RejectClaimDto),
  createOperationLog({
    module: 'claim',
    operation: 'reject',
    getBusinessKey: (req) => req.params.claimNo
  }),
  claimController.rejectClaim
);

router.post(
  '/:claimNo/review',
  createOperationLog({
    module: 'claim',
    operation: 'startReview',
    getBusinessKey: (req) => req.params.claimNo
  }),
  claimController.startReview
);

export default router;
