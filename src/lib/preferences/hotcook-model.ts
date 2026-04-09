import { useSyncExternalStore } from "react";

const HOTCOOK_MODEL_EVENT = "kondate:hotcook-model-change";

export const HOTCOOK_MODEL_STORAGE_KEY = "hotcook_model";

export const HOTCOOK_MODEL_OPTIONS = [
  { value: "KN-HW24H", label: "KN-HW24H (2.4L)" },
  { value: "KN-HW16H", label: "KN-HW16H (1.6L)" },
  { value: "KN-HW24G", label: "KN-HW24G (2.4L)" },
  { value: "KN-HW16G", label: "KN-HW16G (1.6L)" },
  { value: "KN-HW24F", label: "KN-HW24F (2.4L)" },
  { value: "KN-HW16F", label: "KN-HW16F (1.6L)" },
  { value: "KN-HW24E", label: "KN-HW24E (2.4L)" },
  { value: "KN-HW16E", label: "KN-HW16E (1.6L)" },
] as const;

export type HotcookModel = (typeof HOTCOOK_MODEL_OPTIONS)[number]["value"];

export const DEFAULT_HOTCOOK_MODEL: HotcookModel = HOTCOOK_MODEL_OPTIONS[0].value;

function isHotcookModel(value: string | null | undefined): value is HotcookModel {
  return HOTCOOK_MODEL_OPTIONS.some((option) => option.value === value);
}

export function readStoredHotcookModel(
  storage?: Pick<Storage, "getItem"> | null
): HotcookModel {
  const storedValue = storage?.getItem(HOTCOOK_MODEL_STORAGE_KEY);
  return isHotcookModel(storedValue) ? storedValue : DEFAULT_HOTCOOK_MODEL;
}

function writeStoredHotcookModel(storage: Pick<Storage, "setItem">, value: HotcookModel) {
  storage.setItem(HOTCOOK_MODEL_STORAGE_KEY, value);
}

function subscribeToHotcookModel(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === HOTCOOK_MODEL_STORAGE_KEY) {
      onStoreChange();
    }
  };
  const handleLocalUpdate = () => onStoreChange();

  window.addEventListener("storage", handleStorage);
  window.addEventListener(HOTCOOK_MODEL_EVENT, handleLocalUpdate);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(HOTCOOK_MODEL_EVENT, handleLocalUpdate);
  };
}

function getHotcookModelSnapshot(): HotcookModel {
  if (typeof window === "undefined") {
    return DEFAULT_HOTCOOK_MODEL;
  }

  return readStoredHotcookModel(window.localStorage);
}

export function saveHotcookModelPreference(value: HotcookModel) {
  if (typeof window === "undefined") {
    return;
  }

  writeStoredHotcookModel(window.localStorage, value);
  window.dispatchEvent(new Event(HOTCOOK_MODEL_EVENT));
}

export function useHotcookModelPreference(): [HotcookModel, (value: HotcookModel) => void] {
  const model = useSyncExternalStore(
    subscribeToHotcookModel,
    getHotcookModelSnapshot,
    () => DEFAULT_HOTCOOK_MODEL
  );

  return [model, saveHotcookModelPreference];
}
