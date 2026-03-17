export type ColorScheme = "light" | "dark";

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceBorder: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  border: string;
  success: string;
  successText: string;
  warning: string;
  error: string;
  tabBar: string;
  tabBarBorder: string;
  inputBg: string;
  inputBorder: string;
  hintBg: string;
  disabledOpacity: number;
};

const light: ThemeColors = {
  background: "#f8fafc",
  surface: "#ffffff",
  surfaceBorder: "#e2e8f0",
  text: "#0f172a",
  textSecondary: "#334155",
  textMuted: "#64748b",
  primary: "#2563eb",
  primaryText: "#ffffff",
  border: "#e2e8f0",
  success: "#10b981",
  successText: "#047857",
  warning: "#f59e0b",
  error: "#dc2626",
  tabBar: "#ffffff",
  tabBarBorder: "#e2e8f0",
  inputBg: "#ffffff",
  inputBorder: "#e2e8f0",
  hintBg: "#e0e7ff",
  disabledOpacity: 0.5,
};

const dark: ThemeColors = {
  background: "#0f172a",
  surface: "#1e293b",
  surfaceBorder: "#334155",
  text: "#f1f5f9",
  textSecondary: "#e2e8f0",
  textMuted: "#94a3b8",
  primary: "#3b82f6",
  primaryText: "#ffffff",
  border: "#334155",
  success: "#34d399",
  successText: "#6ee7b7",
  warning: "#fbbf24",
  error: "#f87171",
  tabBar: "#1e293b",
  tabBarBorder: "#334155",
  inputBg: "#1e293b",
  inputBorder: "#475569",
  hintBg: "#312e81",
  disabledOpacity: 0.5,
};

export function getTheme(scheme: ColorScheme | null): ThemeColors {
  return scheme === "dark" ? dark : light;
}

import { useColorScheme } from "react-native";

export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme() as ColorScheme | null;
  return getTheme(scheme);
}
