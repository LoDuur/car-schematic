import { useEffect, useState } from "react";

export interface ViewerPalette {
  partFill: string;
  ink: string;
  inkMuted: string;
  selectFill: string;
  selectInk: string;
  highlightFill: string;
  highlightInk: string;
}

function readPalette(): ViewerPalette {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string) => styles.getPropertyValue(name).trim();
  return {
    partFill: read("--part-fill"),
    ink: read("--ink"),
    inkMuted: read("--ink-muted"),
    selectFill: read("--viewer-select"),
    selectInk: read("--blue-ink"),
    highlightFill: read("--viewer-highlight"),
    highlightInk: read("--yellow-ink"),
  };
}

export function useViewerPalette(): ViewerPalette {
  const [palette, setPalette] = useState(readPalette);
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setPalette(readPalette());
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return palette;
}

export function usePrefersReducedMotion(): boolean {
  const [isReduced, setIsReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setIsReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isReduced;
}
