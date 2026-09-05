// Badges: what each is for, how each is earned, and what each looks like. Pure - no database -
// so the rules can be tested and the art can be drawn on the client.
//
// RULES ARE DERIVED, NEVER SET. `deriveBadgeSet` is a function of what the hub already knows about
// a person, so it can be re-run any time and always agrees with itself; a badge is lost when the
// thing that earned it goes away (a map unpublished or taken down). The server side that gathers
// the facts and stores the result is src/lib/server/integrations/badges.ts.
//
// THE ART is twelve-by-twelve pixel sprites, because this is a web site and we can have a bit of
// fun (owner, 2026-09-05), and because the cover cards already set their titles in a bitmap font -
// the badges belong to the same family. Characters: `#` ink, `+` light, `-` dark, `o` the accent,
// `.` nothing. Drawn by src/lib/components/Badge.svelte.
//
// THE VOICE of the "how" lines is the terms' voice: plain, short, a little dry.

export type Badge =
  | 'cartographer' | 'constellation' | 'prolific' | 'featured' | 'popular' | 'legend'
  | 'wellspring' | 'crew' | 'artist' | 'modeller' | 'worldbuilder' | 'voice' | 'pioneer';

export interface BadgeFacts {
  /** The explorer's PUBLIC maps. Nothing hidden, draft or taken down counts. */
  maps: Array<{
    kind: string; stars: number; downloads: number;
    images: number; models: number; objects: number; credits: number;
  }>;
  /** Public maps by OTHER people that credit this explorer's work. */
  usedIn: number;
  /** Live comments this explorer has written. */
  comments: number;
  /** Where this explorer came in the sign-up order, from 1. Null when unknown. */
  joinedRank: number | null;
}

export const THRESHOLDS = {
  prolific: 5, featured: 25, popular: 100, legend: 1000, worldbuilder: 100, voice: 10, pioneer: 100
} as const;

export interface BadgeSpec {
  name: string;
  how: string;
  /** Twelve rows of twelve. */
  art: readonly string[];
  ink: string; light: string; dark: string; alt: string;
  earned: (f: BadgeFacts) => boolean;
}

const gold = { ink: '#d9a441', light: '#f3d27a', dark: '#8a6420' };
const blue = { ink: '#6fb3ff', light: '#cfe6ff', dark: '#2b5a99' };
const green = { ink: '#7fd1a8', light: '#c9f2dc', dark: '#2f7a55' };
const teal = { ink: '#5ad1d1', light: '#bff2f2', dark: '#1f7a7a' };
const red = { ink: '#ff8080', light: '#ffc2c2', dark: '#a83a3a' };

