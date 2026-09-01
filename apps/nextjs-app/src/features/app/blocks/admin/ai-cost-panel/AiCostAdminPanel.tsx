import { useQuery } from '@tanstack/react-query';
import { axios } from '@teable/openapi';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@teable/ui-lib/shadcn';
import type { ReactElement } from 'react';

interface IForecast {
  projected_total: number;
  mean_per_day: number;
  trend_slope: number;
  confidence: 'low' | 'medium' | 'high';
  would_exceed_alert?: boolean;
  alert_threshold_credits?: number;
}

interface IUsageRow {
  day: string;
  credits: number;
}

export function AiCostAdminPanel(): ReactElement {
  const forecast = useQuery({
    queryKey: ['admin-ai-cost-forecast'],
    queryFn: () => axios.get<IForecast>('/admin/ai-cost/forecast?days=14').then((r) => r.data),
  });

  const series = useQuery({
    queryKey: ['admin-ai-cost-series'],
    queryFn: () => axios.get<IUsageRow[]>('/admin/ai-cost/forecast/series?days=30').then((r) => r.data),
  });

  const f = forecast.data;
  const total = series.data?.reduce((acc, r) => acc + r.credits, 0) ?? 0;
  const maxDay = series.data?.reduce((max, r) => (r.credits > max.credits ? r : max), { day: '-', credits: 0 });

  return (
    <div className="space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Per-org AI token spend (next cycle)</CardTitle>
          <CardDescription>
            Linear regression over the last 14 days. Alerts when projected total crosses the
            configured threshold.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {forecast.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading forecast…</p>
          ) : !f ? (
            <p className="text-sm text-muted-foreground">No data.</p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Projected total</p>
                <p className="text-2xl font-semibold">{f.projected_total.toFixed(1)} cr</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Mean / day</p>
                <p className="text-2xl font-semibold">{f.mean_per_day.toFixed(2)} cr</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Trend slope</p>
                <p className={`text-2xl font-semibold ${f.trend_slope > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {f.trend_slope >= 0 ? '+' : ''}{f.trend_slope.toFixed(3)}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Confidence</p>
                <Badge variant={f.confidence === 'high' ? 'default' : f.confidence === 'medium' ? 'secondary' : 'outline'}>
                  {f.confidence}
                </Badge>
                {f.would_exceed_alert ? (
                  <p className="mt-1 text-xs text-red-600">
                    ⚠ exceeds {f.alert_threshold_credits} cr
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily AI credit usage (last 30 days)</CardTitle>
          <CardDescription>
            Total spend = {total.toFixed(1)} cr · peak = {maxDay?.credits.toFixed(2) ?? 0} cr on {maxDay?.day}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {series.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading series…</p>
          ) : !series.data || series.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No usage recorded yet.</p>
          ) : (
            <>
              {/* SVG sparkline */}
              <svg
                viewBox="0 0 600 80"
                preserveAspectRatio="none"
                className="h-20 w-full rounded border bg-muted/30"
              >
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="text-primary"
                  points={(() => {
                      const max = Math.max(...series.data.map((r) => r.credits), 1);
                      return series.data
                        .map((r, i) => {
                          const x = (i / Math.max(series.data!.length - 1, 1)) * 600;
                          const y = 80 - (r.credits / max) * 75;
                          return `${x.toFixed(1)},${y.toFixed(1)}`;
                        })
                        .join(' ');
                    })()}
                />
              </svg>
              <Table className="mt-3">
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Credits</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {series.data.slice(-10).reverse().map((r) => (
                    <TableRow key={r.day}>
                      <TableCell className="font-mono text-xs">{r.day}</TableCell>
                      <TableCell>{r.credits.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
