import type { EntityKind, SlotKind } from "../shared/types";

export interface SampleGroup {
  id: string;
  title: string;
  blurb: string;
  slots: SlotKind[];
  location?: string;
  notes?: string;
  people: Array<{ name: string; likes: Array<[string, EntityKind]> }>;
}

// Names are resolved through Qloo search when a sample is loaded.
export const SAMPLES: SampleGroup[] = [
  {
    id: "roommates",
    title: "Roommates, Friday night",
    blurb: "Horror and metal, cosy rom-coms, sad indie. Dinner in Brooklyn and a movie after.",
    slots: ["dinner", "movie"],
    location: "Brooklyn",
    notes: "Jun is vegetarian. Nothing too pricey.",
    people: [
      { name: "Priya", likes: [["Fleabag", "tv_show"], ["Phoebe Bridgers", "artist"], ["Lady Bird", "movie"], ["The Secret History", "book"]] },
      { name: "Marco", likes: [["Hereditary", "movie"], ["Metallica", "artist"], ["Breaking Bad", "tv_show"], ["Elden Ring", "video_game"]] },
      { name: "Jun", likes: [["Taylor Swift", "artist"], ["Notting Hill", "movie"], ["Bridgerton", "tv_show"], ["Beach Read", "book"]] },
    ],
  },
  {
    id: "parents",
    title: "Parents in town",
    blurb: "Mum loves Bake Off, Dad loves Springsteen, you love A24. Dinner in Manhattan and a show to watch together.",
    slots: ["dinner", "series"],
    location: "Manhattan",
    notes: "Somewhere we can actually talk.",
    people: [
      { name: "Mum", likes: [["The Great British Bake Off", "tv_show"], ["Fleetwood Mac", "artist"], ["Pride & Prejudice", "movie"]] },
      { name: "Dad", likes: [["Top Gun: Maverick", "movie"], ["Bruce Springsteen", "artist"], ["Shōgun", "tv_show"]] },
      { name: "Rohan", likes: [["Everything Everywhere All at Once", "movie"], ["Frank Ocean", "artist"], ["The Bear", "tv_show"]] },
    ],
  },
  {
    id: "first-date",
    title: "A second date",
    blurb: "Two people, two very different playlists. Drinks in the West Village and a soundtrack for the walk home.",
    slots: ["drinks", "music"],
    location: "West Village",
    people: [
      { name: "Alex", likes: [["Past Lives", "movie"], ["Mitski", "artist"], ["Normal People", "tv_show"]] },
      { name: "Sam", likes: [["The Grand Budapest Hotel", "movie"], ["Khruangbin", "artist"], ["Chef's Table", "tv_show"]] },
    ],
  },
  {
    id: "team",
    title: "Team dinner, five people",
    blurb: "Five coworkers from four countries. One dinner that nobody secretly hates.",
    slots: ["dinner"],
    location: "Manhattan",
    notes: "Big group, mid-priced.",
    people: [
      { name: "Dana", likes: [["The Office", "tv_show"], ["Beyoncé", "artist"], ["Barbie", "movie"]] },
      { name: "Leo", likes: [["Dune", "movie"], ["Daft Punk", "artist"], ["Severance", "tv_show"]] },
      { name: "Aisha", likes: [["Bad Bunny", "artist"], ["Squid Game", "tv_show"], ["Mexico City", "destination"]] },
      { name: "Tom", likes: [["Ted Lasso", "tv_show"], ["The Beatles", "artist"], ["Paddington 2", "movie"]] },
      { name: "Mei", likes: [["Spirited Away", "movie"], ["BTS", "artist"], ["Arcane", "tv_show"]] },
    ],
  },
];
