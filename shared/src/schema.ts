import { z } from "zod";

export const LANGUAGES = ["en", "lv", "ru"] as const;
export const languageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof languageSchema>;

const idSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "ids use lowercase letters, digits and dashes");

export const localizedTextSchema = z.union([
  z.string().min(1),
  z.object({
    en: z.string().min(1),
    lv: z.string().min(1).optional(),
    ru: z.string().min(1).optional(),
  }),
]);
export type LocalizedText = z.infer<typeof localizedTextSchema>;

export type Predicate =
  | { axis: string; in: string[] }
  | { all: Predicate[] }
  | { any: Predicate[] }
  | { not: Predicate };

export const predicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    z.object({ axis: z.string().min(1), in: z.array(z.string().min(1)).min(1) }).strict(),
    z.object({ all: z.array(predicateSchema).min(1) }).strict(),
    z.object({ any: z.array(predicateSchema).min(1) }).strict(),
    z.object({ not: predicateSchema }).strict(),
  ]),
);

export const configOptionSchema = z.object({
  id: z.string().min(1),
  label: localizedTextSchema,
  note: localizedTextSchema.optional(),
});

export const configAxisSchema = z.object({
  id: z.string().min(1),
  label: localizedTextSchema,
  options: z.array(configOptionSchema).min(1),
});
export type ConfigAxis = z.infer<typeof configAxisSchema>;

export const compatibilityRuleSchema = z.object({
  id: idSchema,
  when: predicateSchema.optional(),
  require: predicateSchema,
  reason: localizedTextSchema,
});
export type CompatibilityRule = z.infer<typeof compatibilityRuleSchema>;

export const vehicleConfigSchema = z.record(z.string(), z.string());
export type VehicleConfig = z.infer<typeof vehicleConfigSchema>;

export const factSchema = z.object({
  label: localizedTextSchema,
  value: z.string().min(1).optional(),
  unit: z.string().optional(),
  status: z.enum(["verified", "unverified", "missing"]),
  sourceId: z.string().optional(),
});

export const vehicleSchema = z.object({
  id: idSchema,
  make: z.string().min(1),
  model: z.string().min(1),
  generation: z.string().min(1),
  name: localizedTextSchema,
  summary: localizedTextSchema,
  axes: z.array(configAxisSchema).min(1),
  rules: z.array(compatibilityRuleSchema),
  defaultConfig: vehicleConfigSchema,
  summaryAxes: z.array(z.string().min(1)).default([]),
  facts: z.array(factSchema).default([]),
});
export type Vehicle = z.infer<typeof vehicleSchema>;

export const systemSchema = z.object({
  id: idSchema,
  name: localizedTextSchema,
  description: localizedTextSchema.optional(),
});
export type VehicleSystem = z.infer<typeof systemSchema>;

export const assemblySchema = z.object({
  id: idSchema,
  systemId: z.string().min(1),
  name: localizedTextSchema,
});
export type Assembly = z.infer<typeof assemblySchema>;

export const systemsFileSchema = z.object({
  systems: z.array(systemSchema),
  assemblies: z.array(assemblySchema).default([]),
});

export const symptomSchema = z.object({
  id: idSchema,
  name: localizedTextSchema,
  aliases: z.array(z.string()).default([]),
});
export type Symptom = z.infer<typeof symptomSchema>;
export const symptomsFileSchema = z.object({ symptoms: z.array(symptomSchema) });

export const SPEC_STATUSES = ["verified", "unverified", "missing"] as const;
export const specStatusSchema = z.enum(SPEC_STATUSES);
export type SpecStatus = z.infer<typeof specStatusSchema>;

export const specSchema = z
  .object({
    key: z.string().min(1),
    label: localizedTextSchema,
    value: z.string().min(1).optional(),
    unit: z.string().optional(),
    status: specStatusSchema,
    sourceId: z.string().optional(),
    appliesWhen: predicateSchema.optional(),
    note: localizedTextSchema.optional(),
  })
  .superRefine((spec, context) => {
    if (spec.status === "missing" && spec.value !== undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `spec ${spec.key} is missing but has a value` });
    }
    if (spec.status !== "missing" && spec.value === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `spec ${spec.key} has no value; mark it missing` });
    }
    if (spec.status === "verified" && !spec.sourceId) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `spec ${spec.key} is verified but has no sourceId` });
    }
  });
export type Spec = z.infer<typeof specSchema>;

export const RELATION_TYPES = ["connects", "drives", "controls", "feeds", "mounts", "monitors"] as const;
export const relationSchema = z.object({
  type: z.enum(RELATION_TYPES),
  target: z.string().min(1),
  note: localizedTextSchema.optional(),
  appliesWhen: predicateSchema.optional(),
});
export type Relation = z.infer<typeof relationSchema>;
export type RelationType = Relation["type"];

