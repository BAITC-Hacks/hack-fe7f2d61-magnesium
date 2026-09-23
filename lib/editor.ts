import { fields, type BusinessTask } from "./domain.ts";

export const editableKeys = [
  "title",
  "company",
  "topic",
  "brief",
  ...fields.map(({ key }) => key),
] as const;
export type EditableKey = (typeof editableKeys)[number];
export const editableLabel = (key: EditableKey) =>
  fields.find((field) => field.key === key)?.label ??
  (
    {
      title: "Название",
      company: "Компания",
      topic: "Тема",
      brief: "Исходный бриф",
    } as Record<string, string>
  )[key];

export function taskFingerprint(task: BusinessTask) {
  return JSON.stringify(editableKeys.map((key) => task[key]));
}

// Preserve independent edits; overlapping edits require an explicit human choice.
export function mergeTaskEdits(
  base: BusinessTask,
  local: BusinessTask,
  remote: BusinessTask,
) {
  const merged = {
    ...remote,
    confirmed: [],
    hasUnpublishedChanges: remote.published,
  } as BusinessTask;
  const conflicts: EditableKey[] = [];
  for (const key of editableKeys) {
    if (local[key] === base[key]) continue;
    if (remote[key] !== base[key] && remote[key] !== local[key])
      conflicts.push(key);
    Object.assign(merged, { [key]: local[key] });
  }
  return { merged, conflicts };
}
