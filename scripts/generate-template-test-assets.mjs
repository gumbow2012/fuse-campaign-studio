#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const outputDir = path.resolve("tmp/template-validation-assets");

const assets = [
  {
    filename: "front-garment.png",
    title: "FRONT SET",
    subtitle: "cyan hoodie + graphite pants",
    colors: ["#67e8f9", "#111827", "#f8fafc"],
    mark: "FUSE FRONT",
    type: "outfit",
  },
  {
    filename: "back-garment.png",
    title: "BACK SET",
    subtitle: "same garment, back view",
    colors: ["#22d3ee", "#0f172a", "#facc15"],
    mark: "FUSE BACK",
    type: "outfit",
  },
  {
    filename: "top-garment.png",
    title: "TOP GARMENT",
    subtitle: "oversized campaign hoodie",
    colors: ["#a7f3d0", "#064e3b", "#ffffff"],
    mark: "TOP 01",
    type: "top",
  },
  {
    filename: "bottom-garment.png",
    title: "BOTTOM GARMENT",
    subtitle: "wide-leg technical pants",
    colors: ["#c4b5fd", "#1e1b4b", "#ffffff"],
    mark: "BOTTOM 02",
    type: "bottom",
  },
  {
    filename: "jeans-garment.png",
    title: "DENIM JORTS",
    subtitle: "black waxed denim macro test",
    colors: ["#111827", "#020617", "#e5e7eb"],
    mark: "DENIM 04",
    type: "denim",
  },
  {
    filename: "raven-hoodie.png",
    title: "RAVEN HOODIE",
    subtitle: "dark rhinestone zip hoodie",
    colors: ["#171717", "#020617", "#f8fafc"],
    mark: "RHINE 01",
    type: "raven",
  },
  {
    filename: "logo.png",
    title: "LOGO",
    subtitle: "high contrast placement mark",
    colors: ["#f8fafc", "#0f172a", "#67e8f9"],
    mark: "TAUPE HUE",
    type: "logo",
  },
  {
    filename: "accessory.png",
    title: "ACCESSORY",
    subtitle: "black sunglasses",
    colors: ["#fef08a", "#111827", "#f8fafc"],
    mark: "ACC",
    type: "accessory",
  },
];

