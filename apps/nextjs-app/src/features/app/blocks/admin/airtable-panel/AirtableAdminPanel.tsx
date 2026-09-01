import { useMutation } from '@tanstack/react-query';
import { axios } from '@teable/openapi';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@teable/ui-lib/shadcn';
import type { ReactElement } from 'react';
import { useState } from 'react';

interface IAnalysisResult {
  tables: Array<{ name: string; fields: number; records: number }>;
  warnings?: string[];
}

export function AirtableAdminPanel(): ReactElement {
  const [pat, setPat] = useState('');
  const [baseId, setBaseId] = useState('');

  const analyze = useMutation({
    mutationFn: (input: { pat: string; baseId: string }) =>
      axios
        .post<IAnalysisResult>('/base/import-airtable/analyze', input)
        .then((r) => r.data),
  });

  return (
    <div className="space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Run a base import from an Airtable base</CardTitle>
          <CardDescription>
            Uses the Airtable PAT to inspect the source base, then streams the tables into a Teable
            base. Compatible with Airtable formula / linked-record / rollup translation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="airtable-pat">Airtable PAT</Label>
              <Input
                id="airtable-pat"
                type="password"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder="patXXXXXXXXXXXXXX"
              />
            </div>
            <div>
              <Label htmlFor="airtable-base">Airtable base ID</Label>
              <Input
                id="airtable-base"
                value={baseId}
                onChange={(e) => setBaseId(e.target.value)}
                placeholder="appXXXXXXXXXXXXXX"
              />
            </div>
          </div>
          <Button
            disabled={!pat || !baseId || analyze.isPending}
            onClick={() => analyze.mutate({ pat, baseId })}
          >
            {analyze.isPending ? 'Analysing…' : 'Analyse base'}
          </Button>
          {analyze.isError ? (
            <p className="text-sm text-red-600">
              {(analyze.error as Error & { response?: { data?: { message?: string } } })?.response?.data?.message ??
                'Analyse failed — check PAT and base ID.'}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {analyze.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Analysis result</CardTitle>
            <CardDescription>
              {analyze.data.tables.length} tables found · {analyze.data.warnings?.length ?? 0} warnings
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analyze.data.warnings && analyze.data.warnings.length > 0 ? (
              <ul className="mb-3 list-disc pl-5 text-sm text-orange-600">
                {analyze.data.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ) : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Table</TableHead>
                  <TableHead>Fields</TableHead>
                  <TableHead>Records</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analyze.data.tables.map((t) => (
                  <TableRow key={t.name}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.fields}</TableCell>
                    <TableCell>{t.records.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 flex gap-2">
              <Button
                disabled={!pat || !baseId}
                onClick={() => {
                  void axios.post('/base/import-airtable/stream', { pat, baseId });
                }}
              >
                Start streaming import
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
