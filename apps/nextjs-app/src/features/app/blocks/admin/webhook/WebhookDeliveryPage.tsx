import { useTranslation } from 'next-i18next';

import { DeadLetterPanel } from './DeadLetterPanel';

/**
 * Webhook delivery admin page (Wave 10 / T-13).
 *
 * Hosts the `DeadLetterPanel` so the retry button has somewhere to
 * live. Designed to grow with the future dispatcher health / DLQ
 * metrics panels — they would slot in as additional `<section>`
 * blocks below.
 */
export const WebhookDeliveryPage = () => {
  const { t } = useTranslation('common');
  return (
    <div className="flex h-screen flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 sm:p-8">
      <div className="pb-6">
        <h1 className="text-2xl font-semibold">{t('admin.webhook.title')}</h1>
        <div className="mt-2 text-sm text-muted-foreground">
          {t('admin.webhook.description')}
        </div>
      </div>

      <div className="space-y-6">
        <section className="space-y-4">
          <h2 className="text-lg font-medium">
            {t('admin.webhook.deadLetter.title')}
          </h2>
          <DeadLetterPanel />
        </section>
      </div>
    </div>
  );
};