import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * يغلّف PrismaClient كخدمة Nest واحدة (Singleton) تُحقَن في كل Repository.
 * يتصل بـ DATABASE_URL (مستخدم cliniccare_app محدود الصلاحيات، القسم 13) —
 * وليس رابط المالك المستخدَم في الـ migrations.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      datasources: { db: { url: process.env.DATABASE_URL } },
      log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['warn'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('متصل بقاعدة البيانات (DATABASE_URL، مستخدم محدود الصلاحيات)');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
