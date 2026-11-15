import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * يضع requestId واحدًا لكل طلب قبل أي Guard أو Controller، ويعيده في
 * ترويسة الاستجابة لتسهيل الدعم (القسم 6 و13: pino وrequestId).
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const id = randomUUID();
    (req as Request & { id: string }).id = id;
    res.setHeader('X-Request-Id', id);
    next();
  }
}
