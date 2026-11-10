// Small line icons on a 24px grid, 1.75 stroke, round caps.
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const Icon = {
  shield: () => (<svg viewBox="0 0 24 24" {...P}><path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></svg>),
  search: () => (<svg viewBox="0 0 24 24" {...P}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>),
  check: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 12.5l5 5L20 6.5" /></svg>),
  quote: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 6h16M4 12h10M4 18h7" /><path d="M17 15l3 3-3 3" /></svg>),
  eyes: () => (<svg viewBox="0 0 24 24" {...P}><circle cx="7.5" cy="12" r="3.5" /><circle cx="16.5" cy="12" r="3.5" /><path d="M11 12h2" /></svg>),
  form: () => (<svg viewBox="0 0 24 24" {...P}><rect x="4" y="3.5" width="16" height="17" rx="2.5" /><path d="M8 8.5h8M8 12.5h8M8 16.5h5" /></svg>),
  verify: () => (<svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.2l2.4 2.4 4.6-4.8" /></svg>),
  split: () => (<svg viewBox="0 0 24 24" {...P}><rect x="3.5" y="4" width="7" height="16" rx="2" /><rect x="13.5" y="4" width="7" height="16" rx="2" /><path d="M7 9h0M17 15h0" /></svg>),
  inbox: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 13l2.5-7.5h11L20 13v5.5a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5z" /><path d="M4 13h4.5l1 2h5l1-2H20" /></svg>),
  retry: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 12a8 8 0 0113.7-5.6L20 8.5" /><path d="M20 4v4.5h-4.5" /><path d="M20 12a8 8 0 01-13.7 5.6L4 15.5" /><path d="M4 20v-4.5h4.5" /></svg>),
  help: () => (<svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.4a2.5 2.5 0 014.8 1c0 1.7-2.4 2.2-2.4 3.6" /><path d="M12 17h0" /></svg>),
  arrow: () => (<svg viewBox="0 0 24 24" {...P}><path d="M5 12h14M13 6l6 6-6 6" /></svg>),
  play: () => (<svg viewBox="0 0 24 24" {...P}><path d="M8 5.5v13l10.5-6.5z" /></svg>),
  download: () => (<svg viewBox="0 0 24 24" {...P}><path d="M12 4v11M7 10.5l5 5 5-5" /><path d="M5 19.5h14" /></svg>),
  send: () => (<svg viewBox="0 0 24 24" {...P}><path d="M20.5 3.5L10 14" /><path d="M20.5 3.5l-6.5 17-4-6.5-6.5-4z" /></svg>),
  x: () => (<svg viewBox="0 0 24 24" {...P}><path d="M6 6l12 12M18 6L6 18" /></svg>),
  github: () => (<svg viewBox="0 0 24 24" {...P}><path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.4a3 3 0 00-.8-2.3c2.7-.3 5.6-1.4 5.6-6a4.7 4.7 0 00-1.3-3.2 4.3 4.3 0 00-.1-3.2s-1-.3-3.3 1.3a11.4 11.4 0 00-6 0C6.8 2.6 5.8 2.9 5.8 2.9a4.3 4.3 0 00-.1 3.2 4.7 4.7 0 00-1.3 3.2c0 4.6 2.9 5.7 5.6 6a3 3 0 00-.8 2.3V21" /></svg>),
};

/** The app mark: a shield with a check, drawn as a small tile. */
export function AppMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="app-icon" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="tdg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5B8CFF" />
          <stop offset="1" stopColor="#1B3BCC" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14.4" fill="url(#tdg)" />
      <path d="M32 13l15 6v12c0 9.4-6.3 15.8-15 19-8.7-3.2-15-9.6-15-19V19z" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinejoin="round" />
      <path d="M25 31.5l5 5 9-9.5" fill="none" stroke="#D4F53C" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
