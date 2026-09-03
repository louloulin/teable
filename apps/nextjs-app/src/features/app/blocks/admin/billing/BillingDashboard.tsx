import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { axios } from '@teable/openapi';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@teable/ui-lib';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useState } from 'react';

type BillingPlanCode = 'free' | 'pro' | 'team' | 'business' | 'enterprise';
type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'trialing'
  | 'unpaid';

interface ISubscription {
  id: string;
  organizationId: string;
  planCode: BillingPlanCode;
  status: SubscriptionStatus;
  externalSubscriptionId: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  seats: number;
}

interface IInvoice {
  id: string;
  subscriptionId: string;
  externalInvoiceId: string;
  amountCents: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

interface IPlan {
  code: BillingPlanCode;
  name: string;
  monthlyUsd: number;
  features: string[];
}

const STATUS_COLOR: Record<SubscriptionStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'secondary',
  trialing: 'secondary',
  past_due: 'destructive',
  canceled: 'outline',
  incomplete: 'destructive',
  unpaid: 'destructive',
};

export const BillingDashboard = () => {
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState('');
  const [successUrl, setSuccessUrl] = useState('');
  const [cancelUrl, setCancelUrl] = useState('');

  const subscriptionQuery = useQuery({
    queryKey: ['admin', 'billing', 'subscription', orgId],
    queryFn: () =>
      axios
        .get<{ subscription: ISubscription | null }>(
          `/api/admin/billing/subscriptions/${orgId}`
        )
        .then((r) => r.data.subscription),
    enabled: Boolean(orgId),
  });

  const invoicesQuery = useQuery({
    queryKey: ['admin', 'billing', 'invoices', subscriptionQuery.data?.id],
    queryFn: () =>
      axios
        .get<{ invoices: IInvoice[]; count: number }>(
          `/api/admin/billing/invoices/${orgId}`
        )
        .then((r) => r.data),
    enabled: Boolean(subscriptionQuery.data),
  });

  const plansQuery = useQuery({
    queryKey: ['admin', 'billing', 'plans'],
    queryFn: () =>
      axios
        .get<{ plans: IPlan[] }>('/api/admin/billing/plans')
        .then((r) => r.data.plans),
  });

  const checkout = useMutation({
    mutationFn: (planCode: BillingPlanCode) =>
      axios.post<{ sessionId: string; url: string }>('/api/billing/checkout', {
        organizationId: orgId,
        planCode,
        seats: 1,
        successUrl: successUrl || `${window.location.origin}/admin/billing?status=success`,
        cancelUrl: cancelUrl || `${window.location.origin}/admin/billing?status=cancel`,
      }),
    onSuccess: (res) => {
      window.location.href = res.data.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: () =>
      axios.post<{ status: SubscriptionStatus }>(
        `/api/admin/billing/subscriptions/${orgId}/cancel`,
        { atPeriodEnd: true }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'billing'] });
      toast.success('Cancellation scheduled');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const subscription = subscriptionQuery.data;
  const invoices = invoicesQuery.data?.invoices ?? [];
  const plans = plansQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Subscription, invoices, and Stripe Checkout for paid plans. Configure{' '}
          <code>STRIPE_SECRET_KEY</code> + <code>STRIPE_PRICE_ID_*</code> on the server to enable
        the &ldquo;subscribe&rdquo; buttons.
        </p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Target organization</CardTitle>
          <CardDescription>
            Enter an organization id to scope the subscription and invoices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="org_xxx"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
          />
        </CardContent>
      </Card>

      {!orgId ? null : subscriptionQuery.isLoading ? (
        <Skeleton className="h-32 w-full max-w-3xl" />
      ) : (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>Current subscription</CardTitle>
            <CardDescription>
              Stripe-managed. Cancellation is scheduled at period end by default.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {subscription ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{subscription.planCode}</span>
                  <Badge variant={STATUS_COLOR[subscription.status]}>
                    {subscription.status}
                  </Badge>
                  {subscription.cancelAtPeriodEnd && (
                    <Badge variant="outline">cancels at period end</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  external: <code>{subscription.externalSubscriptionId}</code> · period:{' '}
                  {new Date(subscription.currentPeriodStart).toLocaleDateString()} -{' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()} · seats:{' '}
                  {subscription.seats}
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    disabled={cancel.isPending || subscription.status === 'canceled'}
                    onClick={() => cancel.mutate()}
                  >
                    {cancel.isPending ? 'Cancelling...' : 'Cancel at period end'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No subscription yet.</div>
            )}
          </CardContent>
        </Card>
      )}

      {!orgId ? null : (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>Invoices ({invoices.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {invoicesQuery.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : invoices.length === 0 ? (
              <div className="text-sm text-muted-foreground">No invoices yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Period</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <code className="text-xs">{inv.externalInvoiceId}</code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{inv.status}</Badge>
                      </TableCell>
                      <TableCell>
                        ${(inv.amountCents / 100).toFixed(2)} {inv.currency}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(inv.periodStart).toLocaleDateString()} -{' '}
                        {new Date(inv.periodEnd).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Subscribe</CardTitle>
          <CardDescription>
            Pick a paid plan. Stripe Checkout opens in a new tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Success URL (optional)</label>
              <Input
                value={successUrl}
                onChange={(e) => setSuccessUrl(e.target.value)}
                placeholder="https://app.../admin/billing?status=success"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Cancel URL (optional)</label>
              <Input
                value={cancelUrl}
                onChange={(e) => setCancelUrl(e.target.value)}
                placeholder="https://app.../admin/billing?status=cancel"
              />
            </div>
          </div>
          {plansQuery.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <div
                  key={plan.code}
                  className="flex flex-col gap-2 rounded border p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{plan.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {plan.monthlyUsd === 0
                        ? plan.code === 'enterprise'
                          ? 'Contact'
                          : 'Free'
                        : `$${plan.monthlyUsd}/mo`}
                    </span>
                  </div>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {plan.features.map((f) => (
                      <li key={f}>- {f}</li>
                    ))}
                  </ul>
                  <Button
                    size="sm"
                    variant={plan.code === subscription?.planCode ? 'outline' : 'default'}
                    disabled={
                      !orgId ||
                      plan.code === 'free' ||
                      checkout.isPending
                    }
                    onClick={() => checkout.mutate(plan.code)}
                  >
                    {plan.code === subscription?.planCode
                      ? 'Current'
                      : plan.code === 'enterprise'
                        ? 'Contact sales'
                        : 'Subscribe'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
