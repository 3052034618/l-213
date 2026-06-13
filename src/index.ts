import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { initDatabase } from './config/database';
import { logger } from './utils/logger';

import assetRoutes from './routes/asset.routes';
import policyRoutes from './routes/policy.routes';
import claimRoutes from './routes/claim.routes';
import materialRoutes from './routes/material.routes';
import operationLogRoutes from './routes/operationLog.routes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/api/health', (req, res) => {
  res.json({
    code: 200,
    message: '企业资产保险管理服务运行正常',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.use('/api/assets', assetRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/logs', operationLogRoutes);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(`${req.method} ${req.path} - ${err.message}`);
  res.status(500).json({
    code: 500,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

initDatabase()
  .then(() => {
    logger.info('数据库初始化成功');
    app.listen(PORT, () => {
      logger.info(`服务启动成功，端口: ${PORT}`);
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║     企业资产保险管理后端服务已启动                           ║
╠══════════════════════════════════════════════════════════════╣
║  服务地址: http://localhost:${PORT}                           ║
║  健康检查: http://localhost:${PORT}/api/health                 ║
╠══════════════════════════════════════════════════════════════╣
║  六类接口模块:                                                ║
║  1. 资产投保登记 - /api/policies/                             ║
║  2. 保单查询     - /api/policies/                             ║
║  3. 到期提醒     - /api/policies/expiring/list                ║
║  4. 理赔申请     - /api/claims/                               ║
║  5. 材料补交     - /api/materials/                            ║
║  6. 进度同步     - /api/claims/:claimNo/status                ║
╚══════════════════════════════════════════════════════════════╝
      `);
    });
  })
  .catch((error) => {
    logger.error('数据库连接失败:', error);
    process.exit(1);
  });

export default app;
