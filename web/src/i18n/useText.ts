import { useCallback } from "react";
import { localize, type LocalizedText } from "@car-schematic/shared";
import { useExplorer } from "../state/store";
import { messages, type MessageKey } from "./messages";

export function useText() {
  const language = useExplorer((state) => state.language);
  const t = useCallback((key: MessageKey) => messages[language][key], [language]);
  const local = useCallback((text: LocalizedText) => localize(text, language), [language]);
  return { t, local, language };
}
