import type { LocalizedText } from "@car-schematic/shared";
import { useText } from "../i18n/useText";

export function Localized({ text }: { text: LocalizedText }) {
  const { t, local } = useText();
  const value = local(text);
  if (!value.isFallback) return <>{value.text}</>;
  return (
    <>
      <span lang="en">{value.text}</span>
      <span className="fallback-marker" title={t("notTranslated")}>
        <span aria-hidden="true">EN</span>
        <span className="visually-hidden">{t("notTranslated")}</span>
      </span>
    </>
  );
}
