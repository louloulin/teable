import { Command } from '@effect/cli';

import { dotteaImport } from './import';
import { dotteaInspect } from './inspect';

export const dottea = Command.make('dottea').pipe(
  Command.withDescription('Import dottea structures'),
  Command.withSubcommands([dotteaImport, dotteaInspect])
);
