// src/content/characters.ts
import type { SpriteRef } from "../game/battle";
import { characterImg } from "./assetUrls";

export type CharacterPreset = {
  id: string;
  name: string;
  emoji: string;     // fallback/mini display
  tagline: string;
  sprite: SpriteRef; // main sprite for battle + setup
};

export const CHARACTERS_3: CharacterPreset[] = [
  {
    id: "char_astronaut",
    name: "Astro",
    emoji: "🧑‍🚀",
    tagline: "Curious. Bold. Loves challenges.",
    sprite: { kind: "image", src: characterImg("Astro.webp"), alt: "Astro" },
  },
  {
    id: "char_knight",
    name: "Knight",
    emoji: "🛡️",
    tagline: "Steady. Calm. Blocks like a pro.",
    sprite: { kind: "image", src: characterImg("Knight.webp"), alt: "Knight" },
  },
  {
    id: "char_wizard",
    name: "Wizard",
    emoji: "🧙‍♂️",
    tagline: "Smart. Sneaky. Finds patterns fast.",
    sprite: { kind: "image", src: characterImg("Wizard.webp"), alt: "Wizard" },
  },
];
