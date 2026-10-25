import type { EntityKind, SlotKind } from "../shared/types";

type P = { size?: number; className?: string };

const base = (size = 16) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const Icon = {
  film: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
    </svg>
  ),
  tv: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M8 21h8M12 18v3M8 2l4 4 4-4" />
    </svg>
  ),
  music: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  ),
  book: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </svg>
  ),
  dinner: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <path d="M7 2v9M4 2v5a3 3 0 0 0 6 0V2M7 11v11M17 2c-2 2-3 5-3 8h3v12" />
    </svg>
  ),
  drinks: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <path d="M5 3h14l-7 9zM12 12v8M8 21h8" />
    </svg>
  ),
  place: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
  trip: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <path d="M2 16l20-8-6 13-3-6-6 3z" />
      <path d="M13 15l9-7" />
    </svg>
  ),
  podcast: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" />
    </svg>
  ),
  game: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <rect x="2" y="7" width="20" height="11" rx="4" />
      <path d="M7 11v3M5.5 12.5h3M15 12h.01M18 13.5h.01" />
    </svg>
  ),
  plus: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  x: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  ),
  check: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  copy: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  ),
  send: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
    </svg>
  ),
  receipt: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <path d="M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2z" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </svg>
  ),
  swap: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
    </svg>
  ),
  ban: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </svg>
  ),
  sun: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  moon: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
  github: ({ size, className }: P) => (
    <svg width={size ?? 16} height={size ?? 16} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  ),
  search: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </svg>
  ),
  chevron: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  people: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M15.6 14.2c2.3.2 4.2 1.8 4.9 4.8" />
    </svg>
  ),
  chart: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <path d="M5 20V11M12 20V5M19 20v-7" />
    </svg>
  ),
  shield: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  info: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  ),
  arrowUp: ({ size, className }: P) => (
    <svg {...base(size)} className={className} strokeWidth={2.2}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  ),
  spark: ({ size, className }: P) => (
    <svg {...base(size)} className={className}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    </svg>
  ),
};

export function KindIcon({ kind, size = 14 }: { kind: EntityKind; size?: number }) {
  switch (kind) {
    case "movie":
      return <Icon.film size={size} />;
    case "tv_show":
      return <Icon.tv size={size} />;
    case "artist":
      return <Icon.music size={size} />;
    case "book":
      return <Icon.book size={size} />;
    case "place":
      return <Icon.place size={size} />;
    case "destination":
      return <Icon.trip size={size} />;
    case "podcast":
      return <Icon.podcast size={size} />;
    case "video_game":
      return <Icon.game size={size} />;
    default:
      return <Icon.spark size={size} />;
  }
}

export function SlotIcon({ slot, size = 16 }: { slot: SlotKind; size?: number }) {
  switch (slot) {
    case "dinner":
      return <Icon.dinner size={size} />;
    case "drinks":
      return <Icon.drinks size={size} />;
    case "movie":
      return <Icon.film size={size} />;
    case "series":
      return <Icon.tv size={size} />;
    case "music":
      return <Icon.music size={size} />;
    case "book":
      return <Icon.book size={size} />;
    case "trip":
      return <Icon.trip size={size} />;
  }
}

export const KIND_LABEL: Record<EntityKind, string> = {
  movie: "Film",
  tv_show: "TV",
  artist: "Music",
  book: "Book",
  place: "Place",
  destination: "Travel",
  podcast: "Podcast",
  video_game: "Game",
  brand: "Brand",
  person: "Person",
};
