import { Body, Controller, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { AuditExportAuthService } from './audit-export.auth.service';

const formatSchema = z.enum(['csv', 'json', 'jsonl']);

const exportSchema = z.object({
  organizationId: z.string().min(1),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  format: formatSchema,
  actorId: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
});

const deliverSchema = z.object({
  organizationId: z.string().min(1),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

@Controller('api/admin/audit-export')
export class AuditExportController {
  constructor(private readonly service: AuditExportAuthService) {}

  @Post('export')
  @Permissions('instance|read')
  export(@Body(new ZodValidationPipe(exportSchema)) body: z.infer<typeof exportSchema>) {
    return this.service.export({
      ...body,
      from: body.from ? new Date(body.from) : undefined,
      to: body.to ? new Date(body.to) : undefined,
    });
  }

  @Post('deliver')
  @Permissions('instance|read')
  deliver(@Body(new ZodValidationPipe(deliverSchema)) body: z.infer<typeof deliverSchema>) {
    return this.service.deliverAll({
      ...body,
      from: body.from ? new Date(body.from) : undefined,
      to: body.to ? new Date(body.to) : undefined,
    });
  }
}
