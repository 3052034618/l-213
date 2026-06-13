import { Request, Response } from 'express';
import { materialService } from '../services/material.service';

export class MaterialController {
  async uploadMaterial(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({
          code: 400,
          message: '请上传文件'
        });
      }
      const { claimNo, materialType, description, uploader } = req.body;
      const material = await materialService.uploadMaterial(
        claimNo,
        materialType,
        req.file,
        description,
        uploader
      );
      res.status(201).json({
        code: 200,
        message: '材料上传成功',
        data: material
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async getMaterials(req: Request, res: Response) {
    try {
      const { claimNo } = req.params;
      const materials = await materialService.getMaterialsByClaimNo(claimNo);
      res.json({
        code: 200,
        message: '查询成功',
        data: materials
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }

  async deleteMaterial(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { operator } = req.body;
      await materialService.deleteMaterial(Number(id), operator);
      res.json({
        code: 200,
        message: '材料删除成功'
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message
      });
    }
  }
}

export const materialController = new MaterialController();
