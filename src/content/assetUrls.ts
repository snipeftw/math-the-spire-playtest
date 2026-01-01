// src/content/assetUrls.ts
//
// Vite only includes images in production builds when it can statically detect them.
// Referencing sprites as runtime strings like "/src/assets/..." works in dev,
// but breaks when you run the built app (the /src folder isn't served).
//
// Using import.meta.glob with eager + as:'url' makes Vite bundle the images and
// gives us stable URLs we can safely store on our SpriteRef objects.

type UrlMap = Record<string, string>;

const characterUrls = import.meta.glob("../assets/characters/*", {
  eager: true,
  as: "url",
}) as UrlMap;

const enemyUrls = import.meta.glob("../assets/enemies/*", {
  eager: true,
  as: "url",
}) as UrlMap;

const eventUrls = import.meta.glob("../assets/events/*", {
  eager: true,
  as: "url",
}) as UrlMap;

function pick(map: UrlMap, relPathFromHere: string): string {
  // Keys in the glob map are relative to THIS file's location.
  // Example key: "../assets/enemies/possessednotelet.webp"
  if (map[relPathFromHere]) return map[relPathFromHere];

  // Some older code used URL-encoded spaces ("Mecha%20Pencil.webp").
  // The glob keys are NOT encoded, so try a decoded variant.
  try {
    const decoded = decodeURIComponent(relPathFromHere);
    if (map[decoded]) return map[decoded];
  } catch {
    // ignore
  }

  return "";
}

export function characterImg(fileName: string): string {
  return pick(characterUrls, `../assets/characters/${fileName}`);
}

export function enemyImg(fileName: string): string {
  return pick(enemyUrls, `../assets/enemies/${fileName}`);
}

export function eventImg(fileName: string): string {
  return pick(eventUrls, `../assets/events/${fileName}`);
}
