import type {
  BatchItemInput,
  BatchUpdateResult,
  InventoryItemInput,
  InventorySummary,
  Submission,
} from "@pinpin/shared";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "请求失败");
  return res.json() as Promise<T>;
}

export async function listInventory(search = ""): Promise<InventorySummary[]> {
  return json(await fetch(`/api/inventory?search=${encodeURIComponent(search)}`));
}
export async function listReplenish(): Promise<InventorySummary[]> {
  return json(await fetch("/api/inventory/replenish"));
}
export async function upsertInventory(id: string, input: InventoryItemInput): Promise<InventorySummary> {
  return json(await fetch(`/api/inventory/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}
export async function batchUpdate(items: BatchItemInput[]): Promise<BatchUpdateResult> {
  return json(await fetch("/api/inventory/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  }));
}
export async function importInventory(file: File): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const form = new FormData();
  form.append("file", file);
  return json(await fetch("/api/inventory/import", { method: "POST", body: form }));
}
export async function listSubmissions(): Promise<Submission[]> {
  return json(await fetch("/api/submissions"));
}
export async function revertSubmission(id: string): Promise<void> {
  await json(await fetch(`/api/submissions/${encodeURIComponent(id)}/revert`, { method: "POST" }));
}
