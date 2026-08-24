import { HttpErrorCode } from '@teable/core';
import { CustomHttpException } from '../../custom.exception';

export class QuotaExceededException extends CustomHttpException {
  constructor(
    public readonly metric: string,
    public readonly cap: number | bigint,
    public readonly attempted: number | bigint,
    public readonly spaceId: string
  ) {
    super(
      `Quota exceeded for ${metric} on space ${spaceId}: tried ${attempted}, cap ${cap}`,
      HttpErrorCode.PAYMENT_REQUIRED,
      {
        cause: 'QUOTA_EXCEEDED',
        meta: { metric, cap: cap.toString(), attempted: attempted.toString(), spaceId },
      }
    );
  }
}