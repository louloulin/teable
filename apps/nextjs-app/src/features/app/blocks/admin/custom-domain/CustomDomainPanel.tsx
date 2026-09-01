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
  Label,
  Skeleton,
} from '@teable/ui-lib';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useState } from 'react';

interface IDomainCheck {
  domain: string;
  cnameTarget: string;
  verified: boolean;
  reason?: string;
}

interface IDomainClaim {
  domain: string;
  organizationId: string;
  status: 'pending' | 'verified' | 'failed';
  cnameTarget: string;
  createdBy: string;
  createdAt: string;
}

export const CustomDomainPanel = () => {
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState('');
  const [orgId, setOrgId] = useState('');

  const check = useMutation({
    mutationFn: (d: string) =>
      axios
        .get<IDomainCheck>(`/api/admin/custom-domain/check`, { params: { domain: d } })
        .then(({ data }) => data),
    onSuccess: (data) => {
      if (data.verified) {
        toast.success(`Domain ${data.domain} is verified`);
      } else {
        toast.info(`Set CNAME ${data.domain} → ${data.cnameTarget}`);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const claim = useMutation({
    mutationFn: () =>
      axios
        .post<IDomainClaim>(`/api/admin/custom-domain/claim`, {
          domain,
          organizationId: orgId,
        })
        .then(({ data }) => data),
    onSuccess: (data) => {
      toast.success(`Domain claimed (${data.status})`);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'custom-domain'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Custom Domain</CardTitle>
          <CardDescription>
            Cloud §自定义域名 — verify and claim a custom domain for your workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>Domain</Label>
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="app.example.com"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Organization ID</Label>
            <Input
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              placeholder="org_xxx"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => domain && check.mutate(domain)}
              disabled={!domain || check.isPending}
            >
              {check.isPending ? 'Checking…' : 'Check CNAME'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => claim.mutate()}
              disabled={!domain || !orgId || claim.isPending}
            >
              {claim.isPending ? 'Claiming…' : 'Claim domain'}
            </Button>
          </div>
          {check.data && (
            <div className="rounded border p-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={check.data.verified ? 'default' : 'secondary'}>
                  {check.data.verified ? 'verified' : 'pending'}
                </Badge>
                <span className="font-mono">{check.data.domain}</span>
              </div>
              <div className="mt-1 text-muted-foreground">
                CNAME target: <span className="font-mono">{check.data.cnameTarget}</span>
              </div>
              {check.data.reason && <div className="text-xs text-muted-foreground">{check.data.reason}</div>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
