import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

/**
 * QR code drawn client-side onto a canvas — no paid service, works offline.
 */
export function QrCode({ value, size = 200, className }: { value: string; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a0a0a', light: '#ffffff' },
    }).catch(() => undefined);
  }, [value, size]);

  return <canvas ref={ref} className={className} aria-label="QR code" />;
}
