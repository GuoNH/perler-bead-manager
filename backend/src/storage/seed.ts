import { mard291Colors } from "../catalog/mard-291.js";
import type { WarehouseStore } from "./warehouse-store.js";

/** Mard 种子数据的品牌名，写入 inventory_items.supplier。 */
export const MARD_BRAND = "Mard";

/**
 * 若台账为空，则灌入 Mard 291 色号作为初始库存（当前库存 0、最低库存 0）。
 * 已有台账时不做任何事，避免重复写入。返回本次写入的条数。
 */
export function seedMard291IfEmpty(store: WarehouseStore): number {
  if (store.countInventory() > 0) return 0;
  for (const c of mard291Colors) {
    store.upsertItem(c.code, {
      color: c.rgb.join(","),
      currentStock: 0,
      minStock: 0,
      supplier: MARD_BRAND,
    });
  }
  return mard291Colors.length;
}
