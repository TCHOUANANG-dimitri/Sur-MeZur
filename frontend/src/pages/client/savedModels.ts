// No backend table exists for "saved models" (out of the doc-2 schema), so
// this is kept client-side, scoped to the browser, per doc 1 §4.15.
const KEY = "sm_saved_models";

export function getSavedModels(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveForLater(modelId: string) {
  const list = new Set(getSavedModels());
  list.add(modelId);
  localStorage.setItem(KEY, JSON.stringify([...list]));
}
