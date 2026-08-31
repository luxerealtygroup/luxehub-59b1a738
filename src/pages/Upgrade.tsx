import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowLeft, Building2, Check, X, Calendar, Zap } from "lucide-react";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";
import { useAuth } from "@/hooks/useAuth";
import { useOrgTier } from "@/hooks/useOrgTier";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { tenant } from '@/config/tenant';

type PurchasableTier = "pro" | "pro_plus" | "team";

const PRICE_IDS: Record<PurchasableTier, string[]> = {
  pro: ["pro_monthly_cad"],
  pro_plus: ["pro_plus_monthly_cad"],
  team: ["team_monthly_cad", "team_setup_cad"],
};

const ONBOARDING_URLS: Record<PurchasableTier, string> = {
  pro: "https://cal.com/kristen-schulz-wnjxcs/luxehub-pro-onboarding",
  pro_plus: "https://cal.com/kristen-schulz-wnjxcs/luxehub-pro-onboarding",
  team: "https://cal.com/kristen-schulz-wnjxcs/luxehub-team-onboarding",
};

type Feature = { label: string; included: boolean };

const PRO_FEATURES: Feature[] = [
  { label: "Unlimited CMA reports", included: true },
  { label: "CRM integrations (Slack + Follow Up Boss)", included: true },
  { label: "Premium support", included: true },
  { label: "Client Portals", included: false },
  { label: "Company Dashboard", included: false },
  { label: "Company Business Planning", included: false },
  { label: "Unlimited seats & branding", included: false },
];

const PRO_PLUS_FEATURES: Feature[] = [
  { label: "Everything in Pro", included: true },
  { label: "Client Portals (client-facing portal system)", included: true },
  { label: "Company Dashboard", included: false },
  { label: "Company Business Planning", included: false },
  { label: "Unlimited seats & branding", included: false },
];

const TEAM_FEATURES: Feature[] = [
  { label: "Everything in Pro+", included: true },
  { label: "Company Dashboard", included: true },
  { label: "Company Business Planning", included: true },
  { label: "Unlimited seats & branding", included: true },
];

