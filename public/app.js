(function () {
  'use strict';

  // ===== SVG ICONS =====
  const SVG_ICONS = {
    gesture: '<svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v6M14 10V4a2 2 0 0 0-4 0v7M10 10.5V7a2 2 0 0 0-4 0v9M22 14c0 5-4 8-9 8H9a8 8 0 0 1-6-3"/><path d="M18 11a2 2 0 0 1 4 0v3"/></svg>',
    laser: '<svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/></svg>',
    prev: '<svg class="toast-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    next: '<svg class="toast-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
  };

  function setBtnText(btn, iconKey, label) {
    btn.innerHTML = SVG_ICONS[iconKey] + ' ' + label;
  }

  // ===== STATE =====
  let slides = [];
  let currentIndex = 0;
  let gestureActive = false;
  let hands = null;
  let mediaPipeCamera = null;

  // Gesture tracking
  let positionHistory = [];
  let lastGestureTime = 0;
  const GESTURE_COOLDOWN = 900;
  const SWIPE_THRESHOLD = 0.12;

  // Laser pointer
  let laserActive = false;
  let laserSmooth = { x: 0.5, y: 0.5 };
  const LASER_SMOOTHING = 0.35;

  // Sound effects (MP3)
  const sfxNext = new Audio('sounds/Next.mp3');
  const sfxPrev = new Audio('sounds/Previous.mp3');
  sfxNext.preload = 'auto';
  sfxPrev.preload = 'auto';

  function playSwipeSound(direction) {
    try {
      const sfx = direction === 'next' ? sfxNext : sfxPrev;
      sfx.currentTime = 0;
      sfx.play();
    } catch (_) { /* audio not available */ }
  }

  // Pointer selector
  const POINTER_COUNT = 11;
  let selectedPointer = 'pointers/pointer1.jpg';

  // User
  let userName = '';

  // ===== DOM =====
  const $ = (sel) => document.getElementById(sel);

  const welcomeScreen = $('welcome-screen');
  const userNameInput = $('user-name-input');
  const nameError = $('name-error');
  const btnContinue = $('btn-continue');
  const userBadge = $('user-badge');

  const uploadScreen = $('upload-screen');
  const viewerScreen = $('viewer-screen');
  const dropZone = $('drop-zone');
  const fileInput = $('file-input');
  const btnBrowse = $('btn-browse');
  const uploadProgress = $('upload-progress');
  const progressFill = $('progress-fill');
  const progressText = $('progress-text');

  const slideArea = $('slide-area');
  const slideContainer = $('slide-container');
  const slideInfo = $('slide-info');
  const btnPrev = $('btn-prev');
  const btnNext = $('btn-next');
  const btnBack = $('btn-back');
  const btnGesture = $('btn-gesture');
  const btnFullscreen = $('btn-fullscreen');

  const cameraBox = $('camera-box');
  const camVideo = $('cam-video');
  const camCanvas = $('cam-canvas');
  const camCtx = camCanvas.getContext('2d');

  const gestureToast = $('gesture-toast');
  const toastIcon = $('toast-icon');
  const toastText = $('toast-text');
  const laserDot = $('laser-dot');
  const btnLaser = $('btn-laser');
  const btnPointer = $('btn-pointer');
  const pointerPanel = $('pointer-panel');

  // ===== POINTER SELECTOR =====
  function initPointerSelector() {
    for (let i = 1; i <= POINTER_COUNT; i++) {
      const src = `pointers/pointer${i}.jpg`;
      const opt = document.createElement('button');
      opt.className = 'pointer-option' + (i === 1 ? ' selected' : '');
      opt.title = `Pointer ${i}`;
      opt.innerHTML = `<img src="${src}" alt="Pointer ${i}" draggable="false">`;
      opt.addEventListener('click', () => selectPointer(src, opt));
      pointerPanel.appendChild(opt);
    }
  }

  function selectPointer(src, optEl) {
    selectedPointer = src;
    laserDot.style.backgroundImage = `url('${src}')`;
    pointerPanel.querySelectorAll('.pointer-option').forEach(el => el.classList.remove('selected'));
    optEl.classList.add('selected');
  }

  btnPointer.addEventListener('click', () => {
    pointerPanel.classList.toggle('hidden');
  });

  // Close panel when clicking outside
  document.addEventListener('click', (e) => {
    if (!pointerPanel.contains(e.target) && e.target !== btnPointer) {
      pointerPanel.classList.add('hidden');
    }
  });

  initPointerSelector();

  // ===== WELCOME / NAME INPUT =====
  function validateName(name) {
    const trimmed = name.trim();
    if (!trimmed) return 'Please enter your name.';
    if (trimmed.length < 2) return 'Name must be at least 2 characters.';
    if (trimmed.length > 50) return 'Name must be 50 characters or less.';
    if (!/^[a-zA-Z\s.'-]+$/.test(trimmed)) return 'Name can only contain letters, spaces, hyphens, apostrophes, and periods.';
    return null;
  }

  function enterApp(name) {
    userName = name.trim();
    localStorage.setItem('holoreport_user', userName);
    userBadge.innerHTML = '<svg class="inline-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ' + userName;
    welcomeScreen.classList.add('hidden');
    uploadScreen.classList.remove('hidden');

    // Register user on server (fire-and-forget)
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: userName })
    }).catch(() => {});
  }

  btnContinue.addEventListener('click', () => {
    const err = validateName(userNameInput.value);
    if (err) {
      nameError.textContent = err;
      nameError.classList.remove('hidden');
      userNameInput.classList.add('input-invalid');
    } else {
      nameError.classList.add('hidden');
      userNameInput.classList.remove('input-invalid');
      enterApp(userNameInput.value);
    }
  });

  userNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnContinue.click();
  });

  userNameInput.addEventListener('input', () => {
    userNameInput.classList.remove('input-invalid');
    nameError.classList.add('hidden');
  });

  // Restore session if previously entered
  const savedUser = localStorage.getItem('holoreport_user');
  if (savedUser) {
    enterApp(savedUser);
  }

  // ===== UPLOAD =====
  btnBrowse.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleUpload(e.target.files[0]);
  });

  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]);
  });

  async function handleUpload(file) {
    if (!file.name.endsWith('.pptx') && !file.name.endsWith('.ppt')) {
      alert('Please upload a .pptx or .ppt file.');
      return;
    }

    dropZone.classList.add('hidden');
    uploadProgress.classList.remove('hidden');

    // Animate progress
    let pct = 0;
    const tick = setInterval(() => {
      pct = Math.min(pct + Math.random() * 8, 85);
      progressFill.style.width = pct + '%';
    }, 200);

    const formData = new FormData();
    formData.append('file', file);

    try {
      progressText.textContent = 'Uploading and processing slides...';
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      clearInterval(tick);

      if (!res.ok) throw new Error('Upload failed');

      progressFill.style.width = '100%';
      progressText.textContent = 'Done! Loading viewer...';

      const data = await res.json();
      slides = data.slides;
      currentIndex = 0;

      await new Promise(r => setTimeout(r, 400));
      showViewer();
    } catch (err) {
      clearInterval(tick);
      console.error(err);
      progressText.textContent = 'Error processing file. Please try again.';
      progressFill.style.background = '#ff4444';
      setTimeout(() => {
        dropZone.classList.remove('hidden');
        uploadProgress.classList.add('hidden');
        progressFill.style.width = '0%';
        progressFill.style.background = '';
        fileInput.value = '';
      }, 2000);
    }
  }

  // ===== VIEWER =====
  function showViewer() {
    uploadScreen.classList.add('hidden');
    viewerScreen.classList.remove('hidden');
    renderSlide();
  }

  function renderSlide() {
    const slide = slides[currentIndex];
    if (!slide) return;

    slideInfo.textContent = `Slide ${currentIndex + 1} of ${slides.length}`;

    // Transition
    slideContainer.className = '';
    slideContainer.classList.add(currentIndex >= 0 ? 'slide-enter' : '');

    slideContainer.innerHTML = '';

    if (slide.type === 'image' && slide.image) {
      // LibreOffice output — faithful image
      const img = document.createElement('img');
      img.className = 'slide-img';
      img.src = slide.image;
      img.alt = `Slide ${slide.slideNumber}`;
      slideContainer.appendChild(img);
    } else {
      // Parser output — render positioned elements
      const wrapper = document.createElement('div');
      wrapper.className = 'parsed-slide';

      // Use slide dimensions for aspect ratio
      const sW = slide.width || 960;
      const sH = slide.height || 540;
      wrapper.style.aspectRatio = `${sW} / ${sH}`;

      // Background
      applyBackground(wrapper, slide.background);

      // Elements
      for (const el of (slide.elements || [])) {
        const dom = renderElement(el, sW, sH);
        if (dom) wrapper.appendChild(dom);
      }

      // Fallback if empty
      if (!slide.elements?.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#999;font-size:24px;';
        empty.textContent = `Slide ${slide.slideNumber}`;
        wrapper.appendChild(empty);
      }

      slideContainer.appendChild(wrapper);
    }
  }

  function applyBackground(el, bg) {
    if (!bg) {
      el.style.backgroundColor = '#ffffff';
      return;
    }
    if (bg.type === 'solid') {
      el.style.backgroundColor = bg.color;
    } else if (bg.type === 'gradient' && bg.stops && bg.stops.length >= 2) {
      const stopsCss = bg.stops.map(s => `${s.color} ${s.pos}%`).join(', ');
      el.style.background = `linear-gradient(180deg, ${stopsCss})`;
    } else if (bg.type === 'image' && bg.src) {
      el.style.backgroundImage = `url("${bg.src}")`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
    } else {
      el.style.backgroundColor = '#ffffff';
    }
  }

  function renderElement(el, slideW, slideH) {
    // Convert pixel positions to percentages of the slide
    const left = (el.x / slideW * 100).toFixed(4) + '%';
    const top = (el.y / slideH * 100).toFixed(4) + '%';
    const width = (el.w / slideW * 100).toFixed(4) + '%';
    const height = (el.h / slideH * 100).toFixed(4) + '%';
    // Scale factor: the wrapper fills the viewport width; 
    // font sizes from PPT are in pt — we scale them relative to slide width
    const scaleFactor = 1; // Will be adjusted via CSS transform in the wrapper

    if (el.type === 'image' && el.image) {
      const img = document.createElement('img');
      img.className = 'slide-el slide-el-img';
      img.src = el.image;
      img.alt = '';
      img.draggable = false;
      img.style.cssText = `left:${left};top:${top};width:${width};height:${height};`;
      if (el.rotation) img.style.transform = `rotate(${el.rotation}deg)`;
      return img;
    }

    if (el.type === 'shape') {
      const div = document.createElement('div');
      div.className = 'slide-el slide-el-shape';
      div.style.cssText = `left:${left};top:${top};width:${width};height:${height};`;
      if (el.rotation) div.style.transform = `rotate(${el.rotation}deg)`;

      // Shape fill
      if (el.fill) {
        if (el.fill.type === 'solid') div.style.backgroundColor = el.fill.color;
        else if (el.fill.type === 'gradient' && el.fill.stops?.length >= 2) {
          const stopsCss = el.fill.stops.map(s => `${s.color} ${s.pos}%`).join(', ');
          div.style.background = `linear-gradient(180deg, ${stopsCss})`;
        } else if (el.fill.type === 'image' && el.fill.src) {
          div.style.backgroundImage = `url("${el.fill.src}")`;
          div.style.backgroundSize = 'cover';
        }
      }

      // Shape border
      if (el.border) {
        div.style.border = `${el.border.width}px solid ${el.border.color}`;
      }

      // Shape geometry (round corners for rounded rect, circle for ellipse)
      if (el.shapeType === 'roundRect') div.style.borderRadius = '8px';
      else if (el.shapeType === 'ellipse') div.style.borderRadius = '50%';

      // Vertical alignment for text in shape
      if (el.vertAlign === 'ctr') {
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.style.justifyContent = 'center';
      } else if (el.vertAlign === 'b') {
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.style.justifyContent = 'flex-end';
      }

      // Padding
      if (el.padLeft !== undefined) div.style.paddingLeft = el.padLeft + 'px';
      if (el.padTop !== undefined) div.style.paddingTop = el.padTop + 'px';
      if (el.padRight !== undefined) div.style.paddingRight = el.padRight + 'px';
      if (el.padBottom !== undefined) div.style.paddingBottom = el.padBottom + 'px';

      // Text paragraphs
      for (const para of (el.paragraphs || [])) {
        const pEl = document.createElement('div');
        pEl.className = 'slide-para';
        pEl.style.textAlign = para.align || 'left';
        if (para.lineSpacing) pEl.style.lineHeight = (para.lineSpacing / 100).toFixed(2);
        if (para.spaceBefore) pEl.style.marginTop = para.spaceBefore + 'pt';
        if (para.marginLeft) pEl.style.paddingLeft = para.marginLeft + 'px';

        // Bullet
        if (para.bulletChar) {
          const bullet = document.createElement('span');
          bullet.className = 'slide-bullet';
          bullet.textContent = para.bulletChar + ' ';
          pEl.appendChild(bullet);
        }

        for (const run of para.runs) {
          const span = document.createElement('span');
          span.className = 'slide-run';
          span.textContent = run.text;
          if (run.fontSize) span.style.fontSize = run.fontSize + 'pt';
          if (run.bold) span.style.fontWeight = 'bold';
          if (run.italic) span.style.fontStyle = 'italic';
          if (run.underline) span.style.textDecoration = 'underline';
          if (run.color) span.style.color = run.color;
          if (run.fontFamily) span.style.fontFamily = `"${run.fontFamily}", sans-serif`;
          pEl.appendChild(span);
        }

        div.appendChild(pEl);
      }

      return div;
    }

    if (el.type === 'connector') {
      const div = document.createElement('div');
      div.className = 'slide-el slide-el-connector';
      div.style.cssText = `left:${left};top:${top};width:${width};height:${height};`;
      if (el.border) {
        if (el.w > el.h) {
          div.style.borderBottom = `${el.border.width}px solid ${el.border.color}`;
        } else {
          div.style.borderLeft = `${el.border.width}px solid ${el.border.color}`;
        }
      }
      if (el.rotation) div.style.transform = `rotate(${el.rotation}deg)`;
      return div;
    }

    return null;
  }

  function goNext() {
    if (currentIndex < slides.length - 1) {
      playSwipeSound('next');
      slideContainer.className = 'slide-exit-left';
      setTimeout(() => { currentIndex++; renderSlide(); }, 200);
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      playSwipeSound('prev');
      slideContainer.className = 'slide-exit-right';
      setTimeout(() => { currentIndex--; renderSlide(); }, 200);
    }
  }

  // Button controls
  btnNext.addEventListener('click', goNext);
  btnPrev.addEventListener('click', goPrev);

  btnBack.addEventListener('click', () => {
    stopGesture();
    viewerScreen.classList.add('hidden');
    uploadScreen.classList.remove('hidden');
    dropZone.classList.remove('hidden');
    uploadProgress.classList.add('hidden');
    progressFill.style.width = '0%';
    fileInput.value = '';
    slides = [];
    currentIndex = 0;
  });

  btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  });

  // Keyboard controls
  document.addEventListener('keydown', (e) => {
    if (viewerScreen.classList.contains('hidden')) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goNext(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
  });

  // Click on slide area for next/prev
  slideArea.addEventListener('click', (e) => {
    if (viewerScreen.classList.contains('hidden')) return;
    const rect = slideArea.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x > rect.width / 2) goNext(); else goPrev();
  });

  // ===== GESTURE CONTROL =====
  btnGesture.addEventListener('click', () => {
    if (gestureActive) stopGesture();
    else startGesture();
  });

  async function startGesture() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      camVideo.srcObject = stream;
      await camVideo.play();

      camCanvas.width = 640;
      camCanvas.height = 480;

      hands = new Hands({
        locateFile: (file) => `vendor/mediapipe/${file}`
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
      });

      hands.onResults(onHandResults);

      mediaPipeCamera = new Camera(camVideo, {
        onFrame: async () => {
          if (hands && gestureActive) await hands.send({ image: camVideo });
        },
        width: 640,
        height: 480
      });
      mediaPipeCamera.start();

      gestureActive = true;
      cameraBox.classList.remove('hidden');
      btnGesture.classList.add('active');
      setBtnText(btnGesture, 'gesture', 'Gesture: ON');
    } catch (err) {
      console.error('Camera error:', err);
      alert('Could not access camera. Make sure you allow camera permission.');
    }
  }

  function stopGesture() {
    gestureActive = false;
    laserActive = false;
    if (mediaPipeCamera) { mediaPipeCamera.stop(); mediaPipeCamera = null; }
    if (camVideo.srcObject) {
      camVideo.srcObject.getTracks().forEach(t => t.stop());
      camVideo.srcObject = null;
    }
    hands = null;
    positionHistory = [];
    cameraBox.classList.add('hidden');
    btnGesture.classList.remove('active');
    setBtnText(btnGesture, 'gesture', 'Gesture: OFF');
    btnLaser.classList.remove('active');
    setBtnText(btnLaser, 'laser', 'Laser: OFF');
    laserDot.classList.add('hidden');
  }

  // Laser pointer toggle
  btnLaser.addEventListener('click', () => {
    if (!gestureActive) {
      // Start gesture first if not running
      startGesture().then(() => {
        laserActive = true;
        btnLaser.classList.add('active');
        setBtnText(btnLaser, 'laser', 'Laser: ON');
        showToast(SVG_ICONS.laser, 'Laser Pointer ON');
      });
    } else {
      laserActive = !laserActive;
      btnLaser.classList.toggle('active', laserActive);
      setBtnText(btnLaser, 'laser', laserActive ? 'Laser: ON' : 'Laser: OFF');
      if (!laserActive) laserDot.classList.add('hidden');
      showToast(SVG_ICONS.laser, laserActive ? 'Laser Pointer ON' : 'Laser Pointer OFF');
    }
  });

  // Detect pointing gesture: index finger extended, other fingers curled
  function isPointingGesture(lm) {
    // Finger tip (8) must be above PIP (6) — index finger extended
    const indexExtended = lm[8].y < lm[6].y;
    // Middle finger curled: tip (12) below PIP (10)
    const middleCurled = lm[12].y > lm[10].y;
    // Ring finger curled: tip (16) below PIP (14)
    const ringCurled = lm[16].y > lm[14].y;
    // Pinky curled: tip (20) below PIP (18)
    const pinkyCurled = lm[20].y > lm[18].y;
    return indexExtended && middleCurled && ringCurled && pinkyCurled;
  }

  function updateLaserPointer(lm) {
    if (!laserActive) {
      laserDot.classList.add('hidden');
      return;
    }

    if (isPointingGesture(lm)) {
      // Index fingertip = landmark 8
      // Camera is mirrored, so invert X
      const rawX = 1 - lm[8].x;
      const rawY = lm[8].y;

      // Smooth the position to reduce jitter
      laserSmooth.x += (rawX - laserSmooth.x) * LASER_SMOOTHING;
      laserSmooth.y += (rawY - laserSmooth.y) * LASER_SMOOTHING;

      // Map to slide container bounds
      const slideRect = slideContainer.getBoundingClientRect();
      const dotX = slideRect.left + laserSmooth.x * slideRect.width;
      const dotY = slideRect.top + laserSmooth.y * slideRect.height;

      laserDot.style.left = dotX + 'px';
      laserDot.style.top = dotY + 'px';
      laserDot.classList.remove('hidden');
    } else {
      laserDot.classList.add('hidden');
    }
  }

  function onHandResults(results) {
    camCtx.clearRect(0, 0, camCanvas.width, camCanvas.height);

    if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
      positionHistory = [];
      laserDot.classList.add('hidden');
      return;
    }

    const lm = results.multiHandLandmarks[0];
    drawHand(lm);
    updateLaserPointer(lm);
    detectSwipe(lm);
  }

  function drawHand(lm) {
    // Draw skeleton
    const connections = [
      [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
      [0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],
      [0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]
    ];

    camCtx.strokeStyle = '#4a9eff';
    camCtx.lineWidth = 2;
    for (const [a, b] of connections) {
      camCtx.beginPath();
      camCtx.moveTo(lm[a].x * camCanvas.width, lm[a].y * camCanvas.height);
      camCtx.lineTo(lm[b].x * camCanvas.width, lm[b].y * camCanvas.height);
      camCtx.stroke();
    }

    for (const p of lm) {
      camCtx.beginPath();
      camCtx.arc(p.x * camCanvas.width, p.y * camCanvas.height, 4, 0, Math.PI * 2);
      camCtx.fillStyle = '#fff';
      camCtx.fill();
    }
  }

  function detectSwipe(lm) {
    const wristX = lm[0].x;
    const now = Date.now();

    positionHistory.push({ x: wristX, t: now });
    if (positionHistory.length > 10) positionHistory.shift();

    if (positionHistory.length < 5) return;
    if (now - lastGestureTime < GESTURE_COOLDOWN) return;

    const oldest = positionHistory[0];
    const newest = positionHistory[positionHistory.length - 1];
    const dx = newest.x - oldest.x;
    const dt = newest.t - oldest.t;

    if (dt < 600 && Math.abs(dx) > SWIPE_THRESHOLD) {
      positionHistory = [];
      lastGestureTime = now;

      // Camera is mirrored: positive dx in camera = left in real life = move to previous
      if (dx > 0) {
        goPrev();
        showToast(SVG_ICONS.prev, 'Previous');
      } else {
        goNext();
        showToast(SVG_ICONS.next, 'Next');
      }
    }
  }

  function showToast(iconHtml, text) {
    toastIcon.innerHTML = iconHtml;
    toastText.textContent = text;
    gestureToast.classList.remove('hidden');
    // Reset animation
    gestureToast.style.animation = 'none';
    void gestureToast.offsetHeight;
    gestureToast.style.animation = '';
    setTimeout(() => gestureToast.classList.add('hidden'), 800);
  }

})();
