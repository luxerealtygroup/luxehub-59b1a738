import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { tenant } from '@/config/tenant';

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
};

const oauth = () => (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/login?next=" + encodeURIComponent(next);
        return;
      }
      setAccountEmail(sess.session.user?.email ?? null);
      const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorizationId)
      : await oauth().denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-gold/20 bg-card/50 backdrop-blur">
        <CardHeader>
          <CardTitle className="font-display text-2xl text-gold">
            {error ? "Authorization problem" : details ? `Connect ${clientName}` : "Loading…"}
          </CardTitle>
          <CardDescription>
            {error
              ? error
              : details
                ? `${clientName} is requesting access to ${tenant.appName} as you. It will only see the data your account can see.`
                : "Checking this authorization request…"}
          </CardDescription>
        </CardHeader>
        {details && !error && (
          <CardContent className="space-y-4">
            <dl className="space-y-2 rounded-md border border-border/60 bg-background/40 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Signed in as</dt>
                <dd className="truncate font-medium">{accountEmail ?? "your account"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Requesting app</dt>
                <dd className="truncate font-medium">{clientName}</dd>
              </div>
              {(details?.client?.redirect_uri ?? details?.redirect_uri) && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Returns to</dt>
                  <dd className="truncate font-medium">
                    {details?.client?.redirect_uri ?? details?.redirect_uri}
                  </dd>
                </div>
              )}
              {details?.scope && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Shares</dt>
                  <dd className="truncate font-medium">
                    {String(details.scope)
                      .split(/\s+/)
                      .filter(Boolean)
                      .map((s: string) =>
                        s === "email"
                          ? "your email address"
                          : s === "profile"
                            ? "your basic profile"
                            : s === "offline_access"
                              ? "ongoing access until you disconnect"
                              : s,
                      )
                      .join(", ")}
                  </dd>
                </div>
              )}
            </dl>
            <p className="text-xs text-muted-foreground">
              {clientName} will act as you inside {tenant.appName}. It cannot see anything your own
              account cannot see, and it stays inside your team's data.
            </p>
            <div className="flex gap-3">
            <Button
              disabled={busy}
              onClick={() => decide(true)}
              className="flex-1 bg-gold text-gold-foreground hover:bg-gold/90"
            >
              Approve
            </Button>
            <Button disabled={busy} variant="outline" onClick={() => decide(false)} className="flex-1">
              Deny
            </Button>
          </CardContent>
        )}
      </Card>
    </main>
  );
}
