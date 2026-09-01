import type { DehydratedState } from '@tanstack/react-query';
import {
  Code,
  ClipboardList,
  Database,
  Building2,
  Download as ImportIcon,
  FileSpreadsheet,
  FileText,
  Key,
  LayoutTemplate as TemplateIcon,
  MagicAi,
  Server as ServerIcon,
  MessageSquare,
  Settings,
  ShieldUser,
  Users,
  Webhook as WebhookIcon,
} from '@teable/icons';
import type { IUser } from '@teable/sdk';
import { SessionProvider } from '@teable/sdk';
import { AppProvider } from '@teable/sdk/context';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import React from 'react';
import { Sidebar } from '@/features/app/components/sidebar/Sidebar';
import { SidebarHeaderLeft } from '@/features/app/components/sidebar/SidebarHeaderLeft';
import { useSdkLocale } from '@/features/app/hooks/useSdkLocale';
import { AppLayout } from '@/features/app/layouts';
import { SidebarContent } from '../components/sidebar/SidebarContent';

export const AdminLayout: React.FC<{
  children: React.ReactNode;
  user?: IUser;
  dehydratedState?: DehydratedState;
}> = ({ children, user, dehydratedState }) => {
  const sdkLocale = useSdkLocale();
  const { i18n } = useTranslation();
  const { t: tCommon } = useTranslation('common');
  const { t: tSpace } = useTranslation('space');
  const router = useRouter();

  const onBack = () => {
    router.push({ pathname: '/space' });
  };

  const routes = [
    {
      Icon: Settings,
      label: tCommon('settings.title'),
      route: '/admin/setting',
      pathTo: '/admin/setting',
    },
    {
      Icon: MagicAi,
      label: 'AI settings',
      route: '/admin/ai-setting',
      pathTo: '/admin/ai-setting',
    },
    {
      Icon: MagicAi,
      label: 'AI App Builder',
      route: '/admin/ai-app-builder',
      pathTo: '/admin/ai-app-builder',
    },
    {
      Icon: Users,
      label: 'Users',
      route: '/admin/users',
      pathTo: '/admin/users',
    },
    {
      Icon: Building2,
      label: 'Spaces',
      route: '/admin/spaces',
      pathTo: '/admin/spaces',
    },
    {
      Icon: ServerIcon,
      label: 'Sandbox Agent',
      route: '/admin/sandbox-agent',
      pathTo: '/admin/sandbox-agent',
    },
    {
      Icon: MagicAi,
      label: 'Skills',
      route: '/admin/skills',
      pathTo: '/admin/skills',
    },
    {
      Icon: ClipboardList,
      label: 'Audit log',
      route: '/admin/audit-log',
      pathTo: '/admin/audit-log',
    },
    {
      Icon: MessageSquare,
      label: 'Announcements',
      route: '/admin/announcements',
      pathTo: '/admin/announcements',
    },
    {
      Icon: Key,
      label: 'License',
      route: '/admin/license',
      pathTo: '/admin/license',
    },
    {
      Icon: Database,
      label: 'Workspace mirror',
      route: '/admin/workspace-mirror',
      pathTo: '/admin/workspace-mirror',
    },
    {
      Icon: Database,
      label: 'Data databases',
      route: '/admin/data-db',
      pathTo: '/admin/data-db',
    },
    {
      Icon: Database,
      label: 'Operations',
      route: '/admin/operations',
      pathTo: '/admin/operations',
    },
    {
      Icon: Database,
      label: 'Computed Outbox',
      route: '/admin/computed-outbox',
      pathTo: '/admin/computed-outbox',
    },
    {
      Icon: Database,
      label: 'Table Query Ops',
      route: '/admin/table-query-ops',
      pathTo: '/admin/table-query-ops',
    },
    {
      Icon: MagicAi,
      label: 'AI generation diagnostics',
      route: '/admin/ai-generation-queue',
      pathTo: '/admin/ai-generation-queue',
    },
    {
      Icon: ClipboardList,
      label: 'Automation management',
      route: '/admin/automation',
      pathTo: '/admin/automation',
    },
    {
      Icon: TemplateIcon,
      label: tCommon('settings.templateAdmin.title'),
      route: '/admin/template',
      pathTo: '/admin/template',
    },
    {
      Icon: Code,
      label: tCommon('settings.apiExplorer.title'),
      route: '/admin/api-explorer',
      pathTo: '/admin/api-explorer',
    },
    {
      Icon: Key,
      label: tCommon('settings.scim.title'),
      route: '/admin/scim',
      pathTo: '/admin/scim',
    },
    {
      Icon: ImportIcon,
      label: tSpace('adminImport.navTitle'),
      route: '/admin/import',
      pathTo: '/admin/import',
    },
    {
      Icon: FileText,
      label: tCommon('admin.notion.title'),
      route: '/admin/notion',
      pathTo: '/admin/notion',
    },
    {
      Icon: FileSpreadsheet,
      label: tCommon('admin.googleSheets.title'),
      route: '/admin/google-sheets',
      pathTo: '/admin/google-sheets',
    },
    {
      Icon: WebhookIcon,
      label: tCommon('settings.webhook.title'),
      route: '/admin/webhook-delivery',
      pathTo: '/admin/webhook-delivery',
    },
    {
      Icon: MessageSquare,
      label: 'Microsoft Teams',
      route: '/admin/teams',
      pathTo: '/admin/teams',
    },
    {
      Icon: Key,
      label: 'BYOK (Bring Your Own Key)',
      route: '/admin/byok',
      pathTo: '/admin/byok',
    },
    {
      Icon: ShieldUser,
      label: 'Organization custom roles',
      route: '/admin/org-custom-role',
      pathTo: '/admin/org-custom-role',
    },
    {
      Icon: FileText,
      label: 'Billing',
      route: '/admin/billing',
      pathTo: '/admin/billing',
    },
    {
      Icon: Database,
      label: 'Cross-base federation',
      route: '/admin/cross-base-federation',
      pathTo: '/admin/cross-base-federation',
    },
    {
      Icon: MagicAi,
      label: 'Custom AI models',
      route: '/admin/custom-ai-model',
      pathTo: '/admin/custom-ai-model',
    },
    {
      Icon: TemplateIcon,
      label: 'DR canvas',
      route: '/admin/dr-canvas',
      pathTo: '/admin/dr-canvas',
    },
    {
      Icon: ClipboardList,
      label: 'Approval workflow',
      route: '/admin/approval-workflow',
      pathTo: '/admin/approval-workflow',
    },
    {
      Icon: ShieldUser,
      label: 'View permissions',
      route: '/admin/view-permission',
      pathTo: '/admin/view-permission',
    },
    {
      Icon: ServerIcon,
      label: 'Data residency',
      route: '/admin/data-residency',
      pathTo: '/admin/data-residency',
    },
    {
      Icon: Code,
      label: 'Custom domain',
      route: '/admin/custom-domain',
      pathTo: '/admin/custom-domain',
    },
    {
      Icon: Code,
      label: 'Conflict replay',
      route: '/admin/conflict-replay',
      pathTo: '/admin/conflict-replay',
    },
    {
      Icon: ClipboardList,
      label: 'Backup',
      route: '/admin/backup',
      pathTo: '/admin/backup',
    },

  ];

  return (
    <AppLayout>
      <Head>
        <title>{tCommon('noun.adminPanel')}</title>
      </Head>
      <AppProvider locale={sdkLocale} lang={i18n.language} dehydratedState={dehydratedState}>
        <SessionProvider user={user}>
          <div id="portal" className="relative flex h-screen w-full items-start">
            <Sidebar
              headerLeft={
                <SidebarHeaderLeft
                  title={tCommon('noun.adminPanel')}
                  icon={<ShieldUser className="size-5 shrink-0" />}
                  onBack={onBack}
                />
              }
            >
              <SidebarContent routes={routes} />
            </Sidebar>
            {children}
          </div>
        </SessionProvider>
      </AppProvider>
    </AppLayout>
  );
};
