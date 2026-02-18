import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = 7055;

const uploadDir = path.join(__dirname, "uploads");
const logDir = path.join(__dirname, "logs");
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, "upload.log");

// Global tracker for active uploads
const activeUploads: Record<string, any> = {};

let lastLineCount = 0;
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

function updateConsole() {
  // Move cursor up by the number of lines we printed last time
  if (lastLineCount > 0) {
    process.stdout.write(`\x1b[${lastLineCount}A`);
  }

  const lines: string[] = [];
  lines.push("=== 🚀 Active Server Uploads ===");

  const ids = Object.keys(activeUploads);
  if (ids.length === 0) {
    lines.push("Status: Idle (No active streams...)   ");
  } else {
    ids.forEach((id) => {
      const up = activeUploads[id];
      const progress = up.expectedSize
        ? ((up.received / up.expectedSize) * 100).toFixed(2)
        : "Unknown";
      const mbRecv = (up.received / 1024 / 1024).toFixed(2);
      // Spaces at the end handle clearing leftover characters from shorter lines
      lines.push(
        `[${id}] Chunks: ${up.chunks.toString().padEnd(5)} | Recv: ${mbRecv.padEnd(7)}MB | Progress: ${progress}%    `,
      );
    });
  }
  lines.push("================================");

  // Join lines and print
  process.stdout.write(lines.join("\n") + "\n");
  lastLineCount = lines.length;
}
app.post("/upload", (req, res) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  // Capture the chunk size sent by our specific client
  const clientChunkHeader = req.headers["x-chunk-size"];
  const clientChunkSizeStr = clientChunkHeader
    ? `${Number(clientChunkHeader) / 1024}KB`
    : "Unknown";

  const expectedSize = Number(req.headers["content-length"]);
  const fileName = `upload-${Date.now()}-${requestId}.mp4`;
  const filePath = path.join(uploadDir, fileName);

  // Initialize tracking for this request
  activeUploads[requestId] = {
    chunks: 0,
    received: 0,
    expectedSize: expectedSize || 0,
    clientChunkSize: clientChunkSizeStr,
  };

  const writeStream = fs.createWriteStream(filePath, {
    // highWaterMark: 1024 * 1024,
  });

  req.on("data", (chunk) => {
    activeUploads[requestId].received += chunk.length;
    activeUploads[requestId].chunks++;
    updateConsole(); // Update the server terminal live
  });

  req.pipe(writeStream);

  writeStream.on("finish", () => {
    const stats = activeUploads[requestId];
    const duration = (Date.now() - startTime) / 1000;
    const memoryUsage = process.memoryUsage();

    const logEntry = `
[${new Date().toISOString()}] ${stats.clientChunkSize} //Chunk Setting
Upload complete
File: ${filePath}
Total size: ${(stats.received / 1024 / 1024).toFixed(2)} MB
Chunks: ${stats.chunks}
Duration: ${duration} seconds
${formatMemoryUsage(memoryUsage)}
----------------------------------------
`;
    fs.appendFileSync(logFile, logEntry);

    delete activeUploads[requestId]; // Remove from dashboard
    updateConsole();

    res.send(`Upload ${requestId} done.`);
  });

  req.on("error", () => {
    delete activeUploads[requestId];
    updateConsole();
  });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});



// - For desktop/server environments with plenty of RAM → go with 512 KB for speed.
// - For memory-constrained systems (IoT, mobile) → go with 2–4 MB to keep allocations low.
// - Avoid very small chunks (<256 KB) unless you need fine-grained control or error recovery.


