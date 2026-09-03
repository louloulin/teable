/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Billing — NestJS module wiring (Round-INFRA-4).
 *
 * Wraps BillingAuthService into the NestJS container so other
 * feature modules can import this one (and so the capability gate
 * in `/api/admin/enterprise-readiness` can probe it via app.module).
 *
 * License: AGPL-3.0
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { MailSenderModule } from '../mail-sender/mail-sender.module';
import { BillingController } from './billing.controller';
import { BillingCheckoutController } from './billing-checkout.controller';
import { BillingPortalController } from './billing-portal.controller';
import { BillingAddOnService } from './billing-add-on.service';
import { BillingAuthService } from './billing.auth.service';
import { BillingDunningService } from './billing-dunning.service';
import { BillingDunningWorkerService } from './billing-dunning-worker.service';
import { BillingMeteredInvoiceService } from './billing-metered-invoice.service';
import { BillingMeteredInvoiceWorkerService } from './billing-metered-invoice-worker.service';
import { BillingInvoicePdfService } from './billing-invoice-pdf.service';
import { BillingPdfExportAuthService } from '../billing-pdf-export/billing-pdf-export.auth.service';
import { BillingPortalOrgGuard } from './billing-portal-org.guard';
import { BillingProrationService } from './billing-proration.service';
import { BillingUsageLedgerService } from './billing-usage-ledger.service';

@Module({
  imports: [LicenseModule, MailSenderModule],
  controllers: [BillingController, BillingCheckoutController, BillingPortalController],
  providers: [
    BillingAuthService,
    BillingProrationService,
    BillingDunningService,
    BillingDunningWorkerService,
    BillingUsageLedgerService,
    BillingAddOnService,
    BillingMeteredInvoiceService,
    BillingMeteredInvoiceWorkerService,
    BillingInvoicePdfService,
    BillingPortalOrgGuard,
    BillingPdfExportAuthService,
  ],
  exports: [
    BillingAuthService,
    BillingProrationService,
    BillingDunningService,
    BillingDunningWorkerService,
    BillingUsageLedgerService,
    BillingAddOnService,
    BillingMeteredInvoiceService,
    BillingMeteredInvoiceWorkerService,
    BillingInvoicePdfService,
    BillingPortalOrgGuard,
    BillingPdfExportAuthService,
  ],
})
export class BillingModule {}
