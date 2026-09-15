export interface InventoryItem {
  id: string;
  color: string;
  currentStock: number;
  minStock: number;
  unit: string;
  note: string;
  location: string;
  supplier: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItemInput {
  color?: string;
  currentStock: number;
  minStock: number;
  unit?: string;
  note?: string;
  location?: string;
  supplier?: string;
}

export interface InventorySummary extends InventoryItem {
  deficit: number;
  cumulativeConsumed: number;
}

export interface Submission {
  id: string;
  imageName: string;
  createdAt: string;
  revertedAt: string | null;
  lines: Array<{ beadId: string; count: number }>;
}

export interface BatchItemInput {
  id: string;
  /** 累加到当前库存的数量（批量补货）。 */
  amount?: number;
  /** 覆盖最低库存线（安全线）。 */
  minStock?: number;
}

export interface BatchUpdateResult {
  updated: number;
  errors: string[];
}
