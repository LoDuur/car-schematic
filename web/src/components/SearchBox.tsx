import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Fuse from "fuse.js";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { allTranslations, localize } from "@car-schematic/shared";
import { useText } from "../i18n/useText";
import { useExplorer } from "../state/store";
import { useVehicleData } from "../state/vehicleData";

const MAX_COMPONENT_RESULTS = 7;
const MAX_SYMPTOM_RESULTS = 3;
const MIN_TOKEN_LENGTH = 2;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

function containsAllTokens(haystack: string, tokens: string[]): boolean {
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
}

interface ComponentEntry {
  id: string;
  name: string;
  otherNames: string[];
  aliases: string[];
  partNumbers: string[];
  category: string;
  categoryNames: string[];
  technicalText: string;
}

interface SymptomEntry {
  id: string;
  name: string;
  names: string[];
  aliases: string[];
  searchText: string;
  componentIds: string[];
}

type ResultItem = { kind: "component"; entry: ComponentEntry } | { kind: "symptom"; entry: SymptomEntry };

export function SearchBox() {
  const { t, language } = useText();
  const { components, systemsById, assembliesById, vehiclePackage } = useVehicleData();
  const select = useExplorer((state) => state.select);
  const highlight = useExplorer((state) => state.highlight);
  const focusOn = useExplorer((state) => state.focusOn);
  const askAssistant = useExplorer((state) => state.askAssistant);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const componentSearch = useMemo(() => {
    const entries: ComponentEntry[] = components.map((component) => {
      const system = systemsById.get(component.systemId);
      const assembly = component.assemblyId ? assembliesById.get(component.assemblyId) : undefined;
      const systemName = system ? localize(system.name, language).text : "";
      const assemblyName = assembly ? localize(assembly.name, language).text : "";
      return {
        id: component.id,
        name: localize(component.name, language).text,
        otherNames: allTranslations(component.name),
        aliases: component.aliases,
        partNumbers: component.partNumbers.map((partNumber) => partNumber.value),
        category: assemblyName ? `${systemName} › ${assemblyName}` : systemName,
        categoryNames: [...(system ? allTranslations(system.name) : []), ...(assembly ? allTranslations(assembly.name) : [])],
        technicalText: [
          ...allTranslations(component.function),
          ...component.specs.flatMap((spec) => [...allTranslations(spec.label), spec.value ?? ""]),
        ]
          .join(" ")
          .toLowerCase(),
      };
    });
    const fuseOptions = {
      keys: [
        { name: "name", weight: 4 },
        { name: "otherNames", weight: 3 },
        { name: "aliases", weight: 3 },
        { name: "partNumbers", weight: 3 },
        { name: "categoryNames", weight: 1.5 },
      ],
      threshold: 0.3,
      ignoreLocation: true,
      minMatchCharLength: 2,
    };
    return { fuse: new Fuse(entries, fuseOptions), entries };
  }, [components, systemsById, assembliesById, language]);

  const symptomEntries = useMemo(() => {
    const fittedIds = new Set(components.map((component) => component.id));
    const entries: SymptomEntry[] = vehiclePackage.symptoms
      .map((symptom) => ({
        id: symptom.id,
        name: localize(symptom.name, language).text,
        names: allTranslations(symptom.name),
        aliases: symptom.aliases,
        searchText: [...allTranslations(symptom.name), ...symptom.aliases].join(" ").toLowerCase(),
        componentIds: components.filter((component) => component.symptomIds.includes(symptom.id) && fittedIds.has(component.id)).map((component) => component.id),
      }))
      .filter((entry) => entry.componentIds.length > 0);
    return entries;
  }, [vehiclePackage.symptoms, components, language]);

  const results = useMemo<ResultItem[]>(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const tokens = tokenize(trimmed);
    const nameMatches = componentSearch.fuse.search(trimmed, { limit: MAX_COMPONENT_RESULTS }).map((result) => result.item);
    const termMatches = componentSearch.entries.filter((entry) => containsAllTokens(entry.technicalText, tokens));
    const componentResults = [...new Map([...nameMatches, ...termMatches].map((entry) => [entry.id, entry])).values()]
      .slice(0, MAX_COMPONENT_RESULTS)
      .map((entry) => ({ kind: "component" as const, entry }));
    const symptomResults = symptomEntries
      .filter((entry) => containsAllTokens(entry.searchText, tokens))
      .slice(0, MAX_SYMPTOM_RESULTS)
      .map((entry) => ({ kind: "symptom" as const, entry }));
    return [...componentResults, ...symptomResults];
  }, [componentSearch, symptomEntries, query]);

  useEffect(() => {
    const focusOnSlash = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.closest("input, textarea, select, [contenteditable='true']");
      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusOnSlash);
    return () => window.removeEventListener("keydown", focusOnSlash);
  }, []);

  const close = () => {
    setQuery("");
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const choose = (item: ResultItem) => {
    if (item.kind === "component") {
      select(item.entry.id, { focus: true });
      highlight([item.entry.id], "search");
    } else {
      select(null);
      highlight(item.entry.componentIds, "search");
      focusOn(item.entry.componentIds);
    }
    close();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      const chosen = results[activeIndex];
      if (chosen) {
        event.preventDefault();
        choose(chosen);
      }
    } else if (event.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const isListVisible = isOpen && query.trim().length > 0;
  const firstSymptomIndex = results.findIndex((item) => item.kind === "symptom");

  return (
    <div className="search">
      <MagnifyingGlass className="search-icon" weight="bold" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        className="search-input"
        name="part-search"
        autoComplete="off"
        spellCheck={false}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchLabel")}
        role="combobox"
        aria-expanded={isListVisible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={isListVisible && results[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onKeyDown={handleKeyDown}
      />
      <kbd className="search-shortcut" aria-hidden="true">
        /
      </kbd>
      {isListVisible && (
        <ul className="search-results" id={listId} role="listbox" aria-label={t("searchLabel")}>
          {results.length === 0 && (
            <li className="search-empty" role="presentation">
              {t("searchEmpty")}
            </li>
          )}
          {results.map((item, index) => (
            <li
              key={`${item.kind}-${item.entry.id}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`search-result${item.kind === "symptom" ? " search-result-symptom" : ""}${index === firstSymptomIndex ? " starts-group" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              {item.kind === "component" ? (
                <>
                  <span>{item.entry.name}</span>
                  <span className="search-result-system">{item.entry.category}</span>
                </>
              ) : (
                <>
                  <span>
                    {item.entry.name}
                    <span className="search-result-system">
                      {t("symptomMayInvolve")} {item.entry.componentIds.length} {t("partsWord")}
                    </span>
                  </span>
                  <span className="badge badge-unverified">{t("possibleLink")}</span>
                </>
              )}
            </li>
          ))}
          {firstSymptomIndex >= 0 && (
            <li className="search-footer" role="presentation">
              <span>{t("symptomSearchHint")}</span>
              <button
                type="button"
                className="text-button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  askAssistant(query.trim());
                  close();
                }}
              >
                {t("askAssistant")}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
