import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@teable/ui-lib';

export interface IEnterprisePlaceholderPageProps {
  title: string;
  description: string;
  cloudCapability: string;
  ossBackend?: string;
}

export function EnterprisePlaceholderPage(props: IEnterprisePlaceholderPageProps) {
  const { title, description, cloudCapability, ossBackend } = props;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Mirrors the Teable Cloud surface
            <code className="mx-1 rounded bg-muted px-1 py-0.5">{cloudCapability}</code>.
            The current open-source build ships the backend route but no graphical
            administration form yet.
          </p>
          {ossBackend ? (
            <p>
              Backend wiring:
              <code className="ml-1 rounded bg-muted px-1 py-0.5">{ossBackend}</code>
            </p>
          ) : null}
          <p className="text-muted-foreground">
            Operators can configure the underlying behaviour via the documented HTTP
            endpoints or environment variables while the visual surface is in progress.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