export const CATALOGUE: Record<Badge, BadgeSpec> = {
  cartographer: {
    name: 'Cartographer',
    how: 'Charted something and shared it.',
    ...gold, alt: '#7fd1a8',
    art: [
      '............',
      '.##########.',
      '.#++++++++#.',
      '.#+o++++++#.',
      '.#++o+++++#.',
      '.#+++oo+++#.',
      '.#+++++o++#.',
      '.#++++++o+#.',
      '.#++++++++#.',
      '.##########.',
      '..-......-..',
      '............'
    ],
    earned: (f) => f.maps.length >= 1
  },
  constellation: {
    name: 'Constellation',
    how: 'Shared a whole starmap, not just one system.',
    ...blue, alt: '#ffffff',
    art: [
      '..+.........',
      '.+#+.....+..',
      '..+-....+#+.',
      '....-....+..',
      '.....-..-...',
      '......-.....',
      '......+.....',
      '.....+#+....',
      '......+.....',
      '.......-....',
      '........-...',
      '.........+#+'
    ],
    earned: (f) => f.maps.some((m) => m.kind === 'starmap')
  },
  prolific: {
    name: 'Prolific',
    how: 'Five maps public at once.',
    ...green, alt: '#ffffff',
    art: [
      '............',
      '.....######.',
      '.....#++++#.',
      '...###+++##.',
      '...#+++###..',
      '.###+++#....',
      '.#+++###....',
      '.#+++#......',
      '.#+++#......',
      '.#####......',
      '............',
      '............'
    ],
    earned: (f) => f.maps.length >= THRESHOLDS.prolific
  },
  featured: {
    name: 'Featured',
    how: 'One map with twenty-five stars.',
    ink: '#ffd166', light: '#fff1bf', dark: '#b3872a', alt: '#ffffff',
    art: [
      '.....#......',
      '.....#......',
      '....#+#.....',
      '....#+#.....',
      '#####+#####.',
      '.####+####..',
      '..###+###...',
      '..##...##...',
      '.##.....##..',
      '.#.......#..',
      '............',
      '............'
    ],
    earned: (f) => f.maps.some((m) => m.stars >= THRESHOLDS.featured)
  },
  popular: {
    name: 'Popular',
    how: 'One map downloaded a hundred times.',
    ...teal, alt: '#ffffff',
    art: [
      '.....##.....',
      '.....##.....',
      '.....##.....',
      '..#..##..#..',
      '..##.##.##..',
      '...######...',
      '....####....',
      '.....##.....',
      '............',
      '.##########.',
      '.#++++++++#.',
      '.##########.'
    ],
    earned: (f) => f.maps.some((m) => m.downloads >= THRESHOLDS.popular)
  },
  legend: {
    name: 'Legend',
    how: 'One map downloaded a thousand times. People are playing in it.',
    ink: '#ffd166', light: '#fff1bf', dark: '#b3872a', alt: '#ff8080',
    art: [
      '............',
      '.#....#....#',
      '.##..###..##',
      '.###.###.###',
      '.##########.',
      '.#o##o##o##.',
      '.##########.',
      '.#++++++++#.',
      '.##########.',
      '............',
      '............',
      '............'
    ],
    earned: (f) => f.maps.some((m) => m.downloads >= THRESHOLDS.legend)
  },
  wellspring: {
    name: 'Wellspring',
    how: 'Your work turned up inside someone else’s map, with your name on it.',
    ink: '#7fd1c9', light: '#c9f2ee', dark: '#2f7a72', alt: '#ffffff',
    art: [
      '.....##.....',
      '....#++#....',
      '.....##.....',
      '....-..-....',
      '...-....-...',
      '..-......-..',
      '.##......##.',
      '#++#....#++#',
      '.##......##.',
      '............',
      '............',
      '............'
    ],
    earned: (f) => f.usedIn >= 1
  },
  crew: {
    name: 'Crew',
    how: 'Built a map on other explorers’ work, and said so.',
    ink: '#ff9f5a', light: '#ffd3b3', dark: '#a8562a', alt: '#ffffff',
    art: [
      '............',
      '..##....##..',
      '.#++#..#++#.',
      '..##....##..',
      '.####..####.',
      '#++++##++++#',
      '#++++##++++#',
      '#++++++++++#',
      '#++++++++++#',
      '.##########.',
      '............',
      '............'
    ],
    earned: (f) => f.maps.some((m) => m.credits >= 1)
  },
  artist: {
    name: 'Artist',
    how: 'Shared a map with pictures in it, looked at and approved.',
    ink: '#c58bff', light: '#e9d3ff', dark: '#6e3fa8', alt: '#ff6fae',
    art: [
      '.........##.',
      '........#++#',
      '.......#++#.',
      '......#++#..',
      '.....#++#...',
      '....####....',
      '...####.....',
      '..#oo#......',
      '.#ooo#......',
      '.#oo#.......',
      '..##........',
      '............'
    ],
    earned: (f) => f.maps.some((m) => m.images >= 1)
  },
  modeller: {
    name: 'Modeller',
    how: 'Shared a map with 3D models in it.',
    ink: '#9aa6bf', light: '#dfe5f2', dark: '#4a5670', alt: '#6fb3ff',
    art: [
      '............',
      '.....##.....',
      '...##++##...',
      '.##++++++##.',
      '#++++++++++#',
      '#--##++##--#',
      '#----##----#',
      '#----##----#',
      '#----##----#',
      '.#---##---#.',
      '...##..##...',
      '............'
    ],
    earned: (f) => f.maps.some((m) => m.models >= 1)
  },
  worldbuilder: {
    name: 'Worldbuilder',
    how: 'A single map with a hundred objects in it.',
    ...green, alt: '#6fb3ff',
    art: [
      '............',
      '....####....',
      '...#+#####..',
      '..#+######..',
      '..########..',
      'o-########-o',
      '.oo######oo.',
      '...oo##oo...',
      '...--##--...',
      '....####....',
      '............',
      '............'
    ],
    earned: (f) => f.maps.some((m) => m.objects >= THRESHOLDS.worldbuilder)
  },
  voice: {
    name: 'Voice',
    how: 'Ten comments. Decent ones, we assume.',
    ...blue, alt: '#ffffff',
    art: [
      '............',
      '.##########.',
      '#++++++++++#',
      '#++#++#++#+#',
      '#++++++++++#',
      '#++++++++++#',
      '.##########.',
      '..##........',
      '..#.........',
      '............',
      '............',
      '............'
    ],
    earned: (f) => f.comments >= THRESHOLDS.voice
  },
  pioneer: {
    name: 'Pioneer',
    how: 'One of the first hundred explorers here.',
    ...red, alt: '#ffd166',
    art: [
      '.....##.....',
      '....#++#....',
      '....#++#....',
      '....#oo#....',
      '....#++#....',
      '...##++##...',
      '..#+#++#+#..',
      '.##+#++#+##.',
      '.#..####..#.',
      '.....oo.....',
      '....o..o....',
      '...o....o...'
    ],
    earned: (f) => f.joinedRank != null && f.joinedRank <= THRESHOLDS.pioneer
  }
};

/** Every badge, in the order they are shown. */
export const BADGE_IDS = Object.keys(CATALOGUE) as Badge[];

export const isBadge = (s: string): s is Badge => s in CATALOGUE;

/** The badges these facts earn, in catalogue order. */
export function deriveBadgeSet(f: BadgeFacts): Badge[] {
  return BADGE_IDS.filter((id) => CATALOGUE[id].earned(f));
}
