import fs from "fs";
import path from "path";
import { type Request } from "express";

export interface UploadStats {
  chunks: number;
  received: number;
  expectedSize: number;
  clientChunkSize: string;
  startTime: number;
}

export interface UploadResult {
  requestId: string;
  filePath: string;
  totalBytes: number;
  duration: number;
  chunks: number;
}

export const activeUploads: Record<string, UploadStats> = {};

export function generateReqId(): string {
  return Math.random().toString(36).substring(7);
}

export function createFilePath(requestId: string, uploadDir: string): string {
  const fileName = `upload-${Date.now()}-${requestId}.mp4`;
  return path.join(uploadDir, fileName);
}

export function initialUploadStats(
  req: Request,
  startTime: number,
): UploadStats {
  // Headers is a special class in the Fetch API.
  // It provides methods like .get(), .set(), .has(), but not direct property access.
  // So req.headers["x-chunk-size"] is invalid in TypeScript.

  const contentLength: string | string[] | undefined =
    req.headers["content-length"];
  const expectedSize = contentLength ? parseInt(contentLength, 10) : 0;

  const clientChunkHeader: string | string[] | undefined =
    req.headers["x-chunk-size"];
  const clientChunkSizeStr = Array.isArray(clientChunkHeader)
    ? `
  ${Number(clientChunkHeader[0]) / 1024}KB`
    : clientChunkHeader
      ? `${Number(clientChunkHeader) / 1024}KB`
      : "Unknown";
  return {
    chunks: 0,
    received: 0,
    expectedSize,
    clientChunkSize: clientChunkSizeStr,
    startTime,
  };
}

export function updateUploadStats(
  requestId: string,
  chunkLength: number,
): void {
  const stats = activeUploads[requestId];
  if (stats) {
    stats.received += chunkLength;
    stats.chunks++;
  }
}

export function finalizeUpload(
  requestId: string,
  filePath: string,
  startTime: number,
  logFile: string,
): UploadResult {
  const stats = activeUploads[requestId];
  if (!stats) {
    throw new Error(`Upload stats not found for ${requestId}`);
  }

  const duration = (Date.now() - startTime) / 1000;
  const memoryUsage = process.memoryUsage();

  const logEntry = `
[${new Date().toISOString()}] ${stats.clientChunkSize} //Chunk Setting
Upload complete
File: ${filePath}
Total size: ${(stats.received / 1024 / 1024).toFixed(2)} MB
Chunks: ${stats.chunks}
Duration: ${duration.toFixed(2)} seconds
${formatMemoryUsage(memoryUsage)}
----------------------------------------
`;
  fs.appendFileSync(logFile, logEntry);
  cleanupUpload(requestId);
  updateConsole(activeUploads);

  return {
    requestId,
    filePath,
    totalBytes: stats.received,
    duration,
    chunks: stats.chunks,
  };
}

export function cleanupUpload(requestId: string): void {
  delete activeUploads[requestId];
}

let lastLineCount = 0;

export function formatMemoryUsage(memoryUsage: NodeJS.MemoryUsage): string {
  const toMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + " MB";
  return `
Memory usage:
  rss          : ${toMB(memoryUsage.rss)}   (Resident Set Size)
  heapTotal    : ${toMB(memoryUsage.heapTotal)}   (JS heap allocated)
  heapUsed     : ${toMB(memoryUsage.heapUsed)}   (JS heap actually used)
  external     : ${toMB(memoryUsage.external)}   (C++ objects, Buffers)
  arrayBuffers : ${toMB(memoryUsage.arrayBuffers)}   (ArrayBuffer allocations)
`;
}

export function updateConsole(
  activeUploads: Record<string, UploadStats>,
): void {
  if (lastLineCount > 0) {
    process.stdout.write(`\x1b[${lastLineCount}A\x1b[0J`);
  }

  const lines: string[] = [];
  lines.push("=== Active Server Uploads ===");

  const ids = Object.keys(activeUploads);
  if (ids.length === 0) {
    lines.push("Status: Idle (No active streams  )");
  } else {
    ids.forEach((id) => {
      const up = activeUploads[id];
      if (!up) return;
      const progress = up.expectedSize
        ? ((up.received / up.expectedSize) * 100).toFixed(2)
        : "Unknown";
      const mbRecv = (up.received / 1024 / 1024).toFixed(2);
      // 4. Calculate elapsed time
      const elapsedSeconds = ((Date.now() - up.startTime) / 1000).toFixed(1);

      // 5. Add Time column to output
      lines.push(
        `[${id}] Chunks: ${up.chunks.toString().padEnd(5)} | Recv: ${mbRecv.padEnd(7)}MB | Time: ${elapsedSeconds.padStart(5)}s | Progress: ${progress}%`,
      );
    });
  }
  // ADD THESE TWO LINES:
  process.stdout.write(lines.join("\n") + "\n");
  lastLineCount = lines.length;
}
