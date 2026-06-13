import { Request, Response } from 'express';
import { assetService } from '../services/asset.service';
import { CreateAssetDto } from '../dto/asset.dto';

export class AssetController {
  async createAsset(req: Request, res: Response) {
    try {
      const dto = req.body as CreateAssetDto;
      const asset = await assetService.createAsset(dto);
      res.status(201).json({
        code: 200,
        message: '资产创建成功',
        data: asset
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async getAsset(req: Request, res: Response) {
    try {
      const { assetNo } = req.params;
      const asset = await assetService.getAssetByNo(assetNo);
      if (!asset) {
        return res.status(404).json({
          code: 404,
          message: '资产不存在'
        });
      }
      res.json({
        code: 200,
        message: '查询成功',
        data: asset
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async getAllAssets(req: Request, res: Response) {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 20;
      const result = await assetService.getAllAssets(page, pageSize);
      res.json({
        code: 200,
        message: '查询成功',
        data: result.list,
        total: result.total,
        page,
        pageSize
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }
}

export const assetController = new AssetController();
