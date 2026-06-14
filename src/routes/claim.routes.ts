import { Router } from 'express';
import { claimController } from '../controllers/claim.controller';
import { validateDto } from '../middleware/validation.middleware';
import { createOperationLog } from '../middleware/operationLog.middleware';
import {
  CreateClaimDto, ApproveClaimDto, RejectClaimDto,
  ReviewOpinionDto, SupplementNoticeDto, ResubmitClaimDto, ConfirmSettlementDto
} from '../dto/claim.dto';

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

router.get('/workflow/config', claimController.getWorkflowConfig);
router.get('/statistics/data', claimController.getStatistics);
router.get('/', claimController.queryClaims);
router.get('/:claimNo/status', claimController.getClaimStatus);

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
  '/:claimNo/review/l1/start',
  validateDto(ReviewOpinionDto),
  createOperationLog({
    module: 'claim',
    operation: 'startL1Review',
    getBusinessKey: (req) => req.params.claimNo
  }),
  claimController.startL1Review
);

router.post(
  '/:claimNo/review/l1/pass',
  validateDto(ReviewOpinionDto),
  createOperationLog({
    module: 'claim',
    operation: 'passL1Review',
    getBusinessKey: (req) => req.params.claimNo
  }),
  claimController.passL1Review
);

router.post(
  '/:claimNo/review/supplement',
  validateDto(SupplementNoticeDto),
  createOperationLog({
    module: 'claim',
    operation: 'requestSupplement',
    getBusinessKey: (req) => req.params.claimNo
  }),
  claimController.requestSupplement
);

router.post(
  '/:claimNo/resubmit',
  validateDto(ResubmitClaimDto),
  createOperationLog({
    module: 'claim',
    operation: 'resubmit',
    getBusinessKey: (req) => req.params.claimNo
  }),
  claimController.resubmitClaim
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
  '/:claimNo/settle/confirm',
  validateDto(ConfirmSettlementDto),
  createOperationLog({
    module: 'claim',
    operation: 'confirmSettlement',
    getBusinessKey: (req) => req.params.claimNo
  }),
  claimController.confirmSettlement
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

router.get('/:claimNo', claimController.getClaim);

export default router;
