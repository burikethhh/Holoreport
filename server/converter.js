const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const JSZip = require('jszip');
const xml2js = require('xml2js');

// ====== PowerPoint COM method (TRUE 1:1 fidelity) ======

async function convertWithPowerPoint(pptxPath, outputDir, id) {
  // In packaged app, the ps1 is unpacked outside the asar
  let scriptPath = path.join(__dirname, 'export-slides.ps1');
  const unpackedPath = scriptPath.replace('app.asar', 'app.asar.unpacked');
  if (fs.existsSync(unpackedPath)) scriptPath = unpackedPath;
  if (!fs.existsSync(scriptPath)) throw new Error('export-slides.ps1 not found');

  const imgDir = path.join(outputDir, 'slides');
  fs.mkdirSync(imgDir, { recursive: true });

  const absPath = path.resolve(pptxPath);
  const absImgDir = path.resolve(imgDir);

  // Run PowerShell script to export slides via PowerPoint COM
  const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -PptxPath "${absPath}" -OutputDir "${absImgDir}"`;
  const output = execSync(cmd, { timeout: 120000, encoding: 'utf-8' });

  // Parse the JSON output from the script
  const jsonLine = output.trim().split('\n').pop().trim();
  let meta;
  try {
    meta = JSON.parse(jsonLine);
  } catch {
    throw new Error('PowerPoint export produced no valid output');
  }

  // Collect generated slide PNGs
  const slideFiles = fs.readdirSync(imgDir)
    .filter(f => /^slide_\d+\.png$/i.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

  if (slideFiles.length === 0) throw new Error('PowerPoint produced no slide images');

  const slides = slideFiles.map((img, i) => ({
    slideNumber: i + 1,
    image: `/output/${id}/slides/${img}`,
    type: 'image'
  }));

  return { slideCount: slides.length, slides, method: 'powerpoint' };
}

// ====== LibreOffice method (good fidelity fallback) ======

async function convertWithLibreOffice(pptxPath, outputDir, id) {
  const soffice = findLibreOffice();
  if (!soffice) throw new Error('LibreOffice not found');

  const imgDir = path.join(outputDir, 'slides');
  fs.mkdirSync(imgDir, { recursive: true });

  const htmlDir = path.join(outputDir, '_html');
  fs.mkdirSync(htmlDir, { recursive: true });

  execSync(`"${soffice}" --headless --convert-to html --outdir "${htmlDir}" "${pptxPath}"`, {
    timeout: 120000
  });

  const slideImages = fs.readdirSync(htmlDir)
    .filter(f => /\.(png|jpg|jpeg|gif)$/i.test(f))
    .sort();

  const slides = slideImages.map((img, i) => {
    const dest = path.join(imgDir, `slide_${i + 1}.png`);
    fs.copyFileSync(path.join(htmlDir, img), dest);
    return {
      slideNumber: i + 1,
      image: `/output/${id}/slides/slide_${i + 1}.png`,
      type: 'image'
    };
  });

  return { slideCount: slides.length, slides, method: 'libreoffice' };
}

function findLibreOffice() {
  const paths = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    '/usr/bin/soffice', '/usr/bin/libreoffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice'
  ];
  for (const p of paths) { if (fs.existsSync(p)) return p; }
  try { execSync('soffice --version', { stdio: 'ignore' }); return 'soffice'; } catch { return null; }
}

// ====== XML Parser method (faithful layout) ======

async function convertWithParser(pptxPath, outputDir, id) {
  const zipBuf = fs.readFileSync(pptxPath);
  const zip = await JSZip.loadAsync(zipBuf);
  const parser = new xml2js.Parser({ explicitArray: true, ignoreAttrs: false });

  const imgDir = path.join(outputDir, 'slides');
  fs.mkdirSync(imgDir, { recursive: true });

  // Extract media files
  const mediaFiles = Object.keys(zip.files).filter(f => f.startsWith('ppt/media/'));
  for (const mf of mediaFiles) {
    const data = await zip.files[mf].async('nodebuffer');
    fs.writeFileSync(path.join(imgDir, path.basename(mf)), data);
  }

  // Get slide dimensions from presentation.xml
  let slideWidth = 960;  // default 10 inches
  let slideHeight = 540; // default 7.5 inches
  if (zip.files['ppt/presentation.xml']) {
    const presXml = await zip.files['ppt/presentation.xml'].async('string');
    const presData = await parser.parseStringPromise(presXml);
    const sldSz = presData?.['p:presentation']?.['p:sldSz']?.[0]?.$;
    if (sldSz) {
      slideWidth = emuToPx(sldSz.cx);
      slideHeight = emuToPx(sldSz.cy);
    }
  }

  // Parse slide layouts for default placeholder positions
  const layoutCache = {};
  async function getSlideLayout(slideNum) {
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    if (!zip.files[relsPath]) return null;
    const relsXml = await zip.files[relsPath].async('string');
    const relsData = await parser.parseStringPromise(relsXml);
    const rels = relsData?.Relationships?.Relationship;
    const relArr = Array.isArray(rels) ? rels : (rels ? [rels] : []);
    for (const r of relArr) {
      if (r.$.Target && r.$.Target.includes('slideLayout')) {
        const layoutFile = 'ppt/slideLayouts/' + path.basename(r.$.Target);
        if (layoutCache[layoutFile]) return layoutCache[layoutFile];
        if (zip.files[layoutFile]) {
          const lxml = await zip.files[layoutFile].async('string');
          const ldata = await parser.parseStringPromise(lxml);
          layoutCache[layoutFile] = ldata;
          return ldata;
        }
      }
    }
    return null;
  }

  // Parse theme colors
  let themeColors = {};
  const themeFiles = Object.keys(zip.files).filter(f => /^ppt\/theme\/theme\d+\.xml$/.test(f));
  if (themeFiles.length > 0) {
    const themeXml = await zip.files[themeFiles[0]].async('string');
    const themeData = await parser.parseStringPromise(themeXml);
    themeColors = extractThemeColors(themeData);
  }

  // Get slide rels (for image references)
  async function getSlideRels(slideNum) {
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    const rels = {};
    if (zip.files[relsPath]) {
      const relsXml = await zip.files[relsPath].async('string');
      const relsData = await parser.parseStringPromise(relsXml);
      const relList = relsData?.Relationships?.Relationship;
      const arr = Array.isArray(relList) ? relList : (relList ? [relList] : []);
      for (const r of arr) {
        if (r.$.Target && r.$.Target.includes('media/')) {
          rels[r.$.Id] = path.basename(r.$.Target);
        }
      }
    }
    return rels;
  }

  // Find slide files
  const slideFiles = Object.keys(zip.files)
    .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => parseInt(a.match(/slide(\d+)/)[1]) - parseInt(b.match(/slide(\d+)/)[1]));

  const slides = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async('string');
    const data = await parser.parseStringPromise(xml);
    const num = i + 1;
    const rels = await getSlideRels(num);
    const layout = await getSlideLayout(num);

    const slide = {
      slideNumber: num,
      width: slideWidth,
      height: slideHeight,
      elements: [],
      background: null,
      type: 'parsed'
    };

    // Extract background
    slide.background = extractBackground(data, rels, id, themeColors);

    // If no slide bg, check layout bg
    if (!slide.background && layout) {
      slide.background = extractBackground(layout, rels, id, themeColors);
    }

    // Extract shapes (text boxes, images, shapes) from spTree
    const cSld = data?.['p:sld']?.['p:cSld'];
    if (cSld) {
      const cSldArr = Array.isArray(cSld) ? cSld : [cSld];
      for (const c of cSldArr) {
        const spTree = c['p:spTree'];
        if (spTree) {
          const spTreeArr = Array.isArray(spTree) ? spTree : [spTree];
          for (const tree of spTreeArr) {
            extractShapes(tree, slide, rels, id, themeColors);
          }
        }
      }
    }

    slides.push(slide);
  }

  return { slideCount: slides.length, slides, method: 'parser', slideWidth, slideHeight };
}

// ====== Extract shapes from spTree ======

function extractShapes(tree, slide, rels, presId, themeColors) {
  // Normal shapes (p:sp)
  const shapes = tree['p:sp'];
  if (shapes) {
    const arr = Array.isArray(shapes) ? shapes : [shapes];
    for (const sp of arr) {
      const el = parseShape(sp, rels, presId, themeColors);
      if (el) slide.elements.push(el);
    }
  }

  // Picture shapes (p:pic)
  const pics = tree['p:pic'];
  if (pics) {
    const arr = Array.isArray(pics) ? pics : [pics];
    for (const pic of arr) {
      const el = parsePicture(pic, rels, presId);
      if (el) slide.elements.push(el);
    }
  }

  // Group shapes (p:grpSp) — recurse
  const groups = tree['p:grpSp'];
  if (groups) {
    const arr = Array.isArray(groups) ? groups : [groups];
    for (const grp of arr) {
      extractShapes(grp, slide, rels, presId, themeColors);
    }
  }

  // Connection shapes (p:cxnSp)
  const cxns = tree['p:cxnSp'];
  if (cxns) {
    const arr = Array.isArray(cxns) ? cxns : [cxns];
    for (const cxn of arr) {
      const el = parseConnector(cxn, themeColors);
      if (el) slide.elements.push(el);
    }
  }
}

// ====== Parse a shape (text box / auto-shape) ======

function parseShape(sp, rels, presId, themeColors) {
  const pos = getPosition(sp);
  if (!pos) return null;

  const el = {
    type: 'shape',
    x: pos.x,
    y: pos.y,
    w: pos.w,
    h: pos.h,
    rotation: pos.rot,
    paragraphs: [],
    fill: null,
    border: null,
    shapeType: null
  };

  // Shape preset geometry (rect, roundRect, ellipse, etc.)
  const prstGeom = deepFind(sp, 'a:prstGeom');
  if (prstGeom?.$?.prst) {
    el.shapeType = prstGeom.$.prst;
  }

  // Shape fill
  el.fill = extractFill(sp?.['p:spPr'] || sp, themeColors, rels, presId);

  // Shape border/outline
  const ln = deepFind(sp, 'a:ln');
  if (ln) {
    el.border = extractLineStyle(ln, themeColors);
  }

  // Text body
  const txBody = sp['p:txBody'];
  if (txBody) {
    const bodyArr = Array.isArray(txBody) ? txBody : [txBody];
    for (const body of bodyArr) {
      el.paragraphs = extractParagraphs(body, themeColors);
      // Text body properties (vertical alignment, etc.)
      const bodyPr = body['a:bodyPr'];
      if (bodyPr) {
        const bpArr = Array.isArray(bodyPr) ? bodyPr : [bodyPr];
        if (bpArr[0]?.$) {
          el.vertAlign = bpArr[0].$.anchor; // t, ctr, b
          el.textWrap = bpArr[0].$.wrap;
          const lIns = bpArr[0].$.lIns;
          const tIns = bpArr[0].$.tIns;
          const rIns = bpArr[0].$.rIns;
          const bIns = bpArr[0].$.bIns;
          if (lIns !== undefined) el.padLeft = emuToPx(lIns);
          if (tIns !== undefined) el.padTop = emuToPx(tIns);
          if (rIns !== undefined) el.padRight = emuToPx(rIns);
          if (bIns !== undefined) el.padBottom = emuToPx(bIns);
        }
      }
    }
  }

  // Check if there's a blipFill inside (image inside shape)
  const blipFill = deepFind(sp, 'a:blip');
  if (blipFill?.$?.['r:embed']) {
    const embedId = blipFill.$['r:embed'];
    if (embedId && rels[embedId]) {
      el.image = `/output/${presId}/slides/${rels[embedId]}`;
      el.type = 'image';
    }
  }

  return el;
}

// ====== Parse a picture (p:pic) ======

function parsePicture(pic, rels, presId) {
  const pos = getPosition(pic);
  if (!pos) return null;

  const el = {
    type: 'image',
    x: pos.x,
    y: pos.y,
    w: pos.w,
    h: pos.h,
    rotation: pos.rot,
    image: null
  };

  // Get image reference from blipFill
  const blipFill = pic['p:blipFill'];
  if (blipFill) {
    const bfArr = Array.isArray(blipFill) ? blipFill : [blipFill];
    for (const bf of bfArr) {
      const blip = bf['a:blip'];
      if (blip) {
        const blipArr = Array.isArray(blip) ? blip : [blip];
        if (blipArr[0]?.$?.['r:embed']) {
          const embedId = blipArr[0].$['r:embed'];
          if (rels[embedId]) {
            el.image = `/output/${presId}/slides/${rels[embedId]}`;
          }
        }
      }
    }
  }

  if (!el.image) return null;
  return el;
}

// ====== Parse connector ======

function parseConnector(cxn, themeColors) {
  const pos = getPosition(cxn);
  if (!pos) return null;

  const el = {
    type: 'connector',
    x: pos.x,
    y: pos.y,
    w: pos.w,
    h: pos.h,
    rotation: pos.rot,
    border: null
  };

  const ln = deepFind(cxn, 'a:ln');
  if (ln) el.border = extractLineStyle(ln, themeColors);

  return el;
}

// ====== Position extraction ======

function getPosition(node) {
  // Look for spPr > a:xfrm > a:off + a:ext
  const spPr = node?.['p:spPr'] || node?.['p:grpSpPr'] || node?.['p:cxnSpPr'];
  if (!spPr) return null;

  const spPrArr = Array.isArray(spPr) ? spPr : [spPr];
  for (const sp of spPrArr) {
    const xfrm = sp['a:xfrm'];
    if (!xfrm) continue;
    const xfrmArr = Array.isArray(xfrm) ? xfrm : [xfrm];
    for (const xf of xfrmArr) {
      const off = xf['a:off'];
      const ext = xf['a:ext'];
      if (!off || !ext) continue;
      const offArr = Array.isArray(off) ? off : [off];
      const extArr = Array.isArray(ext) ? ext : [ext];
      if (offArr[0]?.$ && extArr[0]?.$) {
        const rot = xf.$?.rot ? parseInt(xf.$.rot) / 60000 : 0; // 60000ths of degree
        return {
          x: emuToPx(offArr[0].$.x),
          y: emuToPx(offArr[0].$.y),
          w: emuToPx(extArr[0].$.cx),
          h: emuToPx(extArr[0].$.cy),
          rot
        };
      }
    }
  }
  return null;
}

// ====== Extract paragraphs with runs ======

function extractParagraphs(txBody, themeColors) {
  const paragraphs = [];
  const paras = txBody['a:p'];
  if (!paras) return paragraphs;

  const paraArr = Array.isArray(paras) ? paras : [paras];
  for (const p of paraArr) {
    const para = { runs: [], align: 'left', lineSpacing: null, spaceBefore: 0, spaceAfter: 0, bulletChar: null, indent: 0 };

    // Paragraph properties
    const pPr = p['a:pPr'];
    if (pPr) {
      const prArr = Array.isArray(pPr) ? pPr : [pPr];
      const pr = prArr[0];
      if (pr?.$) {
        if (pr.$.algn === 'ctr') para.align = 'center';
        else if (pr.$.algn === 'r') para.align = 'right';
        else if (pr.$.algn === 'just') para.align = 'justify';
        if (pr.$.indent) para.indent = emuToPx(pr.$.indent);
        if (pr.$.marL) para.marginLeft = emuToPx(pr.$.marL);
      }
      // Line spacing
      if (pr?.['a:lnSpc']?.[0]?.['a:spcPct']?.[0]?.$?.val) {
        para.lineSpacing = parseInt(pr['a:lnSpc'][0]['a:spcPct'][0].$.val) / 1000;
      }
      // Space before
      if (pr?.['a:spcBef']?.[0]?.['a:spcPts']?.[0]?.$?.val) {
        para.spaceBefore = parseInt(pr['a:spcBef'][0]['a:spcPts'][0].$.val) / 100;
      }
      // Bullets
      if (pr?.['a:buChar']?.[0]?.$?.char) {
        para.bulletChar = pr['a:buChar'][0].$.char;
      } else if (pr?.['a:buAutoNum']) {
        para.bulletChar = '•'; // auto-numbered, approximate
      }
    }

    // Runs
    const runs = p['a:r'];
    if (runs) {
      const runArr = Array.isArray(runs) ? runs : [runs];
      for (const r of runArr) {
        const run = { text: '', fontSize: null, bold: false, italic: false, underline: false, color: null, fontFamily: null };

        // Text
        const t = r['a:t'];
        if (t) {
          const tArr = Array.isArray(t) ? t : [t];
          run.text = tArr.map(tx => typeof tx === 'string' ? tx : (tx?._ || '')).join('');
        }

        // Run properties
        const rPr = r['a:rPr'];
        if (rPr) {
          const rpArr = Array.isArray(rPr) ? rPr : [rPr];
          const rp = rpArr[0];
          if (rp?.$) {
            if (rp.$.sz) run.fontSize = parseInt(rp.$.sz) / 100;
            if (rp.$.b === '1') run.bold = true;
            if (rp.$.i === '1') run.italic = true;
            if (rp.$.u && rp.$.u !== 'none') run.underline = true;
          }
          // Color
          run.color = extractColor(rp, themeColors);
          // Font
          if (rp?.['a:latin']) {
            const lat = Array.isArray(rp['a:latin']) ? rp['a:latin'][0] : rp['a:latin'];
            if (lat?.$?.typeface) run.fontFamily = lat.$.typeface;
          }
        }

        if (run.text) para.runs.push(run);
      }
    }

    // Field runs (e.g. slide numbers, dates)
    const flds = p['a:fld'];
    if (flds) {
      const fldArr = Array.isArray(flds) ? flds : [flds];
      for (const fld of fldArr) {
        const t = fld['a:t'];
        if (t) {
          const tArr = Array.isArray(t) ? t : [t];
          const text = tArr.map(tx => typeof tx === 'string' ? tx : (tx?._ || '')).join('');
          if (text.trim()) para.runs.push({ text, fontSize: null, bold: false, italic: false, underline: false, color: null, fontFamily: null });
        }
      }
    }

    if (para.runs.length > 0) paragraphs.push(para);
  }

  return paragraphs;
}

// ====== Color extraction ======

function extractColor(node, themeColors) {
  if (!node) return null;

  // Direct RGB color
  const solid = node['a:solidFill'];
  if (solid) {
    const sfArr = Array.isArray(solid) ? solid : [solid];
    const sf = sfArr[0];
    if (sf?.['a:srgbClr']) {
      const c = Array.isArray(sf['a:srgbClr']) ? sf['a:srgbClr'][0] : sf['a:srgbClr'];
      if (c?.$?.val) return '#' + c.$.val;
    }
    if (sf?.['a:schemeClr']) {
      const c = Array.isArray(sf['a:schemeClr']) ? sf['a:schemeClr'][0] : sf['a:schemeClr'];
      if (c?.$?.val && themeColors[c.$.val]) return themeColors[c.$.val];
    }
  }
  return null;
}

// ====== Fill extraction (for shapes and backgrounds) ======

function extractFill(node, themeColors, rels, presId) {
  if (!node) return null;

  // Check inside spPr arrays
  const spPr = node['p:spPr'] || node;
  const spArr = Array.isArray(spPr) ? spPr : [spPr];

  for (const sp of spArr) {
    // Solid fill
    if (sp['a:solidFill']) {
      const color = extractColor({ 'a:solidFill': sp['a:solidFill'] }, themeColors);
      if (color) return { type: 'solid', color };
    }

    // Gradient fill
    if (sp['a:gradFill']) {
      const grad = Array.isArray(sp['a:gradFill']) ? sp['a:gradFill'][0] : sp['a:gradFill'];
      const stops = [];
      const gsLst = grad?.['a:gsLst'];
      if (gsLst) {
        const gsLstArr = Array.isArray(gsLst) ? gsLst : [gsLst];
        const gs = gsLstArr[0]?.['a:gs'];
        if (gs) {
          const gsArr = Array.isArray(gs) ? gs : [gs];
          for (const stop of gsArr) {
            const pos = stop.$?.pos ? parseInt(stop.$.pos) / 1000 : 0;
            const color = extractColor(stop, themeColors);
            if (color) stops.push({ pos, color });
          }
        }
      }
      if (stops.length >= 2) {
        return { type: 'gradient', stops };
      }
    }

    // Image fill
    if (sp['a:blipFill']) {
      const bf = Array.isArray(sp['a:blipFill']) ? sp['a:blipFill'][0] : sp['a:blipFill'];
      const blip = bf?.['a:blip'];
      if (blip) {
        const blipArr = Array.isArray(blip) ? blip : [blip];
        const embedId = blipArr[0]?.$?.['r:embed'];
        if (embedId && rels && rels[embedId]) {
          return { type: 'image', src: `/output/${presId}/slides/${rels[embedId]}` };
        }
      }
    }

    // No fill
    if (sp['a:noFill']) return { type: 'none' };
  }

  return null;
}

// ====== Background extraction ======

function extractBackground(data, rels, presId, themeColors) {
  const root = data?.['p:sld'] || data?.['p:sldLayout'] || data?.['p:sldMaster'];
  if (!root) return null;

  const rootArr = Array.isArray(root) ? root : [root];
  for (const r of rootArr) {
    const cSld = r['p:cSld'];
    if (!cSld) continue;
    const cSldArr = Array.isArray(cSld) ? cSld : [cSld];
    for (const c of cSldArr) {
      const bg = c['p:bg'];
      if (!bg) continue;
      const bgArr = Array.isArray(bg) ? bg : [bg];
      for (const b of bgArr) {
        // bgPr
        const bgPr = b['p:bgPr'];
        if (bgPr) {
          const bpArr = Array.isArray(bgPr) ? bgPr : [bgPr];
          const fill = extractFill({ 'a:solidFill': bpArr[0]?.['a:solidFill'], 'a:gradFill': bpArr[0]?.['a:gradFill'], 'a:blipFill': bpArr[0]?.['a:blipFill'] }, themeColors, rels, presId);
          if (fill) return fill;
        }
        // bgRef
        const bgRef = b['p:bgRef'];
        if (bgRef) {
          const brArr = Array.isArray(bgRef) ? bgRef : [bgRef];
          const color = extractColor(brArr[0], themeColors);
          if (color) return { type: 'solid', color };
        }
      }
    }
  }
  return null;
}

// ====== Line/border style ======

function extractLineStyle(ln, themeColors) {
  if (!ln) return null;
  const lnArr = Array.isArray(ln) ? ln : [ln];
  const l = lnArr[0];
  const style = { width: 1, color: '#000000', dash: 'solid' };

  if (l?.$?.w) style.width = Math.max(1, emuToPx(l.$.w));

  const color = extractColor(l, themeColors);
  if (color) style.color = color;

  if (l?.['a:noFill']) return null; // no border

  return style;
}

// ====== Theme color extraction ======

function extractThemeColors(themeData) {
  const colors = {};
  try {
    const theme = themeData?.['a:theme'];
    if (!theme) return colors;
    const tArr = Array.isArray(theme) ? theme : [theme];
    const themeEls = tArr[0]?.['a:themeElements'];
    if (!themeEls) return colors;
    const teArr = Array.isArray(themeEls) ? themeEls : [themeEls];
    const clrScheme = teArr[0]?.['a:clrScheme'];
    if (!clrScheme) return colors;
    const csArr = Array.isArray(clrScheme) ? clrScheme : [clrScheme];
    const cs = csArr[0];

    const mapping = {
      'dk1': 'dk1', 'dk2': 'dk2', 'lt1': 'lt1', 'lt2': 'lt2',
      'accent1': 'accent1', 'accent2': 'accent2', 'accent3': 'accent3',
      'accent4': 'accent4', 'accent5': 'accent5', 'accent6': 'accent6',
      'hlink': 'hlink', 'folHlink': 'folHlink'
    };

    for (const [xmlKey, schemeKey] of Object.entries(mapping)) {
      const node = cs?.[`a:${xmlKey}`];
      if (node) {
        const nArr = Array.isArray(node) ? node : [node];
        const n = nArr[0];
        if (n?.['a:srgbClr']) {
          const c = Array.isArray(n['a:srgbClr']) ? n['a:srgbClr'][0] : n['a:srgbClr'];
          if (c?.$?.val) colors[schemeKey] = '#' + c.$.val;
        } else if (n?.['a:sysClr']) {
          const c = Array.isArray(n['a:sysClr']) ? n['a:sysClr'][0] : n['a:sysClr'];
          if (c?.$?.lastClr) colors[schemeKey] = '#' + c.$.lastClr;
        }
      }
    }

    // Common aliases
    colors['tx1'] = colors['dk1'];
    colors['tx2'] = colors['dk2'];
    colors['bg1'] = colors['lt1'];
    colors['bg2'] = colors['lt2'];
  } catch {}
  return colors;
}

// ====== Utility ======

// EMU (English Metric Units) to pixels: 1 inch = 914400 EMU, 96 px/inch
function emuToPx(emu) {
  return Math.round(parseInt(emu, 10) / 914400 * 96);
}

function deepFind(obj, key) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj[key]) {
    const arr = Array.isArray(obj[key]) ? obj[key] : [obj[key]];
    return arr[0];
  }
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] === 'object') {
      const items = Array.isArray(obj[k]) ? obj[k] : [obj[k]];
      for (const item of items) {
        const result = deepFind(item, key);
        if (result) return result;
      }
    }
  }
  return null;
}

module.exports = { convertWithPowerPoint, convertWithLibreOffice, convertWithParser };
