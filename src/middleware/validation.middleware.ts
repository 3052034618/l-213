import { Request, Response, NextFunction } from 'express';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

export function validateDto<T extends object>(dtoClass: ClassConstructor<T>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const dto = plainToInstance(dtoClass, req.body);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    
    if (errors.length > 0) {
      const errorMessages = errors.map(error => {
        const constraints = error.constraints ? Object.values(error.constraints) : [];
        return {
          field: error.property,
          messages: constraints
        };
      });
      
      return res.status(400).json({
        code: 400,
        message: '参数验证失败',
        errors: errorMessages
      });
    }
    
    req.body = dto;
    next();
  };
}

export function validateQueryDto<T extends object>(dtoClass: ClassConstructor<T>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const dto = plainToInstance(dtoClass, req.query);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    
    if (errors.length > 0) {
      const errorMessages = errors.map(error => {
        const constraints = error.constraints ? Object.values(error.constraints) : [];
        return {
          field: error.property,
          messages: constraints
        };
      });
      
      return res.status(400).json({
        code: 400,
        message: '查询参数验证失败',
        errors: errorMessages
      });
    }
    
    req.query = dto as any;
    next();
  };
}
