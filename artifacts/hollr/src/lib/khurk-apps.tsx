export interface KhurkApp {
  id: string;
  name: string;
  tagline: string;
  url: string;
  gradient: [string, string];
  Icon: () => JSX.Element;
}

export const KHURK_APPS: KhurkApp[] = [
  {
    id: "ustream",
    name: "uStream",
    tagline: "Movies & TV",
    url: "https://ustream.khurk.com",
    gradient: ["#3d0000", "#a50000"],
    Icon: () => (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <rect x="2" y="5" width="22" height="14" rx="2.5" stroke="white" strokeWidth="1.6" />
        <path d="M10.5 9.5l7 3.5-7 3.5V9.5z" fill="white" />
        <path d="M8 21h10M13 19v2" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "playd",
    name: "Playd",
    tagline: "Local Music Player",
    url: "https://playd.khurk.com",
    gradient: ["#3b0764", "#7e22ce"],
    Icon: () => (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <circle cx="9" cy="19" r="3" stroke="white" strokeWidth="1.6" />
        <circle cx="20" cy="17" r="3" stroke="white" strokeWidth="1.6" />
        <path d="M12 19V9l11-2v8" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "foldr",
    name: "foldr.storage",
    tagline: "Encrypted IPFS Storage",
    url: "https://foldr.storage",
    gradient: ["#042f2e", "#0f766e"],
    Icon: () => (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <path d="M3 8.5C3 7.4 3.9 6.5 5 6.5h5l2 2h9c1.1 0 2 .9 2 2V19c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V8.5z" stroke="white" strokeWidth="1.6" />
        <rect x="10" y="12" width="6" height="5" rx="1" stroke="white" strokeWidth="1.4" />
        <path d="M13 14v1.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M11 12v-1.5a2 2 0 014 0V12" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "instaghost",
    name: "InstaGhost",
    tagline: "Crypto Exchange",
    url: "https://instaghost.khurk.com",
    gradient: ["#431407", "#c2410c"],
    Icon: () => (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <path d="M13 4C9.13 4 6 7.13 6 11v8l2-2 2 2 2-2 2 2 2-2 2 2v-8c0-3.87-3.13-7-7-7z" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="10" cy="11" r="1.2" fill="white" />
        <circle cx="16" cy="11" r="1.2" fill="white" />
      </svg>
    ),
  },
  {
    id: "gasless",
    name: "Gasless",
    tagline: "USDT Web Wallet",
    url: "https://gasless.khurk.com",
    gradient: ["#052e16", "#15803d"],
    Icon: () => (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <rect x="4" y="7" width="18" height="13" rx="2.5" stroke="white" strokeWidth="1.6" />
        <path d="M4 11h18" stroke="white" strokeWidth="1.6" />
        <circle cx="17.5" cy="16" r="2" stroke="white" strokeWidth="1.4" />
        <path d="M13 4v3M9 4l1 3M17 4l-1 3" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "ballpoint",
    name: "Ballpoint.one",
    tagline: "Private Notes",
    url: "https://ballpoint.one",
    gradient: ["#451a03", "#b45309"],
    Icon: () => (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <path d="M17 4l5 5-12 12H5v-5L17 4z" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M14 7l5 5" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M5 21h16" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "onlygames",
    name: "OnlyGames",
    tagline: "Game Search",
    url: "https://onlygames.khurk.com",
    gradient: ["#0c1445", "#1d4ed8"],
    Icon: () => (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <rect x="3" y="8" width="20" height="12" rx="3" stroke="white" strokeWidth="1.6" />
        <path d="M9 14h4M11 12v4" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="17" cy="13" r="1" fill="white" />
        <circle cx="17" cy="16" r="1" fill="white" />
      </svg>
    ),
  },
  {
    id: "onlyxmr",
    name: "OnlyXMR",
    tagline: "Private Creator Platform",
    url: "https://onlyxmr.khurk.com",
    gradient: ["#500724", "#be185d"],
    Icon: () => (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <path d="M13 3L4 7.5v6c0 4 4 7.5 9 9.5 5-2 9-5.5 9-9.5v-6L13 3z" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9 10l4 4 4-4M13 10v7" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];
