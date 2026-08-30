import { useQuery } from '@tanstack/react-query';
import { getBaseUsage } from '@teable/openapi';
import { BillingProductLevel, type IUsageVo, UsageFeatureLimit } from '@teable/openapi';
import { useBaseId } from '@teable/sdk/hooks';
import { useIsReadOnlyPreview } from '@teable/sdk/hooks/use-is-readonly-preview';
import { useIsCloud } from './useIsCloud';
import { useIsEE } from './useIsEE';
import { useIsSelfHosted } from './useIsSelfHosted';

export const SELF_HOSTED_USAGE: IUsageVo = {
  level: BillingProductLevel.Enterprise,
  limit: {
    [UsageFeatureLimit.MaxRows]: Number.MAX_SAFE_INTEGER,
    [UsageFeatureLimit.MaxSizeAttachments]: Number.MAX_SAFE_INTEGER,
    [UsageFeatureLimit.MaxNumAutomationRuns]: Number.MAX_SAFE_INTEGER,
    [UsageFeatureLimit.MaxNumDatabaseConnections]: Number.MAX_SAFE_INTEGER,
    [UsageFeatureLimit.MaxRevisionHistoryDays]: Number.MAX_SAFE_INTEGER,
    [UsageFeatureLimit.MaxAutomationHistoryDays]: Number.MAX_SAFE_INTEGER,
    [UsageFeatureLimit.AutomationEnable]: true,
    [UsageFeatureLimit.AuditLogEnable]: true,
    [UsageFeatureLimit.AdminPanelEnable]: true,
    [UsageFeatureLimit.RowColoringEnable]: true,
    [UsageFeatureLimit.ButtonFieldEnable]: true,
    [UsageFeatureLimit.FieldAIEnable]: true,
    [UsageFeatureLimit.UserGroupEnable]: true,
    [UsageFeatureLimit.AdvancedExtensionsEnable]: true,
    [UsageFeatureLimit.AdvancedPermissionsEnable]: true,
    [UsageFeatureLimit.PasswordRestrictedSharesEnable]: true,
    [UsageFeatureLimit.AuthenticationEnable]: true,
    [UsageFeatureLimit.DomainVerificationEnable]: true,
    [UsageFeatureLimit.OrganizationEnable]: true,
    [UsageFeatureLimit.APIRateLimit]: Number.MAX_SAFE_INTEGER,
    [UsageFeatureLimit.ChatAIEnable]: true,
    [UsageFeatureLimit.AppEnable]: true,
    [UsageFeatureLimit.AppHideBadgeEnable]: true,
    [UsageFeatureLimit.CustomDomainEnable]: true,
    [UsageFeatureLimit.MaxNumSystemSendEmail]: Number.MAX_SAFE_INTEGER,
  },
};

export const useBaseUsage = (props?: { disabled?: boolean }) => {
  const isEE = useIsEE();
  const isCloud = useIsCloud();
  const isSelfHosted = useIsSelfHosted();
  const baseId = useBaseId() as string;
  const isReadOnlyPreview = useIsReadOnlyPreview();

  const { data: baseUsage } = useQuery({
    queryKey: ['base-usage', baseId],
    queryFn: ({ queryKey }) => getBaseUsage(queryKey[1]).then(({ data }) => data),
    enabled:
      !props?.disabled &&
      Boolean(baseId) &&
      (isCloud || isEE) &&
      !isSelfHosted &&
      !isReadOnlyPreview,
  });

  return isSelfHosted ? SELF_HOSTED_USAGE : baseUsage;
};

export const useBaseUsageWithLoading = (props?: { disabled?: boolean }) => {
  const isEE = useIsEE();
  const isCloud = useIsCloud();
  const isSelfHosted = useIsSelfHosted();
  const baseId = useBaseId() as string;

  const {
    data: baseUsage,
    isLoading,
    isFetched,
  } = useQuery({
    queryKey: ['base-usage', baseId],
    queryFn: ({ queryKey }) => getBaseUsage(queryKey[1]).then(({ data }) => data),
    enabled: !props?.disabled && Boolean(baseId) && (isCloud || isEE) && !isSelfHosted,
  });

  return {
    baseUsage: isSelfHosted ? SELF_HOSTED_USAGE : baseUsage,
    loading: isSelfHosted ? false : isLoading,
    isFetched: isSelfHosted ? true : isFetched,
  };
};
