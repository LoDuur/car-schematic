import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ChatCircleText, PaperPlaneTilt, Warning, X } from "@phosphor-icons/react";
import { ApiError, askAssistant, fetchAssistantStatus, type AssistantReply } from "../lib/api";
import { actionsForReply, applyAssistantActions } from "../lib/assistantActions";
import { useText } from "../i18n/useText";
import type { MessageKey } from "../i18n/messages";
import { useExplorer } from "../state/store";
import { useVehicleData } from "../state/vehicleData";

const MAX_HISTORY_TURNS = 10;
const MAX_MESSAGE_LENGTH = 4000;

type ChatEntry = { role: "user"; text: string } | { role: "model"; reply: AssistantReply };

function errorKey(error: unknown): MessageKey {
  if (error instanceof ApiError && error.code === "assistant_not_configured") return "assistantNotConfigured";
  if (error instanceof ApiError && error.code === "rate_limited") return "assistantRateLimited";
  return "assistantFailed";
}

function PartChip({ componentId, reason }: { componentId: string; reason?: string }) {
  const { local } = useText();
  const { componentsById } = useVehicleData();
  const select = useExplorer((state) => state.select);
  const component = componentsById.get(componentId);
  if (!component) return null;
  return (
    <button type="button" className="chip chip-highlight" title={reason} onClick={() => select(componentId, { focus: true })}>
      {local(component.name).text}
    </button>
  );
}

