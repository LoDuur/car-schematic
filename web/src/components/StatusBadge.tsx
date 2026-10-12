import type { SpecStatus } from "@car-schematic/shared";
import { useText } from "../i18n/useText";

const LABEL_KEYS = { verified: "statusVerified", unverified: "statusUnverified", missing: "statusMissing" } as const;
const HINT_KEYS = { verified: "statusVerifiedHint", unverified: "statusUnverifiedHint", missing: "statusMissingHint" } as const;

export function StatusBadge({ status }: { status: SpecStatus }) {
  const { t } = useText();
  return (
    <span className={`badge badge-${status}`} title={t(HINT_KEYS[status])}>
      {t(LABEL_KEYS[status])}
    </span>
  );
}
