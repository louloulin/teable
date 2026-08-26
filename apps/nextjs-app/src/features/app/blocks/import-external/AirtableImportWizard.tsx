import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Airtable, Check, HelpCircle, Search } from '@teable/icons';
import {
  getUserIntegrationList,
  importAirtableAnalyze,
  importAirtableStream,
  UserIntegrationProvider,
  type IImportAirtableAnalyzeVo,
  type IImportAirtableIssue,
  type IImportAirtableProgressEvent,
  type IImportAirtableVo,
  type IUserIntegrationItemVo,
} from '@teable/openapi';
import { ReactQueryKeys } from '@teable/sdk/config';
import { Spin } from '@teable/ui-lib/index';
import {
  Button,
  Checkbox,
  cn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipTrigger,
} from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import React from 'react';
import { useConnectIntegration } from '@/features/app/components/user-integration/useConnectIntegration';
import { spaceConfig } from '@/features/i18n/space.config';
import {
  ImportLogPanel,
  type ILogEntry,
  type ITableImportProgress,
} from '../space/component/upload-panel/ImportLogPanel';

const MAX_ISSUE_LOGS = 30;

type IAirtableBaseSummary = NonNullable<IImportAirtableAnalyzeVo['bases']>[number];
type IAirtableTableSummary = NonNullable<IImportAirtableAnalyzeVo['base']>['tables'][number];

// Airtable-like base tile colors, picked deterministically per base id. Mirrors
// the existing AirtableImportDialog palette so the new wizard matches the
// shipped UX. Kept here (instead of imported) so the new block is independent.
const BASE_TILE_COLORS = [
  'bg-blue-500',
  'bg-teal-500',
  'bg-emerald-600',
  'bg-amber-500',
  'bg-rose-500',
  'bg-violet-500',
  'bg-cyan-600',
  'bg-orange-500',
];

const getBaseTileColor = (baseId: string) => {
  let hash = 0;
  for (let i = 0; i < baseId.length; i++) {
    hash = (hash + baseId.charCodeAt(i)) % BASE_TILE_COLORS.length;
  }
  return BASE_TILE_COLORS[hash];
};

const getBaseInitials = (name: string) => name.trim().slice(0, 2);

type IStep = 'connect' | 'pick' | 'import';
type IConnectMode = 'oauth' | 'pat';