export const DOC_KINDS = ["specification", "maintenance", "repair"] as const;
export const docLinkSchema = z.object({
  kind: z.enum(DOC_KINDS),
  title: localizedTextSchema,
  url: z.string().url(),
  lang: z.string().min(2),
  sourceId: z.string().optional(),
  appliesWhen: predicateSchema.optional(),
});
export type DocLink = z.infer<typeof docLinkSchema>;

export const partNumberSchema = z.object({
  value: z.string().min(1),
  status: specStatusSchema.exclude(["missing"]),
  sourceId: z.string().optional(),
  appliesWhen: predicateSchema.optional(),
});
export type PartNumber = z.infer<typeof partNumberSchema>;

export const componentSchema = z.object({
  id: idSchema,
  systemId: z.string().min(1),
  assemblyId: z.string().min(1).optional(),
  name: localizedTextSchema,
  aliases: z.array(z.string()).default([]),
  symptomIds: z.array(z.string().min(1)).default([]),
  function: localizedTextSchema,
  location: localizedTextSchema,
  appliesWhen: predicateSchema.optional(),
  fitment: z
    .object({
      status: specStatusSchema.exclude(["missing"]),
      sourceId: z.string().optional(),
      note: localizedTextSchema.optional(),
    })
    .optional(),
  specs: z.array(specSchema).default([]),
  relations: z.array(relationSchema).default([]),
  docs: z.array(docLinkSchema).default([]),
  partNumbers: z.array(partNumberSchema).default([]),
  extra: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type Component = z.infer<typeof componentSchema>;

export const componentFileSchema = z.object({ components: z.array(componentSchema) });

export const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  url: z.string().url().optional(),
  note: z.string().optional(),
});
export type Source = z.infer<typeof sourceSchema>;

const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vector3Tuple = z.infer<typeof vector3Schema>;

export const shapeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("box"),
    size: vector3Schema,
    position: vector3Schema,
    rotation: vector3Schema.optional(),
  }),
  z.object({
    type: z.literal("cylinder"),
    radius: z.number().positive(),
    length: z.number().positive(),
    axis: z.enum(["x", "y", "z"]),
    position: vector3Schema,
  }),
  z.object({
    type: z.literal("sphere"),
    radius: z.number().positive(),
    position: vector3Schema,
  }),
]);
export type Shape = z.infer<typeof shapeSchema>;

export const mappingVariantSchema = z.object({
  appliesWhen: predicateSchema,
  meshes: z.array(z.string()).default([]),
  shapes: z.array(shapeSchema).default([]),
});

export const partMappingSchema = z.object({
  meshes: z.array(z.string()).default([]),
  shapes: z.array(shapeSchema).default([]),
  variants: z.array(mappingVariantSchema).default([]),
  explode: vector3Schema.optional(),
  placementStatus: z.enum(["measured", "approximate"]).default("approximate"),
});
export type PartMapping = z.infer<typeof partMappingSchema>;

export const bodyMappingSchema = z.object({
  profile: z.array(z.tuple([z.number(), z.number()])).min(3),
  width: z.number().positive(),
  wheels: z.array(z.object({ position: vector3Schema, radius: z.number().positive(), width: z.number().positive() })),
  annotations: z.array(z.object({ from: vector3Schema, to: vector3Schema, label: localizedTextSchema })).default([]),
});

export const modelMapSchema = z.object({
  units: z.literal("m"),
  coordinateNote: z.string(),
  glb: z
    .object({
      file: z.string().regex(/^[\w.-]+\.glb$/, "glb file must be a plain .glb file name inside assets/"),
      title: z.string().min(1),
      author: z.string().min(1),
      license: z.string().min(1),
      sourceUrl: z.string().url().optional(),
      referenceConfig: vehicleConfigSchema.optional(),
      description: z.string().optional(),
      transform: z
        .object({
          position: vector3Schema.default([0, 0, 0]),
          rotation: vector3Schema.default([0, 0, 0]),
          scale: z.number().positive().default(1),
        })
        .default({}),
    })
    .optional(),
  body: bodyMappingSchema.optional(),
  parts: z.record(z.string(), partMappingSchema),
});
export type ModelMap = z.infer<typeof modelMapSchema>;

export const registryEntrySchema = z.object({
  id: idSchema,
  make: z.string().min(1),
  model: z.string().min(1),
  generation: z.string().min(1),
  path: z.string().min(1),
});
export const registrySchema = z.object({ vehicles: z.array(registryEntrySchema) });
export type RegistryEntry = z.infer<typeof registryEntrySchema>;

export interface VehiclePackage {
  vehicle: Vehicle;
  systems: VehicleSystem[];
  assemblies: Assembly[];
  symptoms: Symptom[];
  components: Component[];
  sources: Source[];
  modelMap: ModelMap;
}
