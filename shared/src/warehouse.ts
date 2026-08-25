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
