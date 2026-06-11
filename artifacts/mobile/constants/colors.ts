const colors = {
  light: {
    text: "#1A1B2E",
    tint: "#7C5CFF",

    background: "#F5F4FB",
    foreground: "#1A1B2E",

    card: "#FFFFFF",
    cardForeground: "#1A1B2E",

    primary: "#7C5CFF",
    primaryForeground: "#FFFFFF",
    primarySoft: "#EFE9FF",

    secondary: "#F0F0F5",
    secondaryForeground: "#1A1B2E",

    muted: "#F0F0F5",
    mutedForeground: "#7A7B8E",

    accent: "#7C5CFF",
    accentForeground: "#FFFFFF",

    destructive: "#EF4444",
    destructiveForeground: "#FFFFFF",

    border: "#E6E5EE",
    input: "#E6E5EE",

    scanOverlay: "rgba(124, 92, 255, 0.10)",
    scanBorder: "#7C5CFF",
    userBubble: "#F0F0F5",
    userBubbleText: "#1A1B2E",
    aiBubble: "#EFE9FF",
    aiBubbleText: "#1A1B2E",
  },

  radius: 18,
};

// Per-module accent colors that match each learning module's Home card, so a
// module's screen feels like an extension of the card you tapped. `color` is the
// solid accent (fills / primary), `soft` the tinted background, `on` the text/
// icon color that sits ON the solid accent, and `ink` the accent used as a text/
// icon color on light surfaces. For dark accents (blue/green) `on` is white and
// `ink` equals `color`; for the bright yellow alphabet accent both `on` and
// `ink` are a dark brown so text stays legible.
export const MODULE_ACCENTS = {
  chat: { color: "#EA580C", soft: "rgba(234,88,12,0.12)", on: "#FFFFFF", ink: "#EA580C" },
  sentences: { color: "#2563EB", soft: "rgba(37,99,235,0.12)", on: "#FFFFFF", ink: "#2563EB" },
  vocab: { color: "#047857", soft: "rgba(4,120,87,0.12)", on: "#FFFFFF", ink: "#047857" },
  alphabet: { color: "#FBBF24", soft: "rgba(251,191,36,0.22)", on: "#422006", ink: "#422006" },
} as const;

export default colors;
