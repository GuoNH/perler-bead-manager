import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  RecognitionRecord,
  RecognitionSummary,
  ResultStore,
} from "@pinpin/shared";

export class JsonResultStore implements ResultStore {
  constructor(private readonly dir: string) {}

  private id(now: Date = new Date()): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  }

  private toCsv(record: RecognitionRecord): string {
    const rows = record.legend.map((item) => {
      const color = `${item.rgb.r},${item.rgb.g},${item.rgb.b}`;
      return `"${item.id}","${color}",${item.count}`;
    });
    return ["编号,颜色,数量", ...rows].join("\n");
  }

  async save(record: RecognitionRecord) {
    await mkdir(this.dir, { recursive: true });
    const id = record.id || this.id();
    const full: RecognitionRecord = {
      ...record,
      id,
      createdAt: record.createdAt || new Date().toISOString(),
    };
    const jsonPath = join(this.dir, `${id}.json`);
    const csvPath = join(this.dir, `${id}.csv`);
    await writeFile(jsonPath, JSON.stringify(full, null, 2), "utf8");
    await writeFile(csvPath, this.toCsv(full), "utf8");
    const index = await this.list().catch((): RecognitionSummary[] => []);
    index.push({
      id,
      imageName: full.image.name,
      createdAt: full.createdAt,
      total: full.legend.reduce((sum, item) => sum + item.count, 0),
      colorCount: full.legend.length,
    });
    await writeFile(join(this.dir, "index.json"), JSON.stringify(index, null, 2), "utf8");
    return { id, jsonPath, csvPath };
  }

  async list(): Promise<RecognitionSummary[]> {
    try {
      return JSON.parse(await readFile(join(this.dir, "index.json"), "utf8"));
    } catch {
      return [];
    }
  }

  async get(id: string): Promise<RecognitionRecord> {
    return JSON.parse(await readFile(join(this.dir, `${id}.json`), "utf8"));
  }
}
