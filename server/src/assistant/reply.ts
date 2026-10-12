import { z } from "zod";

export const ASSISTANT_ACTION_TYPES = ["highlight", "select", "focus", "isolate"] as const;

export const assistantActionSchema = z.object({
  type: z.enum(ASSISTANT_ACTION_TYPES),
  componentIds: z.array(z.string()).default([]),
});
export type AssistantAction = z.infer<typeof assistantActionSchema>;

export const assistantReplySchema = z.object({
  answer: z.string(),
  components: z.array(z.object({ id: z.string(), reason: z.string() })).default([]),
  possibleCauses: z
    .array(
      z.object({
        title: z.string(),
        explanation: z.string(),
        componentIds: z.array(z.string()).default([]),
        checks: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  actions: z.array(assistantActionSchema).default([]),
  dataGaps: z.array(z.string()).default([]),
  safety: z.string().optional(),
});
export type AssistantReply = z.infer<typeof assistantReplySchema>;

export function keepKnownComponents(reply: AssistantReply, allowedIds: Set<string>): AssistantReply {
  const known = (ids: string[]) => [...new Set(ids.filter((id) => allowedIds.has(id)))];
  return {
    ...reply,
    components: reply.components.filter((component) => allowedIds.has(component.id)),
    possibleCauses: reply.possibleCauses.map((cause) => ({ ...cause, componentIds: known(cause.componentIds) })),
    actions: reply.actions.map((action) => ({ ...action, componentIds: known(action.componentIds) })).filter((action) => action.componentIds.length > 0),
  };
}
