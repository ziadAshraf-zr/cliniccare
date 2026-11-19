import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  acceptInvitationSchema,
  changePasswordSchema,
  loginSchema,
  type AcceptInvitationDto,
  type AuthenticatedUser,
  type ChangePasswordDto,
  type LoginDto,
} from '@cliniccare/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { RequestWithAuth } from '../../common/guards/session.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { setAuthCookies, clearAuthCookies } from './auth-cookies.util';
import { AuthService, type RequestMeta } from './auth.service';

/**
 * نقاط Auth Module (الأسبوع 4 من الخطة التقنية): الدخول والخروج والجلسة
 * الحالية وتغيير كلمة المرور وقبول دعوة بوابة المريض. كل مسار غير مُعلَّم
 * @Public() يمرّ أولًا على السلسلة الرباعية (SessionGuard ثم ClinicContext
 * ثم Permissions) المسجَّلة عامةً في app.module.ts.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, this.requestMeta(req));
    setAuthCookies(res, result.rawSessionToken, result.csrfToken, result.expiresAt);
    return { user: result.user, csrfToken: result.csrfToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestWithAuth,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    if (req.sessionRawToken) {
      await this.authService.logout(user, req.sessionRawToken, this.requestMeta(req));
    }
    clearAuthCookies(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.authService.changePassword(user, dto, this.requestMeta(req));
  }

  @Public()
  @Post('accept-invitation/:token')
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(acceptInvitationSchema)) dto: AcceptInvitationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.acceptInvitation(token, dto, this.requestMeta(req));
    setAuthCookies(res, result.rawSessionToken, result.csrfToken, result.expiresAt);
    return { user: result.user, csrfToken: result.csrfToken };
  }

  private requestMeta(req: Request): RequestMeta {
    return { ip: req.ip, userAgent: req.header('user-agent') };
  }
}
