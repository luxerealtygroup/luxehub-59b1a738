import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowLeft, Building2, Check } from "lucide-react";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";
import { useAuth } from "@/hooks/useAuth";
import { useOrgTier } from "@/hooks/useOrgTier";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

const PRO_PRICE_IDS = ["pro_monthly_cad"];
const TEAM_PRICE_IDS = ["team_monthly_cad", "team_setup_cad"];

export default function Upgrade() {
  const [searchParams] = useSearchParams();
  const success = searchParams.get("success") === "true";
  const canceled = searchParams.get("canceled") === "true";
  const { user } = useAuth();
  const { orgId, tier, loading: orgLoading } = useOrgTier();
  const { openCheckout, checkoutElement, isOpen } = useStripeCheckout();

  const returnUrl = `${window.location.origin}/dashboard/upgrade?success=true`;

  const handleUpgrade = (priceIds: string[]) => {
    if (!orgId || !user) return;
    openCheckout({
      priceIds,
      customerEmail: user.email,
      userId: user.id,
      orgId,
      returnUrl,
    });
  };

  return (
    <div className="space-y-6">
      <PaymentTestModeBanner />
      <div className="max-w-5xl mx-auto space-y-6">
        <Link
          to="/dashboard"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
        </Link>

        <div className="text-center space-y-2">
          <h1 className="font-display text-3xl">Upgrade LUXEhub</h1>
          <p className="text-muted-foreground">
            Choose the plan that fits your business.
          </p>
        </div>

        {success && (
          <div className="bg-green-100 border border-green-300 text-green-800 px-4 py-3 rounded-md text-center">
            🎉 Your upgrade is processing. It may take a moment to activate.
          </div>
        )}
        {canceled && (
          <div className="bg-amber-100 border border-amber-300 text-amber-800 px-4 py-3 rounded-md text-center">
            Upgrade canceled. You can try again anytime.
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-gold/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-gold" />
                  <CardTitle className="font-display text-xl">LUXEhub Pro</CardTitle>
                </div>
                {tier === "pro" && <Badge>Current</Badge>}
              </div>
              <div className="font-display text-3xl">
                $79{" "}
                <span className="text-base font-normal text-muted-foreground">
                  CAD/month
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" /> Unlimited CMA reports
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" /> CRM integrations
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" /> Premium support
                </li>
              </ul>
              <Button
                className="w-full bg-gold hover:bg-gold/90 text-gold-foreground"
                onClick={() => handleUpgrade(PRO_PRICE_IDS)}
                disabled={orgLoading || !orgId || !user}
              >
                Upgrade to Pro
              </Button>
            </CardContent>
          </Card>

          <Card className="border-gold/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-gold" />
                  <CardTitle className="font-display text-xl">LUXEhub Team</CardTitle>
                </div>
                {tier === "team" && <Badge>Current</Badge>}
              </div>
              <div className="font-display text-3xl">
                $400{" "}
                <span className="text-base font-normal text-muted-foreground">
                  CAD/month
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                + $1,000 CAD one-time setup fee
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" /> Everything in Pro
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" /> Company dashboard
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" /> Unlimited seats & branding
                </li>
              </ul>
              <Button
                className="w-full bg-gold hover:bg-gold/90 text-gold-foreground"
                onClick={() => handleUpgrade(TEAM_PRICE_IDS)}
                disabled={orgLoading || !orgId || !user}
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
