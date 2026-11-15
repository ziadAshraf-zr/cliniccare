import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ERROR_CODES, type ApiErrorShape, type ErrorCode } from '@cliniccare/shared';

/**
 * Filter عام يحوّل أي استثناء إلى شكل الخطأ الموحد (القسم 6 من الخطة
 * التقنية). لا يُسرَّب أي نص خادم خام للمستخدم، ولا بيانات سريرية في
 * requestId أو الرسالة.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as { id?: string }).id;

    const { status, code, title, fieldErrors } = this.resolve(exception);

    if (status >= 500) {
      this.logger.error({ requestId, code, err: exception }, 'unhandled exception');
    }

    const body: ApiErrorShape = { status, code, title, requestId, fieldErrors };
    response.status(status).json(body);
  }

  private resolve(exception: unknown): {
    status: number;
    code: ErrorCode;
    title: string;
    fieldErrors?: ApiErrorShape['fieldErrors'];
  } {
    if (exception instanceof AppException) {
      return {
        status: ERROR_CODES[exception.code],
        code: exception.code,
        title: exception.title,
        fieldErrors: exception.fieldErrors,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = this.codeForHttpStatus(status);
      return { status, code, title: exception.message || 'حدث خطأ غير متوقع' };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      title: 'حدث خطأ غير متوقع في الخادم',
    };
  }

  private codeForHttpStatus(status: number): ErrorCode {
    switch (status) {
      case 401:
        return 'UNAUTHENTICATED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 422:
        return 'VALIDATION_FAILED';
      case 429:
        return 'RATE_LIMITED';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}

/**
 * استثناء نطاقي موحّد: كل استثناءات الأعمال (SlotConflictException وغيرها)
 * تُبنى فوق هذا الصنف، فيترجمها الـ Filter تلقائيًا لكود موحّد (القسم 6).
 */
export class AppException extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly title: string,
    public readonly fieldErrors?: ApiErrorShape['fieldErrors'],
  ) {
    super(title);
  }
}
