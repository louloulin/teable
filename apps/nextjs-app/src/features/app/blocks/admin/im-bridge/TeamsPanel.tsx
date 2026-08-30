import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteTeamsConfig,
  getSpaceList,
  getTeamsConfig,
  setTeamsConfig,
  testTeamsMessage,
} from '@teable/openapi';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { MessageSquare, PlugZap, Send, Unplug } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

export const TeamsPanel = () => {
  const queryClient = useQueryClient();
  const [spaceId, setSpaceId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [testText, setTestText] = useState('Teable Teams integration test');

  const spaces = useQuery({
    queryKey: ['admin', 'teams', 'spaces'],
    queryFn: () => getSpaceList().then(({ data }) => data),
  });
  const spaceOptions = useMemo(() => spaces.data ?? [], [spaces.data]);

  useEffect(() => {
    if (!spaceId && spaceOptions.length > 0) setSpaceId(spaceOptions[0]?.id ?? '');
  }, [spaceId, spaceOptions]);

  const config = useQuery({
    queryKey: ['admin', 'teams', 'config', spaceId],
    queryFn: () => getTeamsConfig(spaceId).then(({ data }) => data),
    enabled: Boolean(spaceId),
  });

  const save = useMutation({
    mutationFn: () => setTeamsConfig({ spaceId, webhookUrl }),
    onSuccess: ({ data }) => {
      toast.success(`Teams webhook saved (${data.masked})`);
      setWebhookUrl('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'teams', 'config', spaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: () => deleteTeamsConfig(spaceId),
    onSuccess: () => {
      toast.success('Teams webhook removed');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'teams', 'config', spaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const test = useMutation({
    mutationFn: () => testTeamsMessage({ spaceId, text: testText }),
    onSuccess: ({ data }) => {
      if (data.ok) toast.success(`Test message delivered (${data.status})`);
      else toast.error(data.error);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (spaces.isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div className="flex h-screen flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Microsoft Teams</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Configure a Teams Incoming Webhook per space for automation notifications.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="size-5" /> Connection
          </CardTitle>
          <CardDescription>
            Webhook URLs are encrypted at rest and masked in responses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-1">
            <Label htmlFor="teams-space">Space</Label>
            <Select value={spaceId} onValueChange={setSpaceId}>
              <SelectTrigger id="teams-space" className="w-full sm:w-80">
                <SelectValue placeholder="Select a space" />
              </SelectTrigger>
              <SelectContent>
                {spaceOptions.map((space) => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            {config.data?.configured ? (
              <Badge>Configured: {config.data.webhookUrl}</Badge>
            ) : (
              <Badge variant="secondary">Not configured</Badge>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="teams-webhook">Incoming Webhook URL</Label>
            <Input
              id="teams-webhook"
              type="url"
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              placeholder="https://...webhook.office.com/..."
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!spaceId || !webhookUrl || save.isPending}
              onClick={() => void save.mutate()}
            >
              <PlugZap className="mr-2 size-4" /> Save webhook
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  disabled={!config.data?.configured || remove.isPending}
                >
                  <Unplug className="mr-2 size-4" /> Remove
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove Teams webhook?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Automations will no longer deliver Teams messages for this space.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void remove.mutate()}>Remove</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Send test message</CardTitle>
          <CardDescription>
            Verify the configured webhook without changing automation data.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="teams-test-text">Message</Label>
            <Input
              id="teams-test-text"
              value={testText}
              onChange={(event) => setTestText(event.target.value)}
            />
          </div>
          <Button
            disabled={!spaceId || !config.data?.configured || !testText || test.isPending}
            onClick={() => void test.mutate()}
          >
            <Send className="mr-2 size-4" /> Send test
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
