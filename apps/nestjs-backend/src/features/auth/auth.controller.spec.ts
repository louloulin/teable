import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('exposes the profile compatibility endpoint', async () => {
    const request = {
      user: { id: 'u1', email: 'u1@example.com' },
    } as unknown as Express.Request;
    await expect(controller.profile(request)).resolves.toEqual({
      id: 'u1',
      email: 'u1@example.com',
      organization: undefined,
    });
  });
});
