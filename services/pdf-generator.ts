import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { dirname } from 'path';

export function generatePdfBuffer(content: Record<string, unknown>): Buffer {
  const text = JSON.stringify(content, null, 2);
  return Buffer.from(text);
}

export function savePdf(filePath: string, buffer: Buffer): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, buffer);
}

export function readPdf(filePath: string): Buffer {
  return readFileSync(filePath);
}