function FeatureList({ features }: { features: Feature[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {features.map((f) => (
        <li key={f.label} className="flex items-start gap-2">
          {f.included ? (
            <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
          ) : (
            <X className="h-4 w-4 text-muted-foreground/50 mt-0.5 shrink-0" />
          )}
          <span className={f.included ? "" : "text-muted-foreground line-through"}>
            {f.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Upgrade() {
  const [searchParams] = useSearchParams();
  const success = searchParams.get("success") === "true";
  const canceled = searchParams.get("canceled") === "true";
  const tierParam = searchParams.get("tier") as PurchasableTier | null;
  const { user } = useAuth();
  const { orgId, tier, loading: orgLoading } = useOrgTier();
  const purchasedTier: PurchasableTier =
    tierParam ?? (tier === "pro" || tier === "pro_plus" || tier === "team" ? tier : "pro");
  const { openCheckout, checkoutElement, isOpen } = useStripeCheckout();

  const baseReturnUrl = `${window.location.origin}/dashboard/upgrade?success=true`;

  const handleUpgrade = (t: PurchasableTier) => {
    if (!orgId || !user) return;
    openCheckout({
      priceIds: PRICE_IDS[t],
      customerEmail: user.email,
      userId: user.id,
      orgId,
      returnUrl: `${baseReturnUrl}&tier=${t}`,
    });
  };

  const disabled = orgLoading || !orgId || !user;

  return (
    <div className="space-y-6">
      <PaymentTestModeBanner />
      <div className="max-w-6xl mx-auto space-y-6">
        <Link
          to="/dashboard"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
        </Link>

        <div className="text-center space-y-2">
          <h1 className="font-display text-3xl">Upgrade {tenant.appName}</h1>
          <p className="text-muted-foreground">Choose the plan that fits your business.</p>
        </div>

        {success && (
          <>
            <div className="bg-green-100 border border-green-300 text-green-800 px-4 py-3 rounded-md text-center">
              🎉 Your upgrade is processing. It may take a moment to activate.
            </div>
            <Card className="border-gold/30 max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle className="font-display text-xl flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-gold" />
                  Book your onboarding call
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Schedule a quick onboarding call with Kristen so we can get you set up and answer any questions.
                </p>
                <Button className="w-full bg-gold hover:bg-gold/90 text-gold-foreground" asChild>
                  <a href={ONBOARDING_URLS[purchasedTier]} target="_blank" rel="noopener noreferrer">
                    Schedule onboarding
                  </a>
                </Button>
              </CardContent>
            </Card>
          </>
        )}
        {canceled && (
          <div className="bg-amber-100 border border-amber-300 text-amber-800 px-4 py-3 rounded-md text-center">
            Upgrade canceled. You can try again anytime.
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          {/* Pro */}
          <Card className="border-gold/20 flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-gold" />
                  <CardTitle className="font-display text-xl">{tenant.appName} Pro</CardTitle>
                </div>
                {tier === "pro" && <Badge>Current</Badge>}
              </div>
              <div className="font-display text-3xl mt-2">
                $79 <span className="text-base font-normal text-muted-foreground">CAD/month</span>
              </div>
              <p className="text-sm text-muted-foreground">For individual agents.</p>
            </CardHeader>
            <CardContent className="space-y-4 flex-1 flex flex-col">
              <div className="flex-1"><FeatureList features={PRO_FEATURES} /></div>
              <Button
                variant="outline"
                className="w-full border-gold/40 hover:bg-gold/10"
                onClick={() => handleUpgrade("pro")}
                disabled={disabled}
              >
                Upgrade to Pro
              </Button>
            </CardContent>
          </Card>

          {/* Pro+ — highlighted */}
          <Card className="border-gold flex flex-col relative shadow-lg">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-gold text-gold-foreground hover:bg-gold">Most Popular</Badge>
            </div>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-gold" />
                  <CardTitle className="font-display text-xl">{tenant.appName} Pro+</CardTitle>
                </div>
                {tier === "pro_plus" && <Badge>Current</Badge>}
              </div>
              <div className="font-display text-3xl mt-2">
                $149 <span className="text-base font-normal text-muted-foreground">CAD/month</span>
              </div>
              <p className="text-sm text-muted-foreground">Everything in Pro plus Client Portals.</p>
            </CardHeader>
            <CardContent className="space-y-4 flex-1 flex flex-col">
              <div className="flex-1"><FeatureList features={PRO_PLUS_FEATURES} /></div>
              <Button
                className="w-full bg-gold hover:bg-gold/90 text-gold-foreground"
                onClick={() => handleUpgrade("pro_plus")}
                disabled={disabled}
              >
                Upgrade to Pro+
              </Button>
            </CardContent>
          </Card>

          {/* Team */}
          <Card className="border-gold/20 flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-gold" />
                  <CardTitle className="font-display text-xl">{tenant.appName} Team</CardTitle>
                </div>
                {tier === "team" && <Badge>Current</Badge>}
              </div>
              <div className="font-display text-3xl mt-2">
                $400 <span className="text-base font-normal text-muted-foreground">CAD/month</span>
              </div>
              <p className="text-sm text-muted-foreground">+ $1,000 CAD one-time setup fee</p>
            </CardHeader>
            <CardContent className="space-y-4 flex-1 flex flex-col">
              <div className="flex-1"><FeatureList features={TEAM_FEATURES} /></div>
              <Button
                variant="outline"
                className="w-full border-gold/40 hover:bg-gold/10"
                onClick={() => handleUpgrade("team")}
                disabled={disabled}
              >
                Upgrade to Team
              </Button>
            </CardContent>
          </Card>
        </div>

        {isOpen && checkoutElement}
      </div>
    </div>
  );
}
