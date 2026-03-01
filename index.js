const express = require("express");
const multer = require("multer");
const fs = require("fs-extra");
const cors = require("cors");
const { createCanvas, loadImage } = require("canvas");
const { PDFParse } = require("pdf-parse");

const app = express();
app.use(cors());
app.use("/output", express.static("output"));

const upload = multer({ dest: "uploads/" });

/* ===== SIZE CONFIG ===== */
const DPI = 300;
const nameFromTop = 7.2*DPI;
const numberFromTop = nameFromTop + 8*DPI;

const sizeConfig = {
  "S": { w: 20 * DPI, h: 29.5 * DPI },
  "M": { w: 21 * DPI, h: 30.5 * DPI },
  "L": { w: 21.8 * DPI, h: 32 * DPI },
  "XL": { w: 23 * DPI, h: 32.5 * DPI },
  "2XL": { w: 24 * DPI, h: 32.5 * DPI },
  "3XL": { w: 25 * DPI, h: 33.5 * DPI },
  "4XL": { w: 26 * DPI, h: 33.5 * DPI },
  "5XL": { w: 27 * DPI, h: 33.5 * DPI },
  "6XL": { w: 28 * DPI, h: 34 * DPI },
};

/* ===== AUTO FONT FIT FUNCTION ===== */
function fitText(ctx, text, maxWidth, startSize, fontFamily) {
  let size = startSize;

  do {
    ctx.font = `${size}px ${fontFamily}`;
    size--;
  } while (ctx.measureText(text).width > maxWidth);

  return size;
}

/* ===== CENTER MARK ===== */

function drawCenterMarkTop(ctx, cfg) {
  const centerX = cfg.w / 2;

  // place mark at 3% from top
  const y = 0;

  ctx.strokeStyle = "white";
  ctx.lineWidth = cfg.w * 0.003; // scales thickness

  ctx.beginPath();
  ctx.moveTo(centerX, y);
  ctx.lineTo(centerX, y + (0.5 * DPI));
  ctx.stroke();
}

function drawCenterMark(ctx, cfg, sizeLabel) {
  const centerX = cfg.w / 2;


  const y = cfg.h;

  const lineLength = cfg.h * 0.02;

  ctx.strokeStyle = "white";
  ctx.lineWidth = cfg.w * 0.003;

  ctx.beginPath();
  ctx.moveTo(centerX, y );
  ctx.lineTo(centerX, y - (0.5 * DPI));
  ctx.stroke();

  // Size text scaling
  ctx.font = `${0.4*DPI}px Arial`;
  ctx.fillStyle = "white";
  ctx.textAlign = "left";

  ctx.fillText(sizeLabel, centerX + (0.2 * DPI), y - (0.15 * DPI));
}
/* ===== PDF PARSER ===== */
function parsePDF(text) {
  const lines = text.split("\n");
  const players = [];
  let start = false;

  for (let line of lines) {
    line = line.trim();
    if (line.startsWith("S.No")) {
      start = true;
      continue;
    }
    if (!start) continue;

    const m = line.match(/^(\d+)\s+(.+?)\s+(\d+)\s+((?:\d{0,2})?XL|S|M|L)/i);
    if (!m) continue;

    players.push({
      name: m[2].trim(),
      number: m[3].trim(),
      size: m[4].toUpperCase(),
    });
  }
  return players;
}

