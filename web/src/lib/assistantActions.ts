import type { AssistantAction, AssistantReply } from "./api";
import { useExplorer } from "../state/store";

const ACTION_ORDER: AssistantAction["type"][] = ["highlight", "isolate", "select", "focus"];

export function actionsForReply(reply: AssistantReply): AssistantAction[] {
  if (reply.actions.length > 0) return reply.actions;
  const ids = [...new Set([...reply.components.map((component) => component.id), ...reply.possibleCauses.flatMap((cause) => cause.componentIds)])];
  return ids.length > 0 ? [{ type: "highlight", componentIds: ids }, { type: "focus", componentIds: ids }] : [];
}

export function applyAssistantActions(actions: AssistantAction[]): void {
  const store = useExplorer.getState();
  const ordered = [...actions].sort((left, right) => ACTION_ORDER.indexOf(left.type) - ACTION_ORDER.indexOf(right.type));
  for (const action of ordered) {
    const [first] = action.componentIds;
    if (!first) continue;
    if (action.type === "highlight") store.highlight(action.componentIds, "assistant");
    if (action.type === "isolate") store.isolate(action.componentIds, { focus: true });
    if (action.type === "select") store.select(first, { focus: !ordered.some((candidate) => candidate.type === "focus") });
    if (action.type === "focus") store.focusOn(action.componentIds);
  }
}
