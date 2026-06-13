import { getDb, nextId, now, Asset } from '../config/database';
import { CreateAssetDto } from '../dto/asset.dto';

export class AssetService {
  async createAsset(dto: CreateAssetDto): Promise<Asset> {
    const db = getDb();
    const existing = db.data!.assets.find(a => a.assetNo === dto.assetNo);
    if (existing) {
      return existing;
    }
    const asset: Asset = {
      id: nextId('assetId'),
      assetNo: dto.assetNo,
      assetName: dto.assetName,
      assetType: dto.assetType,
      originalValue: dto.originalValue,
      location: dto.location,
      description: dto.description,
      status: 'normal',
      createdAt: now(),
      updatedAt: now()
    };
    db.data!.assets.push(asset);
    await db.write();
    return asset;
  }

  async getAssetByNo(assetNo: string): Promise<Asset | null> {
    const db = getDb();
    return db.data!.assets.find(a => a.assetNo === assetNo) || null;
  }

  async getAssetById(id: number): Promise<Asset | null> {
    const db = getDb();
    return db.data!.assets.find(a => a.id === id) || null;
  }

  async getAllAssets(page: number = 1, pageSize: number = 20): Promise<{ list: Asset[]; total: number }> {
    const db = getDb();
    const sorted = [...db.data!.assets].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const total = sorted.length;
    const list = sorted.slice((page - 1) * pageSize, page * pageSize);
    return { list, total };
  }
}

export const assetService = new AssetService();
