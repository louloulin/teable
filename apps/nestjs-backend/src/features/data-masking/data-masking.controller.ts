import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { DataMaskingAuthService } from './data-masking.auth.service';

const strategySchema = z.enum([
  'full-redact',
  'partial',
  'regex',
  'hash',
  'keep-last',
  'email-local',
  'phone-tail',
]);
const scopeSchema = z.enum(['all', 'role-based', 'field-based']);
const roleSchema = z.enum(['owner', 'creator', 'editor', 'commenter', 'viewer']);

const createPolicySchema = z.object({
  baseId: z.string().min(1),
  tableId: z.string().min(1),
  fieldId: z.string().min(1),
  strategy: strategySchema,
  scope: scopeSchema,
  allowedRoles: z.array(roleSchema).optional(),
  partial: z
    .object({
      keepPrefix: z.number().int().min(0).max(64).optional(),
      keepSuffix: z.number().int().min(0).max(64).optional(),
      maskChar: z.string().min(1).max(1).optional(),
    })
    .optional(),
  regexRules: z
    .array(
      z.object({
        pattern: z.string().max(500),
        replacement: z.string().max(500).optional(),
      })
    )
    .optional(),
  label: z.string().max(120).optional(),
});

const updatePolicySchema = z.object({
  strategy: strategySchema.optional(),
  scope: scopeSchema.optional(),
  allowedRoles: z.array(roleSchema).optional(),
  partial: createPolicySchema.shape.partial.optional(),
  regexRules: createPolicySchema.shape.regexRules,
  label: z.string().max(120).optional(),
});

const idParamSchema = z.object({ id: z.string().min(1) });
const listQuerySchema = z.object({
  baseId: z.string().min(1),
  tableId: z.string().min(1).optional(),
});

@Controller('api/admin/data-masking')
export class DataMaskingController {
  constructor(private readonly service: DataMaskingAuthService) {}

  @Get('policies')
  @Permissions('instance|read')
  list(@Query(new ZodValidationPipe(listQuerySchema)) q: z.infer<typeof listQuerySchema>) {
    return this.service.listPolicies(q.baseId, q.tableId);
  }

  @Post('policies')
  @Permissions('instance|update')
  create(
    @Body(new ZodValidationPipe(createPolicySchema)) body: z.infer<typeof createPolicySchema>
  ) {
    return this.service.createPolicy(
      body as unknown as Parameters<DataMaskingAuthService['createPolicy']>[0]
    );
  }

  @Get('policies/:id')
  @Permissions('instance|read')
  get(@Param(new ZodValidationPipe(idParamSchema)) params: { id: string }) {
    return this.service.getPolicy(params.id);
  }

  @Patch('policies/:id')
  @Permissions('instance|update')
  update(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updatePolicySchema)) body: z.infer<typeof updatePolicySchema>
  ) {
    return this.service.updatePolicy(
      params.id,
      body as unknown as Parameters<DataMaskingAuthService['updatePolicy']>[1]
    );
  }

  @Delete('policies/:id')
  @Permissions('instance|update')
  async delete(@Param(new ZodValidationPipe(idParamSchema)) params: { id: string }) {
    await this.service.deletePolicy(params.id);
    return { ok: true, id: params.id };
  }
}
