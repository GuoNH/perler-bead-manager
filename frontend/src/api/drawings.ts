import type {
  Drawing,
  DrawingCategory,
  DrawingCategoryInput,
  DrawingInput,
} from "@pinpin/shared";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "请求失败");
  return res.json() as Promise<T>;
}

/* ── 分类 ── */

export async function listCategories(): Promise<DrawingCategory[]> {
  return json(await fetch("/api/drawings/categories"));
}

export async function createCategory(input: DrawingCategoryInput): Promise<DrawingCategory> {
  return json(
    await fetch("/api/drawings/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateCategory(id: string, input: DrawingCategoryInput): Promise<DrawingCategory> {
  return json(
    await fetch(`/api/drawings/categories/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteCategory(id: string): Promise<void> {
  const res = await fetch(`/api/drawings/categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "删除失败");
}

/* ── 图纸 ── */

export async function listDrawings(categoryId?: string): Promise<Drawing[]> {
  const params = categoryId ? `?category=${encodeURIComponent(categoryId)}` : "";
  return json(await fetch(`/api/drawings${params}`));
}

export async function getDrawing(id: string): Promise<Drawing> {
  return json(await fetch(`/api/drawings/${encodeURIComponent(id)}`));
}

export async function updateDrawing(id: string, input: DrawingInput): Promise<Drawing> {
  return json(
    await fetch(`/api/drawings/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteDrawing(id: string): Promise<void> {
  const res = await fetch(`/api/drawings/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "删除失败");
}

/** 获取图纸图片 URL。 */
export function drawingImageUrl(drawing: { id: string; imageExt: string }) {
  return `/api/drawings/images/${drawing.id}${drawing.imageExt}`;
}

/** 检查图纸名称是否已存在。 */
export async function checkDrawingName(name: string): Promise<{ exists: boolean; count: number }> {
  return json(await fetch(`/api/drawings/check-name?name=${encodeURIComponent(name)}`));
}