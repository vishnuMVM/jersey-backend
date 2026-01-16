const express = require("express");
const multer = require("multer");
const fs = require("fs-extra");
const cors = require("cors");
const { createCanvas, loadImage } = require("canvas");
const pdfParse = require("pdf-parse");

const app = express();
app.use(cors());

app.use("/output", express.static("output"));

const upload = multer({ dest: "uploads/" });

/* SIZE CHART (update later if needed) */
const sizeConfig = {
  S: { w: 900, h: 1100, nameY: 400, numY: 700 },
  M: { w: 1000, h: 1200, nameY: 420, numY: 750 },
  L: { w: 1100, h: 1300, nameY: 450, numY: 800 },
  XL: { w: 1200, h: 1400, nameY: 480, numY: 850 },
  "2XL": { w: 1300, h: 1500, nameY: 520, numY: 900 }
};

/* -------- PDF PARSER (YOUR FORMAT) -------- */
function parsePDF(text) {

  const lines = text.split("\n");
  const players = [];

  lines.forEach(line => {

    line = line.trim();

    // Example:
    // 1 vishnu 22 L FULL
    // 2 vaji 2 2XL HALF

    const parts = line.split(/\s+/);

    if (parts.length < 4) return;

    // Check first column is number (S.No)
    if (!/^\d+$/.test(parts[0])) return;

    let name = "";
    let number = "";
    let size = "";

    name = parts[1] || "";
    number = parts[2] || "";
    size = parts[3] || "";

    if(name=="NONAME"){
      name=""
    }
    if(number=="NONUMBER"){
      number=""
    }
    players.push({
      name: name.trim(),
      number: number.trim(),
      size: size.trim()
    });
  });

  return players;
}

/* -------- MAIN API -------- */

app.post("/generate", upload.fields([
  { name: "pdfFile" },
  { name: "frontDesign" },
  { name: "backDesign" },
  { name: "leftLogo" },
  { name: "rightLogo" }
]), async (req, res) => {

  try {

    fs.emptyDirSync("output");

    const {
      teamName,
      frontFontStyle,
      frontFontColor,
      frontBorder,
      frontBorderColor,

      backFontStyle,
      backFontColor,
      backBorder,
      backBorderColor
    } = req.body;

    const pdfPath = req.files.pdfFile[0].path;
    const frontDesign = req.files.frontDesign[0].path;
    const backDesign = req.files.backDesign[0].path;
    const leftLogo = req.files.leftLogo?.[0]?.path;
    const rightLogo = req.files.rightLogo?.[0]?.path;

    /* READ PDF */
    const buffer = fs.readFileSync(pdfPath);
    const pdfData = await pdfParse(buffer);

    const players = parsePDF(pdfData.text);

    if (!players.length) {
      return res.status(400).json({ error: "No valid data found in PDF" });
    }

    /* UNIQUE SIZES */
    const uniqueSizes = [...new Set(players.map(p => p.size))];
    const results = [];

    /* -------- FRONT IMAGE (PER SIZE) -------- */
    for (let size of uniqueSizes) {

      const cfg = sizeConfig[size];
      if (!cfg) continue;

      const canvas = createCanvas(cfg.w, cfg.h);
      const ctx = canvas.getContext("2d");

      const base = await loadImage(frontDesign);
      ctx.drawImage(base, 0, 0, cfg.w, cfg.h);

      /* LOGOS */
      if (leftLogo) {
        const l = await loadImage(leftLogo);
        ctx.drawImage(l, 80, 120, 120, 120);
      }

      if (rightLogo) {
        const r = await loadImage(rightLogo);
        ctx.drawImage(r, cfg.w - 200, 120, 120, 120);
      }

      /* TEAM NAME */
      if (teamName) {

        ctx.textAlign = "center";
        ctx.font = `70px ${frontFontStyle}`;
        ctx.fillStyle = frontFontColor;

        if (frontBorder === "true") {
          ctx.strokeStyle = frontBorderColor;
          ctx.lineWidth = 4;
          ctx.strokeText(teamName, cfg.w / 2, 360);
        }

        ctx.fillText(teamName, cfg.w / 2, 360);
      }

      const file = `front_${size}.jpg`;
      fs.writeFileSync(`output/${file}`, canvas.toBuffer("image/jpeg"));
      results.push(file);
    }

    /* -------- BACK IMAGE (PER PLAYER) -------- */
    for (let p of players) {

      const cfg = sizeConfig[p.size];
      if (!cfg) continue;

      const canvas = createCanvas(cfg.w, cfg.h);
      const ctx = canvas.getContext("2d");

      const base = await loadImage(backDesign);
      ctx.drawImage(base, 0, 0, cfg.w, cfg.h);

      ctx.textAlign = "center";
      ctx.fillStyle = backFontColor;

      /* NAME */
      if (p.name) {

        ctx.font = `70px ${backFontStyle}`;

        if (backBorder === "true") {
          ctx.strokeStyle = backBorderColor;
          ctx.lineWidth = 4;
          ctx.strokeText(p.name, cfg.w / 2, cfg.nameY);
        }

        ctx.fillText(p.name, cfg.w / 2, cfg.nameY);
      }

      /* NUMBER */
      if (p.number) {

        ctx.font = `140px ${backFontStyle}`;

        if (backBorder === "true") {
          ctx.strokeStyle = backBorderColor;
          ctx.strokeText(p.number, cfg.w / 2, cfg.numY);
        }

        ctx.fillText(p.number, cfg.w / 2, cfg.numY);
      }

      const file = `${p.name || "NONAME"}_${p.size}.jpg`;
      fs.writeFileSync(`output/${file}`, canvas.toBuffer("image/jpeg"));
      results.push(file);
    }

    res.json({
      success: true,
      images: results
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

/* SAFE PORT */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("Backend running on", PORT);
});
