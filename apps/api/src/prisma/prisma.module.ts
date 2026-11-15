import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global: كل Module يحقن PrismaService مباشرة دون استيراد PrismaModule
 * بشكل متكرر في كل مكان (القسم 3: كل Module يتعامل مع غيره عبر Service عام).
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
