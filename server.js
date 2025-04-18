import express from "express";
import axios from "axios";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { spawn } from "child_process";

const app = express();
app.use(express.json({ limit: "5mb" }));   // Webhook-JSON einlesen

app.post("/concat", async (req, res) => {
  const urls = req.body.audio_urls;
  if (!Array.isArray(urls) || !urls.length)
    return res.status(400).json({ error: "audio_urls[] fehlt" });

  // 1) Temp‑Verzeichnis pro Request
  const dir = mkdtempSync(join(tmpdir(), "aud-"));

  // 2) MP3s herunterladen
  const parts = [];
  for (let i = 0; i < urls.length; i++) {
    const file = join(dir, `p${i}.mp3`);
    const { data } = await axios.get(urls[i], { responseType: "arraybuffer" });
    writeFileSync(file, data);
    parts.push(file);
  }

  // 3) Liste für ffmpeg
  const list = join(dir, "list.txt");
  writeFileSync(list, parts.map((f) => `file '${f}'`).join("\n"));

  // 4) ffmpeg starten und STDOUT → HTTP‑Stream
  res.writeHead(200, { "Content-Type": "audio/mpeg" });
  const ff = spawn("ffmpeg", [
    "-f", "concat", "-safe", "0", "-i", list,
    "-c", "copy", "-f", "mp3", "pipe:1",
  ]);

  ff.stdout.pipe(res);
  ff.stderr.on("data", (d) => console.log(d.toString()));

  ff.on("close", () => [...parts, list].forEach(unlinkSync)); // aufräumen
});

app.listen(process.env.PORT || 3000, () =>
  console.log("API läuft auf Port", process.env.PORT || 3000)
);