/* ===== MAIN API ===== */
app.post(
  "/generate",
  upload.fields([
    { name: "pdfFile" },
    { name: "frontDesign" },
    { name: "backDesign" },
    { name: "leftLogo" },
    { name: "rightLogo" },
  ]),
  async (req, res) => {
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
        backBorderColor,
      } = req.body;

      const pdf = req.files.pdfFile[0].path;
      const frontImg = req.files.frontDesign[0].path;
      const backImg = req.files.backDesign[0].path;
      const leftLogo = req.files.leftLogo?.[0]?.path;
      const rightLogo = req.files.rightLogo?.[0]?.path;

      const buffer = fs.readFileSync(pdf);
      const parser = new PDFParse({ data: buffer });
      const text = await parser.getText();

      const players = parsePDF(text.text);
      const uniqueSizes = [...new Set(players.map((p) => p.size))];

      const sizeCounts = {};
      players.forEach(p => {
        sizeCounts[p.size] = (sizeCounts[p.size] || 0) + 1;
      });

      const frontResults = [];
      const backResults = [];

      /* ===== FRONT ===== */
      for (let size of uniqueSizes) {
        const cfg = sizeConfig[size];
        if (!cfg) continue;

        const canvas = createCanvas(cfg.w, cfg.h);
        const ctx = canvas.getContext("2d");

        const base = await loadImage(frontImg);
        ctx.drawImage(base, 0, 0, cfg.w, cfg.h);

        drawCenterMarkTop(ctx, cfg);
        const centerX = cfg.w / 2;
    


// FIXED PRINT SIZE (in inches)
const logoSizeInch = 3;
const logoW = logoSizeInch * DPI;
const logoH = logoSizeInch * DPI;

// gap from center (also fixed in inches)
const gapInch = 2;
const gap = gapInch * DPI;

const logoY = cfg.h * 0.12; // 12% from top (matches designer)

if (leftLogo) {
  const l = await loadImage(leftLogo);
  const leftX = centerX - gap - logoW;
  ctx.drawImage(l, leftX, logoY, logoW, logoH);
}

if (rightLogo) {
  const r = await loadImage(rightLogo);
  const rightX = centerX + gap;
  ctx.drawImage(r, rightX, logoY, logoW, logoH);
}

        if (teamName) {
          ctx.textAlign = "center";
          ctx.fillStyle = frontFontColor;

          const maxWidth = cfg.w * 0.8;
          const fontSize = fitText(
            ctx,
            teamName,
            maxWidth,
            cfg.w / 10,
            frontFontStyle
          );

          ctx.font = `${fontSize}px ${frontFontStyle}`;

          if (frontBorder === "true") {
            ctx.strokeStyle = frontBorderColor;
            ctx.lineWidth = 3;
            ctx.strokeText(teamName, centerX, cfg.h* 0.42);
          }

          ctx.fillText(teamName, centerX, cfg.h* 0.42);
        }

        drawCenterMark(ctx, cfg, size);

        const file = `front_${size}_${sizeCounts[size]}pcs.jpg`;
        fs.writeFileSync(`output/${file}`, canvas.toBuffer("image/jpeg", { quality: 1 }));
        frontResults.push({
          size,
          url: `${req.protocol}://${req.get("host")}/output/${file}`,
          width: cfg.w,
          height: cfg.h,
        });
      }

      /* ===== BACK ===== */
      for (let p of players) {
        const cfg = sizeConfig[p.size];
        if (!cfg) continue;

        const canvas = createCanvas(cfg.w, cfg.h);
        const ctx = canvas.getContext("2d");

        const base = await loadImage(backImg);
        ctx.drawImage(base, 0, 0, cfg.w, cfg.h);
        drawCenterMarkTop(ctx, cfg)

        ctx.textAlign = "center";
        ctx.fillStyle = backFontColor;

        if (p.name) {
          const maxWidth = cfg.w * 0.8;
          const fontSize = fitText(
            ctx,
            p.name,
            maxWidth,
            cfg.w / 8,
            backFontStyle
          );

          ctx.font = `${fontSize}px ${backFontStyle}`;

          if (backBorder === "true") {
            ctx.strokeStyle = backBorderColor;
            ctx.lineWidth = 3;
            ctx.strokeText(p.name, cfg.w / 2, nameFromTop);
          }

          ctx.fillText(p.name, cfg.w / 2, nameFromTop);
        }

        if (p.number) {
          const maxWidth = cfg.w * 0.6;
          const fontSize = fitText(
            ctx,
            p.number,
            maxWidth,
            cfg.w / 3,
            backFontStyle
          );

          ctx.font = `${fontSize}px ${backFontStyle}`;

          if (backBorder === "true") {
            ctx.strokeStyle = backBorderColor;
            ctx.lineWidth = 4;
            ctx.strokeText(p.number, cfg.w / 2, numberFromTop);
          }

          ctx.fillText(p.number, cfg.w / 2, numberFromTop);
        }

        drawCenterMark(ctx, cfg, p.size);

        const file = `${p.name}_${p.size}.jpg`;
        fs.writeFileSync(`output/${file}`, canvas.toBuffer("image/jpeg", { quality: 1 }));

        backResults.push({
          name: p.name,
          number: p.number,
          size: p.size,
          url: `${req.protocol}://${req.get("host")}/output/${file}`,
          width: cfg.w,
          height: cfg.h,
        });
      }

      res.json({ success: true, frontImages: frontResults, backImages: backResults });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log("Server running on", PORT));



