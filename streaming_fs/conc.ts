import express, { type Request } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  activeUploads,
  generateReqId,
  createFilePath,
  initialUploadStats,
  updateUploadStats,
  finalizeUpload,
  cleanupUpload,
  updateConsole,
} from "./utils.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 7055;

const uploadDir = path.join(__dirname, "uploads");
const logDir = path.join(__dirname, "logs");
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, "upload.log");

app.post("/upload", (req, res) => {
  const startTime = Date.now();
  const requestId = generateReqId();
  const filePath = createFilePath(requestId, uploadDir);

  // Initialize tracking for this request
  activeUploads[requestId] = initialUploadStats(req, startTime);

  const writeStream = fs.createWriteStream(filePath, {
    highWaterMark: 1024 * 1024,
  });

  let lastConsoleUpdate = 0;

  // Stream data with progress tracking
  req.on("data", (chunk) => {
    updateUploadStats(requestId, chunk.length);
    // Only update console every 300ms
    const now = Date.now();
    if (now - lastConsoleUpdate > 2000) {
      updateConsole(activeUploads);
      lastConsoleUpdate = now;
    }
  });

  // Keep the drain listener for writeStream progress (optional, good for large buffers)
  let lastDrainUpdate = Date.now();
  writeStream.on("drain", () => {
    const stats = activeUploads[requestId];
    // We can update console here too if we want, but the data throttler handles it mostly
    if (stats && Date.now() - lastDrainUpdate > 2000) {
      updateConsole(activeUploads);
      lastDrainUpdate = Date.now();
    }
  });

  req.pipe(writeStream);



  writeStream.on("finish", () => {
    finalizeUpload(requestId, filePath, startTime, logFile);

    res.send(`Upload ${requestId} done.`);
  });

  req.on("error", (err: Error) => {
    console.error(`[${requestId}] Request error:`, err);
    cleanupUpload(requestId);
    if (!res.headersSent) {
      res.status(500).send("Upload failed");
    }
  });

  writeStream.on("error", (err: Error) => {
    console.error(`[${requestId}] Write error:`, err);
    cleanupUpload(requestId);
    if (!res.headersSent) {
      res.status(500).send("File save failed");
    }
  });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// - For desktop/server environments with plenty of RAM → go with 512 KB for speed.
// - For memory-constrained systems (IoT, mobile) → go with 2–4 MB to keep allocations low.
// - Avoid very small chunks (<256 KB) unless you need fine-grained control or error recovery.
