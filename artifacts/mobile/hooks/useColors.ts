import { useTheme } from "@/contexts/ThemeContext";

export function useColors() {
  const { colors } = useTheme();
  return colors;
}
