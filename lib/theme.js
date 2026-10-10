"use client";

import { createContext, useContext, useEffect, useState } from "react";

export const PALETTES = [
  { id: "loom", label: "L.O.O.M.", swatch: ["#0a0b0c", "#d6b25e"] },
  { id: "latte", label: "Cosmic Latte", swatch: ["#f3ece1", "#6d1f35"] },
  { id: "blunt", label: "Blunt", swatch: ["#f7f1e6", "#c2571a"] },
];

const isPalette = (v) => PALETTES.some((p) => p.id === v);

const ThemeContext = createContext({
  theme: "dark",
  palette: "loom",
  toggle: () => {},
  setPalette: () => {},
  mounted: false,
});

export function ThemeProvider({ children, defaultTheme = "dark", defaultPalette = "loom" }) {
  const [theme, setTheme] = useState(defaultTheme);
  const [palette, setPaletteState] = useState(defaultPalette);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const storedTheme = localStorage.getItem("loom-theme");
    const storedPalette = localStorage.getItem("loom-palette");
    // Stored choice always wins ("whatever the user chooses is fixed for
    // them"). First visit falls back to the OS preference, not a hard default.
    if (storedTheme) setTheme(storedTheme);
    else if (window.matchMedia("(prefers-color-scheme: light)").matches) setTheme("light");
    if (isPalette(storedPalette)) setPaletteState(storedPalette);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-palette", palette);
    localStorage.setItem("loom-theme", theme);
    localStorage.setItem("loom-palette", palette);
  }, [theme, palette, mounted]);

  function toggle() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  function setPalette(next) {
    if (isPalette(next)) setPaletteState(next);
  }

  return (
    <ThemeContext.Provider value={{ theme, palette, toggle, setPalette, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}