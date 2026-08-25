/**
 * Supertest helper — NestJS auth service (Stage 99).
 */

import { Injectable } from '@nestjs/common';

import {
  buildHeaders,
  countByStatus,
  isBearerAuth,
  isExpectedStatus,
  runSequence,
  validateRequest,
} from './supertest-helper.service';
import type {
  IAppInvoker,
  IHttpHeadersInput,
  IHttpRequest,
  IHttpResponse,
  IRunSummary,
} from './supertest-helper.types';

@Injectable()
export class SupertestHelperAuthService {
  /** Stateless — just a thin wrapper to satisfy Nest DI. */
  constructor() {}

  /** Wrap an IAppInvoker; provides auth helpers. */
  wrap(invoker: IAppInvoker): {
    invoke: (req: IHttpRequest) => Promise<IHttpResponse>;
    withToken: (token: string) => IAppInvoker;
    sequence: (reqs: ReadonlyArray<IHttpRequest>) => Promise<IRunSummary>;
  } {
    return {
      invoke: (req: IHttpRequest) => invoker.invoke(req),
      withToken: (token: string) => this.bindToken(invoker, token),
      sequence: (reqs: ReadonlyArray<IHttpRequest>) => runSequence({ invoker, requests: reqs }),
    };
  }

  /** Build headers from input — public re-export. */
  headers(input: IHttpHeadersInput = {}): Record<string, string> {
    return buildHeaders(input);
  }

  /** Validate a request shape. */
  validate(req: IHttpRequest): string | null {
    return validateRequest(req);
  }

  /** Re-export isExpectedStatus. */
  matches(actual: number, expected: ReadonlyArray<number>): boolean {
    return isExpectedStatus(actual, expected);
  }

  /** Count hits by status. */
  tally(hits: IRunSummary['hits'], status: number): number {
    return countByStatus(hits, status);
  }

  /** Detect bearer token on a headers bag. */
  bearer(headers: Record<string, string>): boolean {
    return isBearerAuth(headers);
  }

  private bindToken(invoker: IAppInvoker, token: string): IAppInvoker {
    return {
      invoke: (req: IHttpRequest) =>
        invoker.invoke({
          ...req,
          headers: { ...buildHeaders({ token }), ...req.headers },
        }),
    };
  }
}
