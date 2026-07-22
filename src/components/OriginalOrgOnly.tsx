import { useOrgTier } from '@/hooks/useOrgTier';
import { Card, CardContent } from '@/components/ui/card';
import { Inbox } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Optional label for empty state. */
  sectionName?: string;
}

/**
 * Renders children only for the original organization (Luxe Realty Group).
 * Other orgs see a friendly empty state — used for legacy seeded resource
 * content that shouldn't ship to newly onboarded organizations.
 */
export function OriginalOrgOnly({ children, sectionName = 'this section' }: Props) {
  const { loading, isOriginalOrg } = useOrgTier();
  if (loading) return null;
  if (isOriginalOrg) return <>{children}</>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Card className="border-dashed">
        <CardContent className="py-12 flex flex-col items-center text-center gap-3">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Inbox className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="font-display text-lg">Nothing here yet</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {sectionName} starts empty for your organization. Upload your own
            materials here so your team has one place to find them.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}