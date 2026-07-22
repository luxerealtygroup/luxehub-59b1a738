import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, ArrowLeft } from 'lucide-react';

const Upgrade = () => (
  <div className="max-w-2xl mx-auto space-y-6">
    <Link to="/dashboard/cma-boss" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4 mr-1" /> Back
    </Link>
    <Card className="border-gold/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-gold" />
          <CardTitle className="font-display text-2xl">Upgrade LUXEhub</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>Free plan includes 5 CMA reports per month. Upgrade to Pro for unlimited CMAs and CRM integrations, or Team for the full company dashboard, branding and unlimited seats.</p>
        <p className="text-xs">Billing coming soon — contact us to upgrade in the meantime.</p>
        <Button className="bg-gold hover:bg-gold/90 text-gold-foreground">Contact Sales</Button>
      </CardContent>
    </Card>
  </div>
);

export default Upgrade;