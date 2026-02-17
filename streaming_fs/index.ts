import express from "express";

const app = express();
const port = 7055;

app.post("/upload", (req, res) => {
  let totalBytes = 0;
  req.on("data", (chunk) => {
    console.log(`Chunk length: ${chunk.length}`);
    totalBytes += chunk.length;
  });
  req.on("end", () => {
    console.log(`Total size: ${totalBytes} bytes`);
    res.send("Upload complete");
  });

  req.on("error", (err) => {
    console.error("Upload error:", err);
    res.status(500).send("Upload failed");
  });
});

app.listen(port, () => {
  console.log(`running ${port}`);
});

// req extends IncomingMessage → which extends Readable

/**
 *  req.on("data", chunk => {})
req.on("end", () => {})
 */



