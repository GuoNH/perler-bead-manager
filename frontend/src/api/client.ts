import type { RecognizeResult, SubmitPayload } from "@pinpin/shared";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "请求失败");
  return res.json() as Promise<T>;
}

export async function recognizeImage(file: File): Promise<RecognizeResult> {
  const form = new FormData();
  form.append("image", file);
  return json(await fetch("/api/recognize", { method: "POST", body: form }));
}

export async function submitRecognition(payload: SubmitPayload): Promise<{ id: string; total: number; jsonPath: string; csvPath: string }> {
  return json(await fetch("/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }));
}
