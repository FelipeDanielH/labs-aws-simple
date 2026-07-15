export const themes = [
  "light-blue",
  "light-purple",
  "light-orange",
  "light-pink",
  "dark-blue",
  "dark-purple",
  "dark-orange",
  "dark-pink",
] as const;

export const locales = ["es", "en"] as const;

export type AppTheme = (typeof themes)[number];
export type AppLocale = (typeof locales)[number];

export const defaultTheme: AppTheme = "light-blue";
export const defaultLocale: AppLocale = "es";
