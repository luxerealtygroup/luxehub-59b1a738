import { ExternalLink, FileText, BookOpen, ClipboardList, Wand2, ListChecks } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Link } from 'react-router-dom';

export default function ListingsResources() {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Listings Resources</h1>
        <p className="text-sm text-muted-foreground mt-1">Materials for sellers and listing presentations.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <a
          href="https://simplebooklet.com/luxerealtygroupsellingyourhome"
          target="_blank"
          rel="noopener noreferrer"
          className="group"
        >
          <Card className="p-5 h-full border-gold/20 hover:border-gold/60 hover:bg-gold/5 transition-colors">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                <BookOpen className="h-5 w-5 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-foreground">Seller Guide Flipbook</h3>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-gold" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Interactive online flipbook version of the Selling Your Home guide.
                </p>
              </div>
            </div>
          </Card>
        </a>

        <a
          href="/resources/LUXERealtyGroup-SellingYourHome.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="group"
        >
          <Card className="p-5 h-full border-gold/20 hover:border-gold/60 hover:bg-gold/5 transition-colors">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-foreground">Selling Your Home (PDF)</h3>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-gold" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Downloadable PDF of the LUXE Realty Group seller guide.
                </p>
              </div>
            </div>
          </Card>
        </a>

        <a
          href="/resources/listings/Schedule-A-Listing.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="group"
        >
          <Card className="p-5 h-full border-gold/20 hover:border-gold/60 hover:bg-gold/5 transition-colors">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-foreground">Schedule A – Listing (PDF)</h3>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-gold" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  LUXE Schedule A for listing agreements.
                </p>
              </div>
            </div>
          </Card>
        </a>

        <a
          href="/resources/listings/Schedule-A-Seller.docx"
          target="_blank"
          rel="noopener noreferrer"
          className="group"
        >
          <Card className="p-5 h-full border-gold/20 hover:border-gold/60 hover:bg-gold/5 transition-colors">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-foreground">Schedule A – Seller (DOCX)</h3>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-gold" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Editable Word version of Schedule A for sellers.
                </p>
              </div>
            </div>
          </Card>
        </a>

        <a
          href="https://exprealty.formstack.com/forms/ontario_deposit"
          target="_blank"
          rel="noopener noreferrer"
          className="group"
        >
          <Card className="p-5 h-full border-gold/20 hover:border-gold/60 hover:bg-gold/5 transition-colors">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                <ClipboardList className="h-5 w-5 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-foreground">Deposit Instructions</h3>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-gold" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Submit Ontario deposit instructions via eXp Realty form.
                </p>
              </div>
            </div>
          </Card>
        </a>

        <a
          href="https://exptransactionguide.com/ON/clause-generator"
          target="_blank"
          rel="noopener noreferrer"
          className="group"
        >
          <Card className="p-5 h-full border-gold/20 hover:border-gold/60 hover:bg-gold/5 transition-colors">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                <Wand2 className="h-5 w-5 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-foreground">Clause Generator</h3>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-gold" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Ontario eXp Transaction Guide clause generator.
                </p>
              </div>
            </div>
          </Card>
        </a>

        <a
          href="https://exptransactionguide.com/ON/transaction-checklists"
          target="_blank"
          rel="noopener noreferrer"
          className="group"
        >
          <Card className="p-5 h-full border-gold/20 hover:border-gold/60 hover:bg-gold/5 transition-colors">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                <ListChecks className="h-5 w-5 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-foreground">Transaction Checklists</h3>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-gold" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Ontario eXp Transaction Guide checklists.
                </p>
              </div>
            </div>
          </Card>
        </a>

        <Link to="/dashboard/cma-boss" className="group">
          <Card className="p-5 h-full border-gold/20 hover:border-gold/60 hover:bg-gold/5 transition-colors">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground">CMA Boss</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Generate comparative market analyses for your listings.
                </p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}