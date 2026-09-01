/* SPDX-License-Identifier: AGPL-3.0-or-later */
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

import { MultiRegionArbitrationController } from './multi-region-arbitration.controller';
import { MultiRegionArbitrationAuthService } from './multi-region-arbitration.auth.service';

describe('MultiRegionArbitrationController', () => {
  let controller: MultiRegionArbitrationController;
  let svc: MultiRegionArbitrationAuthService;
  const arbitrateAndPersist = vi.fn();

  beforeEach(async () => {
    arbitrateAndPersist.mockReset();
    svc = { arbitrateAndPersist } as unknown as MultiRegionArbitrationAuthService;
    const moduleRef = await Test.createTestingModule({
      controllers: [MultiRegionArbitrationController],
    })
      .overrideProvider(MultiRegionArbitrationAuthService)
      .useValue(svc)
      .compile();
    controller = moduleRef.get(MultiRegionArbitrationController);
  });

  it('arbitrate() forwards validated request to the auth service', async () => {
    arbitrateAndPersist.mockResolvedValue({ kind: 'admit', lease: { generation: 1 } });
    const result = await controller.arbitrate({
      request: {
        resourceKey: 'row:tbl1:rec1',
        regionId: 'us-east-1',
        holderId: 'writer-1',
        baseVersion: 0,
        ttlMs: 5_000,
      },
    });
    expect(result).toEqual({ kind: 'admit', lease: { generation: 1 } });
    expect(arbitrateAndPersist).toHaveBeenCalledWith({ request: expect.objectContaining({ regionId: 'us-east-1' }) });
  });

  it('arbitrate() rejects malformed region ids via the pipe', async () => {
    await expect(
      (controller as unknown as { arbitrate: (b: unknown) => Promise<unknown> }).arbitrate({
        request: {
          resourceKey: 'row:tbl1:rec1',
          regionId: 'INVALID',
          holderId: 'writer-1',
          baseVersion: 0,
          ttlMs: 5_000,
        },
      })
    ).rejects.toThrow();
  });

  it('regionHealth() throws NotFound for unknown regions', async () => {
    vi.spyOn(svc, 'listRegions').mockResolvedValue([]);
    await expect(controller.regionHealth('us-east-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