interface IAirtableImportWizardProps {
  spaceId: string;
  /** When set, import the Airtable base's tables into this existing base instead of creating a new one. */
  baseId?: string;
  /** When true the wizard is rendered; the parent owns visibility. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PHASE_I18N_MAP: Record<string, string> = {
  fetching_schema: 'space:airtableImport.phase.fetchingSchema',
  creating_base: 'space:airtableImport.phase.creatingBase',
  creating_table: 'space:airtableImport.phase.creatingTable',
  creating_links: 'space:airtableImport.phase.creatingLinks',
  applying_view_config: 'space:airtableImport.phase.applyingViewConfig',
};

const ISSUE_I18N_MAP: Record<IImportAirtableIssue['code'], string> = {
  fieldDegraded: 'space:airtableImport.issue.fieldDegraded',
  fieldSkipped: 'space:airtableImport.issue.fieldSkipped',
  viewSkipped: 'space:airtableImport.issue.viewSkipped',
  valuesDropped: 'space:airtableImport.issue.valuesDropped',
  viewConfigDegraded: 'space:airtableImport.issue.viewConfigDegraded',
};

/**
 * New external-import entry point for Airtable: a three-step wizard built on
 * top of the existing /api/import-airtable endpoints. Supports both OAuth (via
 * a stored user integration) and a pasted personal access token — the backend
 * accepts either via {integrationId, accessToken}, and we surface both in
 * step 1 ("connect") before moving to the base picker. Field-mapping is
 * derived server-side from the Airtable schema; step 3 just runs the SSE
 * stream and shows progress + issues.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
export const AirtableImportWizard = (props: IAirtableImportWizardProps) => {
  const { spaceId, baseId, open, onOpenChange } = props;
  const { t } = useTranslation(spaceConfig.i18nNamespaces);
  // t() expects compile-time literal keys; phase/issue keys are runtime strings.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tAny = t as (key: string, options?: Record<string, any>) => string;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [step, setStep] = React.useState<IStep>('connect');
  const [connectMode, setConnectMode] = React.useState<IConnectMode>('oauth');
  const [integration, setIntegration] = React.useState<IUserIntegrationItemVo | null>(null);
  const [pat, setPat] = React.useState('');
  const [baseSearch, setBaseSearch] = React.useState('');
  const [selectedBaseId, setSelectedBaseId] = React.useState('');
  const [importRecords, setImportRecords] = React.useState(true);
  const [importAttachments, setImportAttachments] = React.useState(true);
  const [isImporting, setIsImporting] = React.useState(false);
  const [logs, setLogs] = React.useState<ILogEntry[]>([]);
  const [tableProgresses, setTableProgresses] = React.useState<
    Record<string, ITableImportProgress>
  >({});
  const [createdBase, setCreatedBase] = React.useState<IImportAirtableVo['base'] | null>(null);

  const resetState = React.useCallback(() => {
    setStep('connect');
    setConnectMode('oauth');
    setIntegration(null);
    setPat('');
    setBaseSearch('');
    setSelectedBaseId('');
    setImportRecords(true);
    setImportAttachments(true);
    setIsImporting(false);
    setLogs([]);
    setTableProgresses({});
    setCreatedBase(null);
  }, []);

  // We probe for an existing OAuth grant so OAuth users who already connected
  // do not see the OAuth button again — they jump straight to the picker. The
  // EE-only user-integration endpoints return errors on OSS; treat any error
  // as "no integration available" and stay on the connect step.
  const { data: detectedIntegration, isError: integrationUnavailable } = useQuery({
    queryKey: [...ReactQueryKeys.getUserIntegrations(), 'airtable-import-wizard'],
    enabled: open && step === 'connect' && connectMode === 'oauth',
    retry: false,
    queryFn: async () =>
      (
        await getUserIntegrationList({ provider: UserIntegrationProvider.Airtable })
      ).data.integrations.find((item: IUserIntegrationItemVo) => item.hasSecret) ?? null,
  });

  React.useEffect(() => {
    if (!open || step !== 'connect' || connectMode !== 'oauth') return;
    if (detectedIntegration) {
      setIntegration(detectedIntegration);
      setStep('pick');
    }
  }, [open, step, connectMode, detectedIntegration]);

  // OAuth connect with auto-close handled by the shared hook; on success we read
  // back the freshly-connected integration and jump straight to the base picker.
  const { connect, isConnecting } = useConnectIntegration({
    onConnected: async () => {
      const found =
        (
          await getUserIntegrationList({ provider: UserIntegrationProvider.Airtable })
        ).data.integrations.find((item: IUserIntegrationItemVo) => item.hasSecret) ?? null;
      if (found) {
        setIntegration(found);
        setStep('pick');
      }
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      resetState();
    }
  };

  const addLog = React.useCallback((message: string, type: ILogEntry['type'] = 'info') => {
    setLogs((prev) => [...prev, { message, type, timestamp: Date.now() }]);
  }, []);

  // OAuth path uses integrationId (server-side token). PAT path uses accessToken
  // (direct API usage; never persisted). Both feed the same analyze/stream
  // endpoints; the backend picks whichever is provided.
  const credentials = React.useMemo<
    { integrationId: string } | { accessToken: string } | null
  >(() => {
    if (connectMode === 'oauth') {
      return integration ? { integrationId: integration.id } : null;
    }
    return pat.trim() ? { accessToken: pat.trim() } : null;
  }, [connectMode, integration, pat]);

  const {
    data: bases = [],
    isLoading: isLoadingBases,
    error: basesError,
  } = useQuery({
    // Credentials participate in the key so flipping OAuth<->PAT invalidates
    // the cached base list (the token scope can be very different).
    queryKey: ['airtable-import-wizard-bases', JSON.stringify(credentials)],
    enabled: open && !!credentials && step === 'pick',
    retry: false,
    queryFn: async () => {
      const { data } = await importAirtableAnalyze(credentials!);
      return (data.bases ?? []).sort((a: IAirtableBaseSummary, b: IAirtableBaseSummary) =>
        a.name.localeCompare(b.name)
      );
    },
  });

  // The backend returns a richer payload once a base id is provided — used to
  // show the table count / names in the picker so the user can sanity-check
  // their selection before clicking import.
  const { data: selectedBaseSchema } = useQuery({
    queryKey: ['airtable-import-wizard-base-schema', JSON.stringify(credentials), selectedBaseId],
    enabled: open && !!credentials && step === 'pick' && !!selectedBaseId,
    retry: false,
    queryFn: async () => {
      const { data } = await importAirtableAnalyze({
        ...credentials!,
        airtableBaseId: selectedBaseId,
      });
      return data as IImportAirtableAnalyzeVo;
    },
  });

  React.useEffect(() => {
    if (!basesError) return;
    toast.error(
      basesError instanceof Error ? basesError.message : t('space:airtableImport.failed')
    );
  }, [basesError, t]);

  // Preselect the first base once the list arrives.
  React.useEffect(() => {
    if (step === 'pick' && !selectedBaseId && bases.length > 0) {
      setSelectedBaseId(bases[0].id);
    }
  }, [step, selectedBaseId, bases]);

  const translatePhase = React.useCallback(
    (event: IImportAirtableProgressEvent) => {
      const i18nKey = PHASE_I18N_MAP[event.phase];
      if (!i18nKey) return undefined;
      return tAny(i18nKey, {
        detail: event.detail,
        tableName: event.tableName,
        tableIndex: event.tableIndex,
        totalTables: event.totalTables,
      });
    },
    [tAny]
  );

  const updateTableProgress = React.useCallback(
    (event: IImportAirtableProgressEvent) => {
      const tableName = event.tableName;
      if (!tableName) return;
      const isLinkPhase = event.phase === 'filling_links';
      const key = isLinkPhase ? `links:${tableName}` : `records:${tableName}`;
      setTableProgresses((previous) => ({
        ...previous,
        [key]: {
          tableId: key,
          tableName: isLinkPhase
            ? tAny('space:airtableImport.phase.fillingLinks', { tableName })
            : tableName,
          processedRows: event.processedRows ?? previous[key]?.processedRows ?? 0,
          status: event.phase === 'table_records_done' ? 'done' : 'running',
        },
      }));
    },
    [tAny]
  );

  const logIssues = React.useCallback(
    (issues: IImportAirtableIssue[]) => {
      if (issues.length === 0) return;
      addLog(t('space:airtableImport.issuesSummary', { count: issues.length }), 'warning');
      for (const issue of issues.slice(0, MAX_ISSUE_LOGS)) {
        addLog(tAny(ISSUE_I18N_MAP[issue.code], { ...issue }), 'warning');
      }
      if (issues.length > MAX_ISSUE_LOGS) {
        addLog(
          t('space:airtableImport.issuesMore', { count: issues.length - MAX_ISSUE_LOGS }),
          'warning'
        );
      }
    },
    [addLog, t, tAny]
  );

  const handleImport = async () => {
    if (!credentials) return;
    const base = bases.find((candidate: IAirtableBaseSummary) => candidate.id === selectedBaseId);
    if (!base) return;

    setStep('import');
    setIsImporting(true);
    try {
      const { data } = await importAirtableStream(
        {
          spaceId,
          ...(baseId ? { baseId } : {}),
          ...credentials,
          airtableBaseId: base.id,
          baseName: base.name,
          importRecords,
          importAttachments: importRecords && importAttachments,
        },
        (_phase, _detail, event) => {
          if (!event) return;
          if (
            event.phase === 'table_records_start' ||
            event.phase === 'table_records_progress' ||
            event.phase === 'table_records_done' ||
            event.phase === 'filling_links'
          ) {
            updateTableProgress(event);
            return;
          }
          const message = translatePhase(event);
          if (message) addLog(message);
        }
      );
      setTableProgresses((previous) =>
        Object.fromEntries(
          Object.entries(previous).map(([key, progress]) => [
            key,
            { ...progress, status: 'done' as const },
          ])
        )
      );
      logIssues(data.issues);
      addLog(t('space:airtableImport.done'), 'done');
      setCreatedBase(data.base);
      queryClient.invalidateQueries({ queryKey: ReactQueryKeys.baseList(spaceId) });
      queryClient.invalidateQueries({ queryKey: ReactQueryKeys.baseAll() });
      toast.success(t('space:airtableImport.done'), { description: data.base.name });
    } catch (error) {
      addLog(error instanceof Error ? error.message : t('space:airtableImport.failed'), 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const filteredBases = React.useMemo(() => {
    const query = baseSearch.trim().toLowerCase();
    if (!query) return bases;
    return bases.filter((base: IAirtableBaseSummary) => base.name.toLowerCase().includes(query));
  }, [bases, baseSearch]);

  const canProceedFromConnect = !!credentials;
  const canImport = !!selectedBaseId && !!credentials;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl" closeable={!isImporting}>
        <DialogHeader>
          <DialogTitle>{t('space:airtableImport.title')}</DialogTitle>
        </DialogHeader>

        {step === 'connect' && (
          <div className="space-y-4">
            <div className="flex items-center gap-1.5">
              <Label className="flex cursor-pointer items-center gap-2 font-normal">
                <input
                  type="radio"
                  name="connectMode"
                  value="oauth"
                  checked={connectMode === 'oauth'}
                  onChange={() => setConnectMode('oauth')}
                  className="size-4 accent-primary"
                />
                {t('space:airtableImport.connectMode.oauth')}
              </Label>
              <Label className="flex cursor-pointer items-center gap-2 font-normal">
                <input
                  type="radio"
                  name="connectMode"
                  value="pat"
                  checked={connectMode === 'pat'}
                  onChange={() => setConnectMode('pat')}
                  className="size-4 accent-primary"
                />
                {t('space:airtableImport.connectMode.pat')}
              </Label>
            </div>

            {connectMode === 'oauth' ? (
              integrationUnavailable ? (
                <p className="py-4 text-sm text-muted-foreground">
                  {t('space:airtableImport.integrationRequired')}
                </p>
              ) : (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Airtable className="size-10" />
                  <Button
                    onClick={() => connect(UserIntegrationProvider.Airtable, { name: 'Airtable' })}
                    disabled={isConnecting}
                  >
                    {isConnecting && <Spin className="mr-1 size-4" />}
                    {isConnecting
                      ? t('space:airtableImport.waitingOAuth')
                      : t('space:airtableImport.connectWithAirtable')}
                  </Button>
                </div>
              )
            ) : (
              <div className="space-y-2">
                <Label>{t('space:airtableImport.pat.label')}</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={pat}
                  onChange={(event) => setPat(event.target.value)}
                  placeholder={t('space:airtableImport.pat.placeholder')}
                />
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>{t('space:airtableImport.pat.help')}</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={t('space:airtableImport.pat.help')}
                          className="flex shrink-0 cursor-help text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <HelpCircle className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipPortal>
                        <TooltipContent align="start" className="max-w-xs">
                          <p>{t('space:airtableImport.pat.helpTooltip')}</p>
                        </TooltipContent>
                      </TooltipPortal>
                    </Tooltip>
                  </TooltipProvider>
                </p>
                <Button onClick={() => setStep('pick')} disabled={!pat.trim()}>
                  {t('space:airtableImport.continue')}
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 'pick' && (
          <div className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between">
                <Label>{t('space:airtableImport.pickBase')}</Label>
                {integration && (
                  <span className="text-xs text-muted-foreground">
                    {t('space:airtableImport.connectedAs', {
                      account: integration.metadata?.userInfo?.email ?? integration.name,
                    })}
                  </span>
                )}
              </div>
              {bases.length === 0 && !isLoadingBases ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('space:airtableImport.noBases')}
                </p>
              ) : (
                <>
                  {/* Search bar and grid stay mounted while loading so swapping
                      skeleton tiles for real ones never shifts the dialog height. */}
                  <div className="relative mt-2">
                    <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      value={baseSearch}
                      disabled={isLoadingBases}
                      placeholder={t('space:airtableImport.searchBases')}
                      onChange={(e) => setBaseSearch(e.target.value)}
                    />
                  </div>
                  {isLoadingBases ? (
                    <div className="mt-3 grid max-h-72 grid-cols-2 content-start gap-2 overflow-y-auto pr-1">
                      {Array.from({ length: 8 }).map((_, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2.5 rounded-lg border p-2.5"
                        >
                          <Skeleton className="size-9 shrink-0 rounded-lg" />
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <Skeleton className="h-3.5 w-2/3" />
                            <Skeleton className="h-3 w-1/3" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredBases.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      {t('space:airtableImport.noSearchResults')}
                    </p>
                  ) : (
                    <div className="mt-3 grid max-h-72 grid-cols-2 content-start gap-2 overflow-y-auto pr-1">
                      {filteredBases.map((base: IAirtableBaseSummary) => (
                        <button
                          key={base.id}
                          type="button"
                          onClick={() => setSelectedBaseId(base.id)}
                          className={cn(
                            'flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors',
                            selectedBaseId === base.id
                              ? 'border-primary bg-primary/5'
                              : 'hover:bg-muted/50'
                          )}
                        >
                          <div
                            className={cn(
                              'flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-medium text-white',
                              getBaseTileColor(base.id)
                            )}
                          >
                            {getBaseInitials(base.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{base.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {tAny(`space:airtableImport.permission.${base.permissionLevel}`, {
                                defaultValue: base.permissionLevel,
                              })}
                            </div>
                          </div>
                          {selectedBaseId === base.id && (
                            <Check className="size-4 shrink-0 text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {selectedBaseSchema?.base && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <div className="mb-1.5 font-medium">{t('space:airtableImport.tablesHeading')}</div>
                <ul className="grid max-h-32 grid-cols-2 gap-x-3 gap-y-0.5 overflow-y-auto pr-1">
                  {selectedBaseSchema.base.tables.map((table: IAirtableTableSummary) => (
                    <li key={table.id} className="truncate text-muted-foreground">
                      <span className="text-foreground">{table.name}</span>
                      <span className="ml-1">
                        ({t('space:airtableImport.tableMeta', { fieldCount: table.fieldCount })})
                      </span>
                    </li>
                  ))}
                </ul>
                {selectedBaseSchema.base.issues.length > 0 && (
                  <p className="mt-2 text-amber-600">
                    {t('space:airtableImport.issuesSummary', {
                      count: selectedBaseSchema.base.issues.length,
                    })}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label className="flex cursor-pointer items-center gap-2 font-normal">
                <Checkbox
                  checked={importRecords}
                  onCheckedChange={(checked) => setImportRecords(checked === true)}
                />
                {t('space:airtableImport.optionRecords')}
              </Label>
              <Label className="flex cursor-pointer items-center gap-2 font-normal">
                <Checkbox
                  checked={importRecords && importAttachments}
                  disabled={!importRecords}
                  onCheckedChange={(checked) => setImportAttachments(checked === true)}
                />
                {t('space:airtableImport.optionAttachments')}
              </Label>
            </div>
          </div>
        )}

        {step === 'import' && (
          <div className="relative h-72">
            <ImportLogPanel
              logs={logs}
              tableProgresses={Object.values(tableProgresses)}
              isImporting={isImporting}
            />
          </div>
        )}

        <DialogFooter>
          {step === 'connect' && (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              {t('common:actions.cancel')}
            </Button>
          )}
          {step === 'pick' && (
            <>
              <Button variant="outline" onClick={() => setStep('connect')}>
                {t('common:actions.back')}
              </Button>
              <Button onClick={handleImport} disabled={!canImport}>
                {t('space:airtableImport.import')}
              </Button>
            </>
          )}
          {step === 'import' && (
            <>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isImporting}
              >
                {t('space:airtableImport.close')}
              </Button>
              {!baseId && createdBase && (
                <Button
                  onClick={() => {
                    handleOpenChange(false);
                    router.push({ pathname: '/base/[baseId]', query: { baseId: createdBase.id } });
                  }}
                >
                  {t('space:airtableImport.openBase')}
                </Button>
              )}
            </>
          )}
        </DialogFooter>

        {/* canProceedFromConnect is a hint for future gating — the OAuth branch
            auto-advances when an integration is detected, the PAT branch gates
            on a non-empty input. */}
        <input type="hidden" data-can-proceed={canProceedFromConnect ? 'true' : 'false'} />
      </DialogContent>
    </Dialog>
  );
};