function ReplyView({ reply }: { reply: AssistantReply }) {
  const { t } = useText();
  const actions = actionsForReply(reply);
  return (
    <div className="reply">
      {actions.length > 0 && (
        <button type="button" className="text-button reply-reapply" onClick={() => applyAssistantActions(actions)}>
          {t("assistantShowAgain")}
        </button>
      )}
      <p className="reply-answer">{reply.answer}</p>
      {reply.safety && (
        <p className="reply-safety">
          <Warning weight="bold" aria-hidden="true" />
          <span>
            <strong>{t("assistantSafety")}.</strong> {reply.safety}
          </span>
        </p>
      )}
      {reply.possibleCauses.length > 0 && (
        <section className="reply-section">
          <h4>{t("assistantPossibleCauses")}</h4>
          <ol className="cause-list">
            {reply.possibleCauses.map((cause, index) => (
              <li key={index} className="cause">
                <div className="cause-title">
                  <span>{cause.title}</span>
                  <span className="badge badge-unverified">{t("assistantNotConfirmed")}</span>
                </div>
                <p>{cause.explanation}</p>
                {cause.checks.length > 0 && (
                  <>
                    <p className="cause-checks-label">{t("assistantChecks")}</p>
                    <ul className="cause-checks">
                      {cause.checks.map((check, checkIndex) => (
                        <li key={checkIndex}>{check}</li>
                      ))}
                    </ul>
                  </>
                )}
                {cause.componentIds.length > 0 && (
                  <div className="chip-row">
                    {cause.componentIds.map((id) => (
                      <PartChip key={id} componentId={id} />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      {reply.components.length > 0 && (
        <section className="reply-section">
          <h4>{t("assistantParts")}</h4>
          <div className="chip-row">
            {reply.components.map((component) => (
              <PartChip key={component.id} componentId={component.id} reason={component.reason} />
            ))}
          </div>
        </section>
      )}
      {reply.dataGaps.length > 0 && (
        <section className="reply-section">
          <h4>{t("assistantDataGaps")}</h4>
          <ul className="gap-list">
            {reply.dataGaps.map((gap, index) => (
              <li key={index}>{gap}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function AssistantPanel() {
  const { t, local, language } = useText();
  const { config, componentsById } = useVehicleData();
  const vehicleId = useExplorer((state) => state.vehicleId);
  const selectedId = useExplorer((state) => state.selectedId);
  const assistantRequest = useExplorer((state) => state.assistantRequest);
  const [isOpen, setIsOpen] = useState(false);
  const [isAboutSelected, setIsAboutSelected] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedComponent = selectedId ? componentsById.get(selectedId) : undefined;
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<MessageKey | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  useEffect(() => {
    if (!isOpen || isConfigured !== null) return;
    let isCurrent = true;
    fetchAssistantStatus()
      .then((status) => isCurrent && setIsConfigured(status.configured))
      .catch(() => isCurrent && setIsConfigured(false));
    return () => {
      isCurrent = false;
    };
  }, [isOpen, isConfigured]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!assistantRequest) return;
    setIsOpen(true);
    setDraft(assistantRequest.value);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [assistantRequest?.nonce]);

  useEffect(() => setIsAboutSelected(true), [selectedId]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [entries, isSending]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isSending || !vehicleId) return;

    const history = entries.slice(-MAX_HISTORY_TURNS).map((entry) => {
      if (entry.role === "user") return { role: "user" as const, text: entry.text };
      const discussed = actionsForReply(entry.reply).flatMap((action) => action.componentIds);
      const suffix = discussed.length > 0 ? `\n[Parts shown in the model: ${[...new Set(discussed)].join(", ")}]` : "";
      return { role: "model" as const, text: `${entry.reply.answer}${suffix}`.slice(0, MAX_MESSAGE_LENGTH) };
    });
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setEntries((current) => [...current, { role: "user", text: message }]);
    setDraft("");
    setErrorMessage(null);
    setIsSending(true);
    try {
      const reply = await askAssistant(
        { vehicleId, config, language, message, history, selectedId: isAboutSelected && selectedId ? selectedId : undefined },
        controller.signal,
      );
      setEntries((current) => [...current, { role: "model", reply }]);
      applyAssistantActions(actionsForReply(reply));
    } catch (error) {
      if (controller.signal.aborted) return;
      setErrorMessage(errorKey(error));
      if (error instanceof ApiError && error.code === "assistant_not_configured") setIsConfigured(false);
    } finally {
      if (abortRef.current === controller) setIsSending(false);
    }
  };

  if (!isOpen) {
    return (
      <button type="button" className="assistant-launcher button button-primary" onClick={() => setIsOpen(true)}>
        <ChatCircleText weight="bold" aria-hidden="true" />
        {t("assistantOpen")}
      </button>
    );
  }

  return (
    <section className="assistant" aria-labelledby="assistant-title">
      <header className="assistant-header">
        <h2 id="assistant-title">{t("assistant")}</h2>
        <button type="button" className="icon-button" onClick={() => setIsOpen(false)} aria-label={t("assistantClose")}>
          <X weight="bold" aria-hidden="true" />
        </button>
      </header>
      <div className="assistant-log" ref={logRef} aria-live="polite">
        {entries.length === 0 && <p className="section-hint">{t("assistantIntro")}</p>}
        {isConfigured === false && <p className="notice notice-warning">{t("assistantNotConfigured")}</p>}
        {entries.map((entry, index) =>
          entry.role === "user" ? (
            <div key={index} className="message message-user">
              <span className="visually-hidden">{t("you")}: </span>
              {entry.text}
            </div>
          ) : (
            <ReplyView key={index} reply={entry.reply} />
          ),
        )}
        {isSending && <p className="section-hint">{t("assistantSending")}…</p>}
        {errorMessage && errorMessage !== "assistantNotConfigured" && <p className="notice notice-error">{t(errorMessage)}</p>}
      </div>
      {selectedComponent && (
        <div className="assistant-context">
          <label>
            <input type="checkbox" checked={isAboutSelected} onChange={(event) => setIsAboutSelected(event.target.checked)} />
            {t("assistantAboutPart")} <strong>{local(selectedComponent.name).text}</strong>
          </label>
        </div>
      )}
      <form className="assistant-form" onSubmit={send}>
        <label htmlFor={inputId} className="visually-hidden">
          {t("assistantPlaceholder")}
        </label>
        <textarea
          ref={textareaRef}
          id={inputId}
          name="question"
          autoComplete="off"
          rows={2}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={t("assistantPlaceholder")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button type="submit" className="button button-primary" disabled={isSending || !draft.trim() || isConfigured === false}>
          <PaperPlaneTilt weight="bold" aria-hidden="true" />
          {isSending ? t("assistantSending") : t("assistantSend")}
        </button>
      </form>
      <p className="assistant-disclaimer">{t("assistantDisclaimer")}</p>
    </section>
  );
}
