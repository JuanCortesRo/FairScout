import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Marca de FairScout: una lupa (buscar talento) con un check dentro (evidencia verificada).
 * `claro` usa texto blanco para fondos oscuros.
 */
export function MarcaFairScout({ tamano = 36, className }) {
  const id = useId();
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 40 40" className={cn('shrink-0', className)} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b5bf0" />
          <stop offset="0.55" stopColor="#8b4ff0" />
          <stop offset="1" stopColor="#2bb6c9" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${id}-g)`} />
      <rect width="40" height="20" rx="11" fill={`url(#${id}-b)`} />
      <circle cx="17.5" cy="17.5" r="8.5" fill="none" stroke="#fff" strokeWidth="3" />
      <path d="M23.8 23.8 30 30" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <path d="m13.6 17.8 2.7 2.7 5.2-5.4" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Logo({ tamano = 36, claro = false, lema = false, className }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <MarcaFairScout tamano={tamano} className={claro ? 'drop-shadow-[0_6px_16px_rgba(91,91,240,0.45)]' : undefined} />
      <span className="leading-tight">
        <span className={cn('block font-heading text-[1.15rem] font-extrabold tracking-tight', claro ? 'text-white' : 'text-foreground')}>
          Fair<span className="texto-marca">Scout</span>
        </span>
        {lema && (
          <span className={cn('block text-[11px] font-medium', claro ? 'text-white/55' : 'text-muted-foreground')}>
            Talento elegido con evidencia
          </span>
        )}
      </span>
    </span>
  );
}
