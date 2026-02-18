import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = 7055;


function formatMemoryUsage(memoryUsage: NodeJS.MemoryUsage): string {
  const toMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + " MB";

  return `
Memory usage:
  rss          : ${toMB(memoryUsage.rss)}   (Resident Set Size - total RAM used)
  heapTotal    : ${toMB(memoryUsage.heapTotal)}   (JS heap allocated)
  heapUsed     : ${toMB(memoryUsage.heapUsed)}   (JS heap actually used)
  external     : ${toMB(memoryUsage.external)}   (C++ objects, Buffers, etc.)
  arrayBuffers : ${toMB(memoryUsage.arrayBuffers)}   (ArrayBuffer allocations)
`;
}

app.post("/upload", (req, res) => {
  let totalBytes = 0;
  let chunkCount = 0;
  const startTime = Date.now();

  const uploadDir = path.join(__dirname, "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });

  const logDir = path.join(__dirname, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, "upload.log");

  const filePath = path.join(uploadDir, "Welcome.mp4");
  const writeStream = fs.createWriteStream(filePath, {
    highWaterMark: 1024 * 1024, // try different chunk sizes
  });

  req.on("data", (chunk) => {
    totalBytes += chunk.length;
    chunkCount++;
  });

  req.pipe(writeStream);

  writeStream.on("finish", () => {
    const duration = (Date.now() - startTime) / 1000;
    const memoryUsage = process.memoryUsage();

    const logEntry = `
[${new Date().toISOString()}]
Upload complete
File: ${filePath}
Total size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB
Chunks: ${chunkCount}
Duration: ${duration} seconds
${formatMemoryUsage(memoryUsage)}
----------------------------------------
`;

    fs.appendFileSync(logFile, logEntry);

    res.send(
      `Upload complete. Size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB, Chunks: ${chunkCount}, Time: ${duration}s`,
    );
  });
});

app.listen(port, () => {
  console.log(`running ${port}`);
});
