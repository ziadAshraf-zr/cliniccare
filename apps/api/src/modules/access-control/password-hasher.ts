import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * نفس خيارات Argon2id المستخدمة في AuthService وprisma/seed (القسم 7: OWASP).
 * إن تغيّرت هناك فلتتغيّر هنا؛ التجزئة تُحقَن كخدمة حتى لا تحتاج الاختبارات
 * إلى Argon2 الحقيقي.
 */
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19 * 1024, timeCost: 2 } as const;

@Injectable()
export class PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTIONS);
  }
}
