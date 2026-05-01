export function loadCollapsedCategories() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const raw = window.localStorage.getItem("sori-app-collapsed-channel-categories");
    const values = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

export function saveCollapsedCategories(categories: Set<string>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem("sori-app-collapsed-channel-categories", JSON.stringify(Array.from(categories)));
}
