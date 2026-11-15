import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * يُعفي route من PermissionsGuard (الأسبوع 4) — Default deny إلا لما يُعلَّم
 * صراحة بهذا الديكوريتر (القسم 5). يُستخدم فقط لمسارات مثل /health و/auth/login.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
