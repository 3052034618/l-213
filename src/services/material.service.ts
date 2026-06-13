import { getDb, nextId, now, ClaimMaterial } from '../config/database';
import { claimService } from './claim.service';
import * as fs from 'fs';
import * as path from 'path';

export class MaterialService {
  async uploadMaterial(
    claimNo: string,
    materialType: string,
    file: Express.Multer.File,
    description: string | undefined,
    uploader: string
  ): Promise<ClaimMaterial> {
    const db = getDb();
    const claim = db.data!.claims.find(c => c.claimNo === claimNo);
    if (!claim) {
      throw new Error(`理赔申请 ${claimNo} 不存在`);
    }

    if (claim.status === 'withdrawn' || claim.status === 'rejected' || claim.status === 'approved') {
      throw new Error(`该申请状态不允许上传材料`);
    }

    const uploadDir = path.join(process.cwd(), 'uploads', claimNo);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const fileName = `${Date.now()}_${file.originalname}`;
    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, file.buffer);

    const material: ClaimMaterial = {
      id: nextId('materialId'),
      claimId: claim.id,
      materialType,
      fileName: file.originalname,
      filePath: `/uploads/${claimNo}/${fileName}`,
      fileSize: file.size,
      description,
      uploader,
      createdAt: now()
    };
    db.data!.materials.push(material);
    await db.write();
    return material;
  }

  async getMaterialsByClaimNo(claimNo: string): Promise<ClaimMaterial[]> {
    const db = getDb();
    const claim = db.data!.claims.find(c => c.claimNo === claimNo);
    if (!claim) {
      return [];
    }
    return db.data!.materials
      .filter(m => m.claimId === claim.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getMaterialById(id: number): Promise<ClaimMaterial | null> {
    const db = getDb();
    return db.data!.materials.find(m => m.id === id) || null;
  }

  async deleteMaterial(id: number, operator: string): Promise<void> {
    const db = getDb();
    const index = db.data!.materials.findIndex(m => m.id === id);
    if (index === -1) {
      throw new Error(`材料 ${id} 不存在`);
    }

    const material = db.data!.materials[index];
    const fullPath = path.join(process.cwd(), material.filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    db.data!.materials.splice(index, 1);
    await db.write();
  }
}

export const materialService = new MaterialService();
