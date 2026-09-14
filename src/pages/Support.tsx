import { ArrowLeft, Mail, Phone, Clock, ChevronDown, Shield, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { tenant } from "@/config/tenant";

const FAQS = [
  {
    q: "I can't sign in",
    a: "Make sure you're using the same email address your invitation was sent to, and that you've selected the correct role, “I'm a Realtor” or “I'm a Client”, on the login screen.",
  },
  {
    q: "I didn't receive my invitation email",
    a: "Check your spam or junk folder. If it still hasn't arrived, email us and we'll resend it.",
  },
  {
    q: "How do I reset my password?",
    a: "Use the “Forgot password” link on the sign-in screen, or contact us and we'll help.",
  },
  {
    q: "Who can see my documents?",
    a: "Client documents are visible only to you and your assigned agent, plus brokerage administrators. Team documents are scoped to the brokerage that owns them.",
  },
  {
    q: "How do I delete my account or my data?",
    a: "Email info@luxerealtygroup.ca and we will action your request.",
  },
];

const Support = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="mb-8">
          <Link to="/login">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-gold">
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Button>
          </Link>
        </div>

        {/* Heading */}
        <div className="mb-12">
          <h1 className="text-4xl font-display font-bold text-gold mb-2">
            LUXEhub Support
          </h1>
          <p className="text-muted-foreground text-lg">
            Need help with LUXEhub? We're here.
          </p>
        </div>

        {/* CONTACT US */}
        <section className="mb-12">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gold mb-4">
            Contact Us
          </h2>
          <div className="rounded-xl border border-gold/20 bg-card/50 backdrop-blur p-6 space-y-4">
            <a
              href="mailto:info@luxerealtygroup.ca"
              className="flex items-center gap-3 text-foreground hover:text-gold transition-colors"
            >
              <Mail className="h-5 w-5 text-gold shrink-0" />
              <span>info@luxerealtygroup.ca</span>
            </a>
            <a
              href="tel:5192220405"
              className="flex items-center gap-3 text-foreground hover:text-gold transition-colors"
            >
              <Phone className="h-5 w-5 text-gold shrink-0" />
              <span>519-222-0405</span>
            </a>
            <div className="flex items-center gap-3 text-muted-foreground">
              <Clock className="h-5 w-5 text-gold shrink-0" />
              <span>Monday to Friday, 9:00 AM – 5:00 PM Eastern</span>
            </div>
            <p className="text-sm text-muted-foreground pt-2 border-t border-border/50">
              We aim to respond to all enquiries within one business day.
            </p>
          </div>
        </section>

        {/* GETTING STARTED */}
        <section className="mb-12">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gold mb-4">
            Getting Started
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            LUXEhub accounts are provided by your brokerage. If you are an agent or a
            client and don't yet have access, contact your agent or brokerage
            administrator to be invited.
          </p>
        </section>

        {/* COMMON QUESTIONS */}
        <section className="mb-12">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gold mb-4">
            Common Questions
          </h2>
          <div className="space-y-3">
            {FAQS.map((faq) => (
              <details
                key={faq.q}
                className="group rounded-lg border border-border/70 bg-card/50 backdrop-blur px-4 py-3"
              >
                <summary className="flex items-center justify-between cursor-pointer list-none font-medium text-foreground">
                  <span>{faq.q}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* PRIVACY */}
        <section className="mb-12">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gold mb-4">
            Privacy
          </h2>
          <a
            href="https://sites.google.com/luxerealtygroup.ca/luxehubprivacypolicy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-foreground hover:text-gold transition-colors"
          >
            <Shield className="h-4 w-4 text-gold" />
            LUXEhub Privacy Policy
          </a>
        </section>

        {/* Footer */}
        <footer className="border-t border-border/50 pt-6">
          <p className="text-sm text-muted-foreground">
            {tenant.brokerageLegalName}
          </p>
          <p className="text-sm text-muted-foreground">
            14 Erb Street West, Waterloo, Ontario N2L 1T2, Canada
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Support;
