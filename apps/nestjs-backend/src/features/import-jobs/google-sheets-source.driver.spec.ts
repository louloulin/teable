/**
 * GoogleSheetsSourceDriver spec — covers the validated extension-point
 * path so the unified processor stays generic even when the Sheets
 * API v4 integration is pending.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GoogleSheetsSourceDriver,
  IGoogleSheetsApiNotConfiguredError,
  IGoogleSheetsNoConnectionError,
} from './google-sheets-source.driver';

interface IPrismaStub {
  googleSheetsConnection: {
    findFirst: ReturnType<typeof vi.fn>;
  };
}

function buildPrisma(connectionExists: boolean): IPrismaStub {
  return {
    googleSheetsConnection: {
      findFirst: vi.fn(async () =>
        connectionExists
          ? {
              id: 'gsc_xyz',
              baseId: 'bse1',
              spreadsheetTitle: 'My Sheet',
            }
          : null
      ),
    },
  };
}

describe('GoogleSheetsSourceDriver.runImport (extension point)', () => {
  let prisma: IPrismaStub;
  let svc: GoogleSheetsSourceDriver;

  beforeEach(() => {
    prisma = buildPrisma(true);
    svc = new GoogleSheetsSourceDriver(prisma as never);
  });

  it('rejects tasks missing spaceId', async () => {
    await expect(
      svc.runImport({
        task: { id: 'x', spaceId: null, tableId: null, remoteId: 'sheet-abc' },
        isCanceled: () => false,
      })
    ).rejects.toThrow(/spaceId/);
  });

  it('rejects tasks missing spreadsheetId (remoteId)', async () => {
    await expect(
      svc.runImport({
        task: { id: 'x', spaceId: 'spc', tableId: null, remoteId: null },
        isCanceled: () => false,
      })
    ).rejects.toThrow(/spreadsheetId/);
  });

  it('throws NO_CONNECTION when no GoogleSheetsConnection row exists', async () => {
    prisma = buildPrisma(false);
    svc = new GoogleSheetsSourceDriver(prisma as never);
    await expect(
      svc.runImport({
        task: { id: 'sit_no', spaceId: 'spc', tableId: null, remoteId: 'sheet-abc' },
        isCanceled: () => false,
      })
    ).rejects.toBeInstanceOf(IGoogleSheetsNoConnectionError);
  });

  it('throws API_NOT_CONFIGURED once a connection is found (extensibility seam)', async () => {
    await expect(
      svc.runImport({
        task: { id: 'sit_ok', spaceId: 'spc', tableId: null, remoteId: 'sheet-abc' },
        isCanceled: () => false,
      })
    ).rejects.toBeInstanceOf(IGoogleSheetsApiNotConfiguredError);
  });

  it('honors a synchronous cancel before doing any Prisma work', async () => {
    const freshPrisma = buildPrisma(true);
    const freshSvc = new GoogleSheetsSourceDriver(freshPrisma as never);
    await expect(
      freshSvc.runImport({
        task: { id: 'sit_c', spaceId: 'spc', tableId: null, remoteId: 'sheet-abc' },
        isCanceled: () => true,
      })
    ).rejects.toThrow(/GOOGLE_SHEETS_CANCELED/);
    // Cancel short-circuited before connection lookup.
    expect(freshPrisma.googleSheetsConnection.findFirst).not.toHaveBeenCalled();
  });

  it('NO_CONNECTION error message references the registration route', () => {
    const err = new IGoogleSheetsNoConnectionError({
      spaceId: 'spc',
      spreadsheetId: 'sheet-abc',
    });
    expect(err.code).toBe('GOOGLE_SHEETS_NO_CONNECTION');
    expect(err.message).toContain('spc');
    expect(err.message).toContain('sheet-abc');
    expect(err.message).toContain('/api/google-sheets-sync/connections');
  });

  it('API_NOT_CONFIGURED error carries a remediation hint', () => {
    const err = new IGoogleSheetsApiNotConfiguredError({
      connectionId: 'gsc_xyz',
      spreadsheetId: 'sheet-abc',
    });
    expect(err.code).toBe('GOOGLE_SHEETS_API_NOT_CONFIGURED');
    expect(err.remediation).toContain('googleapis');
    expect(err.remediation).toContain('GoogleSheetsSourceDriver');
  });

  it('falls back to a mock connection when Prisma is omitted (spec path)', async () => {
    const noPrisma = new GoogleSheetsSourceDriver();
    await expect(
      noPrisma.runImport({
        task: { id: 'sit_m', spaceId: 'spc', tableId: null, remoteId: 'sheet-abc' },
        isCanceled: () => false,
      })
    ).rejects.toBeInstanceOf(IGoogleSheetsApiNotConfiguredError);
  });
});
