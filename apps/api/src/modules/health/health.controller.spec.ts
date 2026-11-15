import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from '../../prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  const prismaMock = { $queryRaw: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prismaMock }],
    }).compile();

    controller = module.get(HealthController);
    jest.clearAllMocks();
  });

  it('live يرجع ok دون لمس القاعدة', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('ready يرجع ok عند نجاح الاتصال بالقاعدة', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
  });

  it('ready يرمي 503 عند فشل الاتصال بالقاعدة', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
