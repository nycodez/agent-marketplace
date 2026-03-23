"use client";

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

const applyTheme = (theme: ThemeMode) => {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("agent-marketplace-theme", theme);
};

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    const savedTheme = localStorage.getItem("agent-marketplace-theme") as ThemeMode | null;
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      applyTheme(savedTheme);
      return;
    }

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextTheme: ThemeMode = prefersDark ? "dark" : "light";
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  return (
    <button
      type="button"
      className="mono-button mono-button--secondary"
      onClick={() => {
        const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
        setTheme(nextTheme);
        applyTheme(nextTheme);
      }}
    >
      {theme === "dark" ? "Switch to light" : "Switch to dark"}
    </button>
  );
}

