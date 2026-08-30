import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import type {
  RecordCreateEvent,
  RecordDeleteEvent,
  RecordUpdateEvent,
} from '../../event-emitter/events';
import { Events } from '../../event-emitter/events';
import { WebhookDeliveryAuthService } from './webhook-delivery.auth.service';

type RecordEvent = RecordCreateEvent | RecordUpdateEvent | RecordDeleteEvent;

@Injectable()
export class WebhookDeliveryListener {
  private readonly logger = new Logger(WebhookDeliveryListener.name);

  constructor(private readonly deliveries: WebhookDeliveryAuthService) {}

  @OnEvent(Events.TABLE_RECORD_CREATE, { async: true })
  @OnEvent(Events.TABLE_RECORD_UPDATE, { async: true })
  @OnEvent(Events.TABLE_RECORD_DELETE, { async: true })
  async handle(event: RecordEvent): Promise<void> {
    const eventName = event.name.replace(/^table\./, '');
    try {
      await this.deliveries.enqueueEvent({
        event: eventName,
        body: JSON.stringify({
          id: event.id,
          event: eventName,
          payload: event.payload,
          context: event.context,
        }),
      });
    } catch (error) {
      this.logger.warn(
        `Webhook enqueue failed for ${eventName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
