import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../lib/http';
import { isbankTest, isbankAccounts, isbankTransactions } from './isbank.service';

const router = Router();

// Bağlantı testi (token alır)
router.get('/test', asyncHandler(async (req: Request, res: Response) => {
  res.json(await isbankTest(req.tenantId!));
}));

// Hesaplar (TL varsayılan; currency_code / account_type opsiyonel)
router.get('/accounts', asyncHandler(async (req: Request, res: Response) => {
  const data = await isbankAccounts(req.tenantId!, { currency_code: req.query.currency_code as string, account_type: req.query.account_type as string });
  res.json({ accounts: data });
}));

// Hesap hareketleri
router.get('/accounts/:accountId/transactions', asyncHandler(async (req: Request, res: Response) => {
  const data = await isbankTransactions(req.tenantId!, req.params.accountId, {
    beginDate: req.query.beginDate as string, endDate: req.query.endDate as string,
    pageSize: req.query.pageSize as string, financialType: req.query.financialType as string,
    from: req.query.from as string, transactionGroupList: req.query.transactionGroupList as string,
  });
  res.json(data);
}));

export default router;
