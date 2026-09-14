import { ArrowLeft, Mail, Headset, BookOpen, LifeBuoy, MessageCircle, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { tenant } from "@/config/tenant";

const Support = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-8">
          <Link to="/login">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>

        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-3">Support</h1>
          <p className="text-muted-foreground text-lg">
            We're here to help. Reach us any of the ways below — an Apple reviewer
            or any visitor can read this page without signing in.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 mb-10">
          <a
            href={`mailto:${tenant.supportEmail}`}
            className="flex items-start gap-4 rounded-xl border border-border/70 bg-card p-5 hover:border-gold/40 transition-colors"
          >
            <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Email us</h2>
              <p className="text-sm text-muted-foreground mt-1 break-all">
                {tenant.supportEmail}
              </p>
            </div>
          </a>

          <div className="flex items-start gap-4 rounded-xl border border-border/70 bg-card p-5">
            <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Response time</h2>
              <p className="text-sm text-muted-foreground mt-1">
                We reply within one business day, usually faster during weekday hours.
              </p>
            </div>
          </div>
        </div>

        <section className="space-y-6">
          <h2 className="text-2xl font-semibold">How to get help</h2>

          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="h-9 w-9 rounded-lg bg-gold/10 text-gold flex items-center justify-center shrink-0">
                <Headset className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">In-app support chat</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Signed-in agents and clients can open the support chat from the
                  bottom-right of any dashboard or portal page. Start with the AI
                  assistant, and if it can't resolve the issue it escalates to a
                  human teammate.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="h-9 w-9 rounded-lg bg-gold/10 text-gold flex items-center justify-center shrink-0">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">Email</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Send a message to{" "}
                  <a
                    href={`mailto:${tenant.supportEmail}`}
                    className="text-primary underline underline-offset-2"
                  >
                    {tenant.supportEmail}
                  </a>{" "}
                  and include a short description of the problem. This works even if
                  you can't sign in.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="h-9 w-9 rounded-lg bg-gold/10 text-gold flex items-center justify-center shrink-0">
                <LifeBuoy className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">For Apple reviewers</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  A demo account is available for testing. If you need demo
                  credentials or run into any issue exercising the app, email the
                  address above and we'll respond promptly.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6 mt-12">
          <h2 className="text-2xl font-semibold">Frequently asked</h2>
          <div className="space-y-4">
            <details className="rounded-lg border border-border/70 bg-card p-4">
              <summary className="font-medium cursor-pointer list-none flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                How do I sign in?
              </summary>
              <p className="text-sm text-muted-foreground mt-3">
                Agents sign in from the login page under "I'm a Realtor"; clients
                use "I'm a Client" or the client portal login. If you've forgotten
                your password, use the "Forgot password?" link on the login page.
              </p>
            </details>
            <details className="rounded-lg border border-border/70 bg-card p-4">
              <summary className="font-medium cursor-pointer list-none flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                I can't access my account
              </summary>
              <p className="text-sm text-muted-foreground mt-3">
                Email {tenant.supportEmail} with the address you signed up with and
                we'll help you regain access.
              </p>
            </details>
          </div>
        </section>

        <p className="text-xs text-muted-foreground mt-12">
          {tenant.brokerageName} · {tenant.appName}
        </p>
      </div>
    </div>
  );
};

export default Support;
