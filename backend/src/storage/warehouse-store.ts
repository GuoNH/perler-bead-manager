import { DatabaseSync } from "node:sqlite";
import type {
  InventoryItem,
  InventoryItemInput,
  InventorySummary,
  Submission,
} from "@pinpin/shared";
import { openDb } from "./db.js";

export { openDb };

export class WarehouseStore {
  constructor(private readonly db: DatabaseSync) {}

  upsertItem(id: string, input: InventoryItemInput): InventorySummary {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare("SELECT id FROM inventory_items WHERE id = ?")
      .get(id);
    if (!existing) {
      this.db.prepare(
        `INSERT INTO inventory_items
          (id, color, current_stock, min_stock, unit, note, location, supplier, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.color ?? "",
        input.currentStock,
        input.minStock,
        input.unit ?? "颗",
        input.note ?? "",
        input.location ?? "",
        input.supplier ?? "",
        now,
        now,
      );
    } else {
      this.db.prepare(
        `UPDATE inventory_items
         SET color = COALESCE(?, color),
             current_stock = ?,
             min_stock = ?,
             unit = COALESCE(?, unit),
             note = COALESCE(?, note),
             location = COALESCE(?, location),
             supplier = COALESCE(?, supplier),
             updated_at = ?
         WHERE id = ?`,
      ).run(
        input.color ?? null,
        input.currentStock,
        input.minStock,
        input.unit ?? null,
        input.note ?? null,
        input.location ?? null,
        input.supplier ?? null,
        now,
        id,
      );
    }
    return this.listInventory().find((x) => x.id === id)!;
  }

  listInventory(search = ""): InventorySummary[] {
    const rows = this.db.prepare(
      `SELECT i.*,
              MAX(0, i.min_stock - i.current_stock) AS deficit,
              COALESCE(SUM(l.count), 0) AS cumulative_consumed
       FROM inventory_items i
       LEFT JOIN consumption_lines l ON l.bead_id = i.id
       WHERE i.id LIKE ?
       GROUP BY i.id
       ORDER BY i.id`,
    ).all(`%${search}%`) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapItem(r));
  }

  listReplenish(): InventorySummary[] {
    return this.listInventory().filter((x) => x.currentStock < x.minStock);
  }

  deleteItem(id: string): void {
    const used = this.db
      .prepare("SELECT COUNT(*) AS c FROM consumption_lines WHERE bead_id = ?")
      .get(id) as { c: number };
    if (used.c > 0) throw new Error("该编号已有消耗流水，不能删除");
    this.db.prepare("DELETE FROM inventory_items WHERE id = ?").run(id);
  }

  consumeSubmission(
    submissionId: string,
    imageName: string,
    lines: Array<{ beadId: string; count: number }>,
  ): void {
    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare(
        "INSERT INTO submissions (id, image_name, created_at) VALUES (?, ?, ?)",
      ).run(submissionId, imageName, now);
      const insertLine = this.db.prepare(
        "INSERT INTO consumption_lines (submission_id, bead_id, count) VALUES (?, ?, ?)",
      );
      const ensureItem = this.db.prepare(
        `INSERT OR IGNORE INTO inventory_items
          (id, color, current_stock, min_stock, unit, note, location, supplier, created_at, updated_at)
         VALUES (?, '', 0, 0, '颗', '', '', '', ?, ?)`,
      );
      const decrement = this.db.prepare(
        "UPDATE inventory_items SET current_stock = current_stock - ?, updated_at = ? WHERE id = ?",
      );
      for (const line of lines) {
        ensureItem.run(line.beadId, now, now);
        insertLine.run(submissionId, line.beadId, line.count);
        decrement.run(line.count, now, line.beadId);
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  revertSubmission(submissionId: string): void {
    const sub = this.db
      .prepare("SELECT id, reverted_at FROM submissions WHERE id = ?")
      .get(submissionId) as { id: string; reverted_at: string | null } | undefined;
    if (!sub) throw new Error("提交不存在");
    if (sub.reverted_at) throw new Error("该提交已撤销");
    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE submissions SET reverted_at = ? WHERE id = ?").run(now, submissionId);
      const lines = this.db.prepare(
        "SELECT bead_id, count FROM consumption_lines WHERE submission_id = ?",
      ).all(submissionId) as Array<{ bead_id: string; count: number }>;
      const increment = this.db.prepare(
        "UPDATE inventory_items SET current_stock = current_stock + ?, updated_at = ? WHERE id = ?",
      );
      for (const line of lines) {
        increment.run(line.count, now, line.bead_id);
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  listSubmissions(): Submission[] {
    const subs = this.db.prepare(
      "SELECT * FROM submissions ORDER BY created_at DESC",
    ).all() as Array<Record<string, unknown>>;
    return subs.map((s) => ({
      id: s.id as string,
      imageName: s.image_name as string,
      createdAt: s.created_at as string,
      revertedAt: (s.reverted_at as string | null) ?? null,
      lines: (this.db.prepare(
        "SELECT bead_id, count FROM consumption_lines WHERE submission_id = ?",
      ).all(s.id as string) as Array<{ bead_id: string; count: number }>).map((l) => ({
        beadId: l.bead_id,
        count: l.count,
      })),
    }));
  }

  private mapItem(r: Record<string, unknown>): InventorySummary {
    return {
      id: r.id as string,
      color: r.color as string,
      currentStock: r.current_stock as number,
      minStock: r.min_stock as number,
      unit: r.unit as string,
      note: r.note as string,
      location: r.location as string,
      supplier: r.supplier as string,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      deficit: r.deficit as number,
      cumulativeConsumed: r.cumulative_consumed as number,
    };
  }
}
