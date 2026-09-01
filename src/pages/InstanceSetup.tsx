import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CheckCircle2, AlertCircle, Loader2, ShieldCheck, Lock } from 'lucide-react';

type IntegrationKey = 'FUB_API_KEY' | 'SLACK_BOT_TOKEN' | 'SLACK_SIGNING_SECRET';

interface IntegrationStatus {
  key: IntegrationKey;
  configured: boolean;
  source: 'vault' | 'env' | 'none';
  last4: string | null;
  savedAt: string | null;
  live: { ok: boolean; message: string } | null;
}

const FIELDS: {
  key: IntegrationKey;
  label: string;
  where: string;
  placeholder: string;
}[] = [
  {
    key: 'FUB_API_KEY',
    label: 'Follow Up Boss API key',
    where: 'In Follow Up Boss, go to Admin, then API, and create a key.',
    placeholder: 'Paste your Follow Up Boss API key',
  },
  {
    key: 'SLACK_BOT_TOKEN',
    label: 'Slack bot token',
    where: 'At api.slack.com, open your app and go to OAuth & Permissions — the Bot User OAuth Token starts with xoxb-.',
    placeholder: 'xoxb-…',
  },
  {
    key: 'SLACK_SIGNING_SECRET',
    label: 'Slack signing secret',
    where: 'At api.slack.com, open your app and go to Basic Information — under App Credentials.',
    placeholder: 'Your Slack signing secret',
  },
];

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

const InstanceSetup = () => {
  const { isOwner, isLoading: rolesLoading } = useUserRole();
  const [statuses, setStatuses] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('instance-setup', {
      body: { action: 'status' },
    });
    if (error) {
      toast.error('Could not load integration status.');
    } else {
      setStatuses(data?.integrations ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isOwner) void load();
    else if (!rolesLoading) setLoading(false);
  }, [isOwner, rolesLoading, load]);

  const save = async (key: IntegrationKey) => {
    const value = (values[key] ?? '').trim();
    if (!value) {
      toast.error('Enter a value first.');
      return;
    }
    setSaving(key);
    const { data, error } = await supabase.functions.invoke('instance-setup', {
      body: { action: 'save', key, value },
    });
    // Clear the typed value from memory as soon as the request returns.
    setValues((v) => ({ ...v, [key]: '' }));
    setSaving(null);

    const failure = data?.error ?? (error ? 'Could not save — the credential was rejected.' : null);
    if (failure) {
      toast.error(failure);
      return;
    }
    toast.success(data?.message ? `Saved. ${data.message}` : 'Saved.');
    setEditing((e) => ({ ...e, [key]: false }));
    void load();
  };

  if (rolesLoading) {
    return <div className="text-muted-foreground animate-pulse">Loading…</div>;
  }

  if (!isOwner) {
    return (
      <Card className="max-w-md">
        <CardContent className="pt-6 text-center space-y-2">
          <Lock className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">This page is only available to the account owner.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Finish setting up your hub</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Connect your own Follow Up Boss and Slack. Values are encrypted the moment they're saved
          and are never shown again — not to us, not to anyone.
        </p>
      </div>

      {loading ? (
        <div className="text-muted-foreground animate-pulse">Checking connections…</div>
      ) : (
        FIELDS.map((field) => {
          const status = statuses.find((s) => s.key === field.key);
          const connected = status?.configured;
          const isEditing = editing[field.key] || !connected;

          return (
            <Card key={field.key}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{field.label}</CardTitle>
                    <CardDescription className="mt-1">{field.where}</CardDescription>
                  </div>
                  {connected ? (
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-500 shrink-0">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-destructive/40 text-destructive shrink-0">
                      <AlertCircle className="h-3 w-3 mr-1" /> Not connected
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {connected && (
                  <p className="text-sm text-muted-foreground">
                    {status?.source === 'vault' ? (
                      <>
                        Connected — key ending {status?.last4 ?? '••••'}
                        {status?.savedAt ? `, saved ${formatDate(status.savedAt)}` : ''}
                      </>
                    ) : (
                      <>Connected using this instance's existing configuration.</>
                    )}
                    {status?.live && (
                      <span className={status.live.ok ? 'text-emerald-500 ml-2' : 'text-destructive ml-2'}>
                        · {status.live.message}
                      </span>
                    )}
                  </p>
                )}

                {isEditing ? (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={field.placeholder}
                      value={values[field.key] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void save(field.key);
                      }}
                    />
                    <div className="flex gap-2">
                      <Button onClick={() => void save(field.key)} disabled={saving === field.key}>
                        {saving === field.key ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Checking…
                          </>
                        ) : (
                          'Save'
                        )}
                      </Button>
                      {connected && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setEditing((e) => ({ ...e, [field.key]: false }));
                            setValues((v) => ({ ...v, [field.key]: '' }));
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setEditing((e) => ({ ...e, [field.key]: true }))}
                  >
                    Replace
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      <p className="text-xs text-muted-foreground flex items-start gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
        Each credential is tested against the provider before it's stored. If it doesn't work, it
        isn't saved. Stored values are write-only: no page, report or export can read them back.
      </p>
    </div>
  );
};

export default InstanceSetup;
