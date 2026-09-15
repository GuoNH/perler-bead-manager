import { DatabaseSync } from "node:sqlite";
import type {
  Drawing,
  DrawingCategory,
  DrawingCategoryInput,
  DrawingInput,
} from "@pinpin/shared";

type Row = Record<string, unknown>;

export class DrawingStore {
  constructor(private readonly db: DatabaseSync) {}

  /* ── 分类 CRUD ── */

  listCategories(): DrawingCategory[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM drawing_categories ORDER BY sort_order ASC, name ASC",
      )
      .all() as Row[];
    return rows.map((r) => this.mapCategory(r));
  }

  getCategory(id: string): DrawingCategory | undefined {
    const row = this.db
      .prepare("SELECT * FROM drawing_categories WHERE id = ?")
      .get(id) as Row | undefined;
    return row ? this.mapCategory(row) : undefined;
  }

  createCategory(input: DrawingCategoryInput): DrawingCategory {
    const now = new Date().toISOString();
    const id = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.db
      .prepare(
        `INSERT INTO drawing_categories (id, name, parent_id, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.parentId ?? null,
        input.sortOrder ?? 0,
        now,
        now,
      );
    return this.getCategory(id)!;
  }

  updateCategory(id: string, input: DrawingCategoryInput): DrawingCategory {
    const now = new Date().toISOString();
    const existing = this.getCategory(id);
    if (!existing) throw new Error("分类不存在");
    this.db
      .prepare(
        `UPDATE drawing_categories
         SET name = ?, parent_id = ?, sort_order = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.name,
        input.parentId ?? null,
        input.sortOrder ?? existing.sortOrder,
        now,
        id,
      );
    return this.getCategory(id)!;
  }

  deleteCategory(id: string): void {
    // 将属于此分类的图纸设为无分类
    this.db
      .prepare("UPDATE drawings SET category_id = NULL WHERE category_id = ?")
      .run(id);
    this.db
      .prepare("DELETE FROM drawing_categories WHERE id = ?")
      .run(id);
  }

  /* ── 图纸 CRUD ── */

  listDrawings(categoryId?: string): Drawing[] {
    let sql = "SELECT * FROM drawings";
    const params: string[] = [];
    if (categoryId) {
      sql += " WHERE category_id = ?";
      params.push(categoryId);
    }
    sql += " ORDER BY created_at DESC";
    const rows = this.db.prepare(sql).all(...params) as Row[];
    return rows.map((r) => this.mapDrawing(r));
  }

  getDrawing(id: string): Drawing | undefined {
    const row = this.db
      .prepare("SELECT * FROM drawings WHERE id = ?")
      .get(id) as Row | undefined;
    return row ? this.mapDrawing(row) : undefined;
  }

  /** 在提交时创建图纸归档条目。 */
  createDrawing(
    id: string,
    submissionId: string,
    input: {
      imageName: string;
      imageExt: string;
      width: number;
      height: number;
      totalBeads: number;
      colorCount: number;
    },
  ): Drawing {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO drawings
           (id, submission_id, image_name, image_ext, category_id,
            width, height, total_beads, color_count, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, '', ?, ?)`,
      )
      .run(
        id,
        submissionId,
        input.imageName,
        input.imageExt,
        input.width,
        input.height,
        input.totalBeads,
        input.colorCount,
        now,
        now,
      );
    return this.getDrawing(id)!;
  }

  updateDrawing(id: string, input: DrawingInput): Drawing {
    const now = new Date().toISOString();
    const existing = this.getDrawing(id);
    if (!existing) throw new Error("图纸不存在");

    if (input.categoryId !== undefined) {
      this.db
        .prepare("UPDATE drawings SET category_id = ?, updated_at = ? WHERE id = ?")
        .run(input.categoryId ?? null, now, id);
    }
    if (input.note !== undefined) {
      this.db
        .prepare("UPDATE drawings SET note = ?, updated_at = ? WHERE id = ?")
        .run(input.note, now, id);
    }
    return this.getDrawing(id)!;
  }

  deleteDrawing(id: string): void {
    this.db.prepare("DELETE FROM drawings WHERE id = ?").run(id);
  }

  /** 按图片名称查找图纸（精确匹配 image_name）。 */
  findDrawingByName(name: string): Drawing | undefined {
    const row = this.db
      .prepare("SELECT * FROM drawings WHERE image_name = ?")
      .get(name) as Row | undefined;
    return row ? this.mapDrawing(row) : undefined;
  }

  /** 检查图片名称是否已存在。 */
  countByName(name: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS c FROM drawings WHERE image_name = ?")
      .get(name) as { c: number };
    return row.c;
  }

  /* ── 内部映射 ── */

  private mapCategory(r: Row): DrawingCategory {
    return {
      id: r.id as string,
      name: r.name as string,
      parentId: (r.parent_id as string | null) ?? null,
      sortOrder: r.sort_order as number,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  }

  private mapDrawing(r: Row): Drawing {
    return {
      id: r.id as string,
      submissionId: (r.submission_id as string | null) ?? null,
      imageName: r.image_name as string,
      imageExt: r.image_ext as string,
      categoryId: (r.category_id as string | null) ?? null,
      width: r.width as number,
      height: r.height as number,
      totalBeads: r.total_beads as number,
      colorCount: r.color_count as number,
      note: r.note as string,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  }
}