function garmentSvg(asset) {
  const [primary, dark, light] = asset.colors;
  const isLogo = asset.type === "logo";
  const isBottom = asset.type === "bottom";
  const isDenim = asset.type === "denim";
  const isAccessory = asset.type === "accessory";
  const isRaven = asset.type === "raven";

  return `
    <html>
      <head>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            width: 1024px;
            height: 1024px;
            display: grid;
            place-items: center;
            background: #f8fafc;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          .stage {
            width: 860px;
            height: 860px;
            border: 2px solid #0f172a;
            border-radius: 42px;
            background:
              linear-gradient(135deg, rgba(15,23,42,.06), rgba(15,23,42,0) 42%),
              repeating-linear-gradient(0deg, rgba(15,23,42,.045) 0 2px, transparent 2px 36px),
              #ffffff;
            display: grid;
            grid-template-rows: 116px 1fr 104px;
            overflow: hidden;
          }
          header, footer {
            padding: 30px 42px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            color: #0f172a;
          }
          h1 {
            margin: 0;
            font-size: 54px;
            line-height: .9;
            letter-spacing: 0;
          }
          p {
            margin: 8px 0 0;
            font-size: 23px;
            color: #475569;
          }
          .badge {
            border: 2px solid #0f172a;
            border-radius: 999px;
            padding: 12px 18px;
            font-weight: 900;
            letter-spacing: 0;
            background: ${primary};
          }
          .product {
            position: relative;
            display: grid;
            place-items: center;
          }
          .hoodie {
            position: relative;
            width: 420px;
            height: 500px;
            border-radius: 84px 84px 44px 44px;
            background: ${primary};
            border: 7px solid ${dark};
            box-shadow: 0 30px 0 rgba(15,23,42,.08);
          }
          .hoodie:before, .hoodie:after {
            content: "";
            position: absolute;
            top: 116px;
            width: 146px;
            height: 310px;
            border-radius: 60px;
            background: ${primary};
            border: 7px solid ${dark};
            z-index: -1;
          }
          .hoodie:before { left: -102px; transform: rotate(14deg); }
          .hoodie:after { right: -102px; transform: rotate(-14deg); }
          .hood {
            position: absolute;
            left: 86px;
            top: -58px;
            width: 248px;
            height: 168px;
            border-radius: 110px 110px 54px 54px;
            border: 7px solid ${dark};
            background: ${primary};
          }
          .zip {
            position: absolute;
            left: 50%;
            top: 122px;
            bottom: 34px;
            width: 7px;
            background: ${dark};
          }
          .mark {
            position: absolute;
            left: 50%;
            top: 230px;
            transform: translateX(-50%);
            min-width: 230px;
            border-radius: 20px;
            background: ${light};
            border: 5px solid ${dark};
            padding: 18px 22px;
            text-align: center;
            color: ${dark};
            font-weight: 950;
            font-size: 34px;
            letter-spacing: 0;
          }
          .pants {
            position: relative;
            width: 460px;
            height: 560px;
          }
          .waist {
            width: 360px;
            height: 74px;
            margin: 0 auto;
            border-radius: 32px 32px 10px 10px;
            background: ${primary};
            border: 7px solid ${dark};
          }
          .leg {
            position: absolute;
            top: 66px;
            width: 190px;
            height: 470px;
            border-radius: 24px 24px 42px 42px;
            background: ${primary};
            border: 7px solid ${dark};
          }
          .leg.left { left: 28px; transform: rotate(2deg); }
          .leg.right { right: 28px; transform: rotate(-2deg); }
          .shorts {
            position: relative;
            width: 560px;
            height: 500px;
          }
          .shorts .waist {
            width: 430px;
            background: linear-gradient(90deg, ${primary}, #273244, ${primary});
          }
          .short-leg {
            position: absolute;
            top: 66px;
            width: 224px;
            height: 300px;
            border-radius: 20px 20px 58px 58px;
            background:
              repeating-linear-gradient(90deg, rgba(255,255,255,.08) 0 3px, transparent 3px 15px),
              ${primary};
            border: 7px solid ${dark};
          }
          .short-leg.left { left: 50px; transform: rotate(2deg); }
          .short-leg.right { right: 50px; transform: rotate(-2deg); }
          .pocket {
            position: absolute;
            top: 62px;
            left: 44px;
            width: 112px;
            height: 118px;
            border: 5px solid ${light};
            border-radius: 12px 12px 28px 28px;
            opacity: .9;
          }
          .zipper {
            position: absolute;
            left: 50%;
            top: 84px;
            width: 9px;
            height: 210px;
            background: ${light};
            box-shadow: 0 0 0 5px ${dark};
          }
          .studs:before {
            content: "";
            position: absolute;
            inset: 0;
            background-image: radial-gradient(circle, ${light} 0 4px, transparent 5px);
            background-size: 38px 38px;
            opacity: .75;
            pointer-events: none;
          }
          .logo-mark {
            width: 620px;
            height: 360px;
            border-radius: 48px;
            border: 9px solid ${dark};
            background: ${dark};
            color: ${primary};
            display: grid;
            place-items: center;
            text-align: center;
            font-size: 74px;
            font-weight: 950;
            letter-spacing: 0;
          }
          .glasses {
            width: 580px;
            height: 190px;
            position: relative;
          }
          .lens {
            position: absolute;
            width: 220px;
            height: 150px;
            border-radius: 60px;
            background: ${dark};
            border: 8px solid #020617;
          }
          .lens.left { left: 20px; }
          .lens.right { right: 20px; }
          .bridge {
            position: absolute;
            left: 240px;
            top: 58px;
            width: 100px;
            height: 26px;
            border-radius: 999px;
            background: #020617;
          }
          footer {
            font-size: 21px;
            font-weight: 800;
            color: #334155;
          }
        </style>
      </head>
      <body>
        <div class="stage">
          <header>
            <div>
              <h1>${asset.title}</h1>
              <p>${asset.subtitle}</p>
            </div>
            <div class="badge">VALIDATION</div>
          </header>
          <main class="product">
            ${isLogo ? `<div class="logo-mark">${asset.mark}</div>` : isDenim ? `
              <div class="shorts">
                <div class="waist"></div>
                <div class="short-leg left"><div class="pocket"></div><div class="mark">${asset.mark}</div></div>
                <div class="short-leg right"><div class="pocket"></div></div>
                <div class="zipper"></div>
              </div>
            ` : isBottom ? `
              <div class="pants">
                <div class="waist"></div>
                <div class="leg left"><div class="mark">${asset.mark}</div></div>
                <div class="leg right"></div>
              </div>
            ` : isAccessory ? `
              <div class="glasses">
                <div class="lens left"></div>
                <div class="bridge"></div>
                <div class="lens right"></div>
              </div>
            ` : `
              <div class="hoodie${isRaven ? " studs" : ""}">
                <div class="hood"></div>
                <div class="zip"></div>
                <div class="mark">${asset.mark}</div>
              </div>
            `}
          </main>
          <footer>
            <span>Generated test fixture</span>
            <span>${asset.filename}</span>
          </footer>
        </div>
      </body>
    </html>
  `;
}

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });

const manifest = [];
for (const asset of assets) {
  await page.setContent(garmentSvg(asset), { waitUntil: "load" });
  const filePath = path.join(outputDir, asset.filename);
  await page.screenshot({ path: filePath, fullPage: true });
  manifest.push({ ...asset, path: filePath });
}

await browser.close();
await fs.writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Generated ${manifest.length} validation assets in ${outputDir}`);
