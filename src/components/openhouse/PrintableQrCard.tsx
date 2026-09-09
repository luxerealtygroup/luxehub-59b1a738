import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { tenant } from '@/config/tenant';

/**
 * Opens a print-ready card: address, QR and "Sign in here".
 * Rendered into a new window so printing never disturbs the app.
 */
export async function printQrCard(opts: { url: string; heading: string; subheading?: string }) {
  const dataUrl = await QRCode.toDataURL(opts.url, { width: 900, margin: 1, errorCorrectionLevel: 'M' });
  const win = window.open('', '_blank', 'width=820,height=1100');
  if (!win) return;
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Sign in here</title>
<style>
  @page { size: letter portrait; margin: 0.5in; }
  body { font-family: Georgia, 'Times New Roman', serif; text-align: center; color: #111; margin: 0; padding: 48px 32px; }
  .eyebrow { letter-spacing: .28em; text-transform: uppercase; font-size: 13px; color: #8a6d1f; font-family: Helvetica, Arial, sans-serif; }
  h1 { font-size: 34px; margin: 18px 0 4px; }
  h2 { font-size: 19px; font-weight: normal; color: #555; margin: 0 0 28px; }
  img { width: 380px; height: 380px; }
  .cta { font-size: 40px; letter-spacing: .04em; margin-top: 26px; }
  .hint { font-family: Helvetica, Arial, sans-serif; font-size: 15px; color: #666; margin-top: 10px; }
  .rule { width: 90px; height: 3px; background: #c9a227; margin: 22px auto; }
</style></head><body>
  <div class="eyebrow">${esc(tenant.brokerageName)}</div>
  <h1>${esc(opts.heading)}</h1>
  ${opts.subheading ? `<h2>${esc(opts.subheading)}</h2>` : ''}
  <img src="${dataUrl}" alt="QR code" />
  <div class="rule"></div>
  <div class="cta">Sign in here</div>
  <div class="hint">Point your camera at the code</div>
</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

export function PrintQrButton({
  url,
  heading,
  subheading,
  label = 'Print card',
}: {
  url: string;
  heading: string;
  subheading?: string;
  label?: string;
}) {
  return (
    <Button variant="outline" size="sm" onClick={() => printQrCard({ url, heading, subheading })}>
      <Printer className="mr-1.5 h-4 w-4" /> {label}
    </Button>
  );
}
