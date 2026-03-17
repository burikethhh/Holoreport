(function () {
  'use strict';

  // ===== KILL SWITCH =====
  const KILLSWITCH_URL = 'https://landing-one-bice.vercel.app/api/killswitch';
  const KILLSWITCH_KEY = 'holoreport_killed';

  function showKillScreen(message) {
    const killEl = document.getElementById('kill-screen');
    const msgEl = document.getElementById('kill-message');
    if (killEl) {
      killEl.classList.remove('hidden');
      if (msgEl && message) msgEl.textContent = message;
    }
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('screen-active'));
  }

  async function checkKillSwitch() {
    try {
      const cached = JSON.parse(localStorage.getItem(KILLSWITCH_KEY) || 'null');
      if (cached && cached.killed) showKillScreen(cached.message);
    } catch {}

    try {
      const resp = await fetch(KILLSWITCH_URL, { cache: 'no-store' });
      if (resp.ok) {
        const data = await resp.json();
        localStorage.setItem(KILLSWITCH_KEY, JSON.stringify(data));
        if (data.killed) {
          showKillScreen(data.message);
        } else {
          const killEl = document.getElementById('kill-screen');
          if (killEl) killEl.classList.add('hidden');
        }
      }
    } catch {}
  }

  checkKillSwitch();
  setInterval(checkKillSwitch, 60000);
  window.addEventListener('online', () => setTimeout(checkKillSwitch, 2000));

  // ===== ANIMATED PARTICLE BACKGROUND =====
  const bgCanvas = document.getElementById('bg-canvas');
  const bgCtx = bgCanvas ? bgCanvas.getContext('2d') : null;
  let particles = [];
  let bgAnimId = null;

  function initBgCanvas() {
    if (!bgCanvas || !bgCtx) return;
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;

    particles = [];
    const count = Math.floor((bgCanvas.width * bgCanvas.height) / 12000);
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * bgCanvas.width,
        y: Math.random() * bgCanvas.height,
        r: Math.random() * 1.5 + 0.5,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        o: Math.random() * 0.4 + 0.1,
      });
    }
    if (!bgAnimId) animateBg();
  }

  function animateBg() {
    if (!bgCtx) return;
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = bgCanvas.width;
      if (p.x > bgCanvas.width) p.x = 0;
      if (p.y < 0) p.y = bgCanvas.height;
      if (p.y > bgCanvas.height) p.y = 0;

      bgCtx.beginPath();
      bgCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      bgCtx.fillStyle = `rgba(74,158,255,${p.o})`;
      bgCtx.fill();
    }

    // Draw connection lines between nearby particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = dx * dx + dy * dy;
        if (dist < 10000) {
          bgCtx.beginPath();
          bgCtx.moveTo(particles[i].x, particles[i].y);
          bgCtx.lineTo(particles[j].x, particles[j].y);
          bgCtx.strokeStyle = `rgba(74,158,255,${0.04 * (1 - dist / 10000)})`;
          bgCtx.lineWidth = 0.5;
          bgCtx.stroke();
        }
      }
    }

    bgAnimId = requestAnimationFrame(animateBg);
  }

  window.addEventListener('resize', () => {
    if (bgCanvas) {
      bgCanvas.width = window.innerWidth;
      bgCanvas.height = window.innerHeight;
    }
  });

  initBgCanvas();

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

  // Sound effects
  const sfxNext = new Audio('sounds/Next.mp3');
  const sfxPrev = new Audio('sounds/Previous.mp3');
  sfxNext.preload = 'auto';
  sfxPrev.preload = 'auto';

  function playSwipeSound(direction) {
    try {
      const sfx = direction === 'next' ? sfxNext : sfxPrev;
      sfx.currentTime = 0;
      sfx.play();
    } catch (_) {}
  }

  // Pointer selector
  const POINTER_COUNT = 11;
  let selectedPointer = 'pointers/pointer1.jpg';

  // User
  let userName = '';

  // ===== DOM HELPERS =====
  const $ = (sel) => document.getElementById(sel);

  // Screen system
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('screen-active'));
    const screen = $(id);
    if (screen) {
      // Small delay for transition to apply after removing others
      requestAnimationFrame(() => screen.classList.add('screen-active'));
    }
    // Hide bg canvas on viewer
    if (bgCanvas) bgCanvas.style.display = id === 'viewer-screen' ? 'none' : '';
  }

  // ===== TOAST SYSTEM (stacking) =====
  const toastContainer = $('toast-container');

  function showNotification(message, type) {
    type = type || 'info';
    if (!toastContainer) return;
    const el = document.createElement('div');
    el.className = 'toast-item toast-' + type;
    el.textContent = message;
    toastContainer.appendChild(el);

    setTimeout(() => {
      el.classList.add('toast-exit');
      setTimeout(() => el.remove(), 250);
    }, 2500);
  }

  // ===== CONFIRM DIALOG =====
  const confirmDialog = $('confirm-dialog');
  const confirmMessage = $('confirm-message');
  const confirmOk = $('confirm-ok');
  const confirmCancel = $('confirm-cancel');
  let confirmResolver = null;

  function showConfirm(message) {
    return new Promise(function (resolve) {
      confirmResolver = resolve;
      if (confirmMessage) confirmMessage.textContent = message;
      if (confirmDialog) confirmDialog.classList.remove('hidden');
    });
  }

  if (confirmOk) confirmOk.addEventListener('click', function () {
    if (confirmDialog) confirmDialog.classList.add('hidden');
    if (confirmResolver) { confirmResolver(true); confirmResolver = null; }
  });
  if (confirmCancel) confirmCancel.addEventListener('click', function () {
    if (confirmDialog) confirmDialog.classList.add('hidden');
    if (confirmResolver) { confirmResolver(false); confirmResolver = null; }
  });

  // ===== DOM REFERENCES =====
  const welcomeScreen = $('welcome-screen');
  const userNameInput = $('user-name-input');
  const nameError = $('name-error');
  const btnContinue = $('btn-continue');
  const userBadge = $('user-badge');
  const uploadUserPill = $('upload-user-pill');

  const uploadScreen = $('upload-screen');
  const viewerScreen = $('viewer-screen');
  const dropZone = $('drop-zone');
  const fileInput = $('file-input');
  const btnBrowse = $('btn-browse');
  const uploadProgress = $('upload-progress');
  const progressRingFill = $('progress-ring-fill');
  const progressPct = $('progress-pct');
  const progressText = $('progress-text');
  const phaseUpload = $('phase-upload');
  const phaseParse = $('phase-parse');
  const phaseRender = $('phase-render');
  const btnBackUpload = $('btn-back-upload');

  const slideArea = $('slide-area');
  const slideContainer = $('slide-container');
  const slideInfo = $('slide-info');
  const slideProgressFill = $('slide-progress-fill');
  const btnPrev = $('btn-prev');
  const btnNext = $('btn-next');
  const btnBack = $('btn-back');
  const btnGesture = $('btn-gesture');
  const btnFullscreen = $('btn-fullscreen');
  const btnOverview = $('btn-overview');
  const btnHelp = $('btn-help');
  const slideNavLeft = $('slide-nav-left');
  const slideNavRight = $('slide-nav-right');

  const cameraBox = $('camera-box');
  const camVideo = $('cam-video');
  const camCanvas = $('cam-canvas');
  const camCtx = camCanvas ? camCanvas.getContext('2d') : null;
  const camClose = $('cam-close');

  const gestureToast = $('gesture-toast');
  const toastIcon = $('toast-icon');
  const toastText = $('toast-text');
  const laserDot = $('laser-dot');
  const btnLaser = $('btn-laser');
  const btnPointer = $('btn-pointer');
  const pointerPanel = $('pointer-panel');

  const overviewPanel = $('overview-panel');
  const overviewGrid = $('overview-grid');
  const overviewClose = $('overview-close');

  const helpOverlay = $('help-overlay');
  const helpClose = $('help-close');

  // ===== POINTER SELECTOR =====
  function initPointerSelector() {
    if (!pointerPanel) return;
    for (let i = 1; i <= POINTER_COUNT; i++) {
      const src = 'pointers/pointer' + i + '.jpg';
      const opt = document.createElement('button');
      opt.className = 'pointer-option' + (i === 1 ? ' selected' : '');
      opt.title = 'Pointer ' + i;
      opt.innerHTML = '<img src="' + src + '" alt="Pointer ' + i + '" draggable="false">';
      opt.addEventListener('click', function () { selectPointer(src, opt); });
      pointerPanel.appendChild(opt);
    }
  }

  function selectPointer(src, optEl) {
    selectedPointer = src;
    if (laserDot) laserDot.style.backgroundImage = "url('" + src + "')";
    if (pointerPanel) pointerPanel.querySelectorAll('.pointer-option').forEach(function (el) { el.classList.remove('selected'); });
    optEl.classList.add('selected');
  }

  if (btnPointer) btnPointer.addEventListener('click', function () {
    if (pointerPanel) pointerPanel.classList.toggle('hidden');
  });

  document.addEventListener('click', function (e) {
    if (pointerPanel && !pointerPanel.contains(e.target) && e.target !== btnPointer) {
      pointerPanel.classList.add('hidden');
    }
  });

  initPointerSelector();

  // ===== WELCOME / NAME INPUT =====
  function validateName(name) {
    var trimmed = name.trim();
    if (!trimmed) return 'Please enter your name.';
    if (trimmed.length < 2) return 'Name must be at least 2 characters.';
    if (trimmed.length > 50) return 'Name must be 50 characters or less.';
    if (!/^[a-zA-Z\s.'\-]+$/.test(trimmed)) return 'Name can only contain letters, spaces, hyphens, apostrophes, and periods.';
    return null;
  }

  function enterApp(name) {
    userName = name.trim();
    localStorage.setItem('holoreport_user', userName);
    if (userBadge) userBadge.textContent = userName;
    if (uploadUserPill) uploadUserPill.textContent = userName;
    showScreen('upload-screen');

    // Register user (fire-and-forget)
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: userName })
    }).catch(function () {});
  }

  if (btnContinue) btnContinue.addEventListener('click', function () {
    var err = validateName(userNameInput.value);
    if (err) {
      if (nameError) { nameError.textContent = err; nameError.classList.remove('hidden'); }
      if (userNameInput) userNameInput.classList.add('input-invalid');
    } else {
      if (nameError) nameError.classList.add('hidden');
      if (userNameInput) userNameInput.classList.remove('input-invalid');
      enterApp(userNameInput.value);
    }
  });

  if (userNameInput) {
    userNameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') btnContinue.click(); });
    userNameInput.addEventListener('input', function () {
      userNameInput.classList.remove('input-invalid');
      if (nameError) nameError.classList.add('hidden');
    });
  }

  // Session restore
  var savedUser = localStorage.getItem('holoreport_user');
  if (savedUser) {
    enterApp(savedUser);
  }

  // ===== UPLOAD =====
  if (btnBackUpload) btnBackUpload.addEventListener('click', function () {
    localStorage.removeItem('holoreport_user');
    userName = '';
    if (userNameInput) userNameInput.value = '';
    showScreen('welcome-screen');
  });

  if (btnBrowse) btnBrowse.addEventListener('click', function (e) {
    e.stopPropagation();
    if (fileInput) fileInput.click();
  });
  if (dropZone) dropZone.addEventListener('click', function () { if (fileInput) fileInput.click(); });
  if (fileInput) fileInput.addEventListener('change', function (e) {
    if (e.target.files[0]) handleUpload(e.target.files[0]);
  });

  if (dropZone) {
    dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]);
    });
  }

  // Ring progress helper
  var RING_CIRC = 264; // 2 * PI * 42
  function setRingProgress(pct) {
    var offset = RING_CIRC - (RING_CIRC * pct / 100);
    if (progressRingFill) progressRingFill.setAttribute('stroke-dashoffset', offset);
    if (progressPct) progressPct.textContent = Math.round(pct) + '%';
  }

  function setPhase(phase) {
    [phaseUpload, phaseParse, phaseRender].forEach(function (el) {
      if (el) { el.classList.remove('active', 'done'); }
    });
    if (phase >= 1 && phaseUpload) phaseUpload.classList.add(phase > 1 ? 'done' : 'active');
    if (phase >= 2 && phaseParse) phaseParse.classList.add(phase > 2 ? 'done' : 'active');
    if (phase >= 3 && phaseRender) phaseRender.classList.add('active');
  }

  async function handleUpload(file) {
    if (!file.name.endsWith('.pptx') && !file.name.endsWith('.ppt')) {
      showNotification('Please upload a .pptx or .ppt file.', 'error');
      return;
    }

    if (dropZone) dropZone.classList.add('hidden');
    if (uploadProgress) uploadProgress.classList.remove('hidden');

    setRingProgress(0);
    setPhase(1);
    if (progressText) progressText.textContent = 'Uploading file...';

    // Animate progress
    var pct = 0;
    var tick = setInterval(function () {
      pct = Math.min(pct + Math.random() * 6, 40);
      setRingProgress(pct);
    }, 200);

    var formData = new FormData();
    formData.append('file', file);
    var parseTick = null;

    try {
      var res = await fetch('/api/upload', { method: 'POST', body: formData });
      clearInterval(tick);

      if (!res.ok) throw new Error('Upload failed');

      // Phase 2: parsing
      setPhase(2);
      if (progressText) progressText.textContent = 'Parsing slides...';
      pct = 50;
      setRingProgress(pct);

      parseTick = setInterval(function () {
        pct = Math.min(pct + Math.random() * 5, 80);
        setRingProgress(pct);
      }, 150);

      var data = await res.json();
      clearInterval(parseTick);
      slides = data.slides;
      currentIndex = 0;

      // Phase 3: preparing viewer
      setPhase(3);
      if (progressText) progressText.textContent = 'Preparing viewer...';
      setRingProgress(95);
      await new Promise(function (r) { setTimeout(r, 400); });
      setRingProgress(100);

      await new Promise(function (r) { setTimeout(r, 300); });
      showViewer();
    } catch (err) {
      clearInterval(tick);
      if (parseTick) clearInterval(parseTick);
      console.error(err);
      if (progressText) progressText.textContent = 'Error processing file. Please try again.';
      showNotification('Upload failed. Please try again.', 'error');
      setTimeout(function () {
        if (dropZone) dropZone.classList.remove('hidden');
        if (uploadProgress) uploadProgress.classList.add('hidden');
        setRingProgress(0);
        if (fileInput) fileInput.value = '';
      }, 2000);
    }
  }

  // ===== VIEWER =====
  function showViewer() {
    showScreen('viewer-screen');
    renderSlide();
    showNotification('Presentation loaded — ' + slides.length + ' slides', 'success');
  }

  function renderSlide() {
    var slide = slides[currentIndex];
    if (!slide) return;

    if (slideInfo) slideInfo.textContent = (currentIndex + 1) + ' / ' + slides.length;

    // Update progress bar
    if (slideProgressFill) {
      slideProgressFill.style.width = ((currentIndex + 1) / slides.length * 100) + '%';
    }

    // Transition
    if (slideContainer) {
      slideContainer.className = '';
      slideContainer.classList.add('slide-enter');
      slideContainer.innerHTML = '';
    }

    if (slide.type === 'image' && slide.image) {
      var img = document.createElement('img');
      img.className = 'slide-img';
      img.src = slide.image;
      img.alt = 'Slide ' + slide.slideNumber;
      if (slideContainer) slideContainer.appendChild(img);
    } else {
      var wrapper = document.createElement('div');
      wrapper.className = 'parsed-slide';
      var sW = slide.width || 960;
      var sH = slide.height || 540;
      wrapper.style.aspectRatio = sW + ' / ' + sH;

      applyBackground(wrapper, slide.background);

      (slide.elements || []).forEach(function (el) {
        var dom = renderElement(el, sW, sH);
        if (dom) wrapper.appendChild(dom);
      });

      if (!slide.elements || !slide.elements.length) {
        var empty = document.createElement('div');
        empty.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#999;font-size:24px;';
        empty.textContent = 'Slide ' + slide.slideNumber;
        wrapper.appendChild(empty);
      }

      if (slideContainer) slideContainer.appendChild(wrapper);
    }
  }

  function applyBackground(el, bg) {
    if (!bg) { el.style.backgroundColor = '#ffffff'; return; }
    if (bg.type === 'solid') {
      el.style.backgroundColor = bg.color;
    } else if (bg.type === 'gradient' && bg.stops && bg.stops.length >= 2) {
      var stopsCss = bg.stops.map(function (s) { return s.color + ' ' + s.pos + '%'; }).join(', ');
      el.style.background = 'linear-gradient(180deg, ' + stopsCss + ')';
    } else if (bg.type === 'image' && bg.src) {
      el.style.backgroundImage = 'url("' + bg.src + '")';
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
    } else {
      el.style.backgroundColor = '#ffffff';
    }
  }

  function renderElement(el, slideW, slideH) {
    var left = (el.x / slideW * 100).toFixed(4) + '%';
    var top = (el.y / slideH * 100).toFixed(4) + '%';
    var width = (el.w / slideW * 100).toFixed(4) + '%';
    var height = (el.h / slideH * 100).toFixed(4) + '%';

    if (el.type === 'image' && el.image) {
      var img = document.createElement('img');
      img.className = 'slide-el slide-el-img';
      img.src = el.image;
      img.alt = '';
      img.draggable = false;
      img.style.cssText = 'left:' + left + ';top:' + top + ';width:' + width + ';height:' + height + ';';
      if (el.rotation) img.style.transform = 'rotate(' + el.rotation + 'deg)';
      return img;
    }

    if (el.type === 'shape') {
      var div = document.createElement('div');
      div.className = 'slide-el slide-el-shape';
      div.style.cssText = 'left:' + left + ';top:' + top + ';width:' + width + ';height:' + height + ';';
      if (el.rotation) div.style.transform = 'rotate(' + el.rotation + 'deg)';

      if (el.fill) {
        if (el.fill.type === 'solid') div.style.backgroundColor = el.fill.color;
        else if (el.fill.type === 'gradient' && el.fill.stops && el.fill.stops.length >= 2) {
          var stopsCss = el.fill.stops.map(function (s) { return s.color + ' ' + s.pos + '%'; }).join(', ');
          div.style.background = 'linear-gradient(180deg, ' + stopsCss + ')';
        } else if (el.fill.type === 'image' && el.fill.src) {
          div.style.backgroundImage = 'url("' + el.fill.src + '")';
          div.style.backgroundSize = 'cover';
        }
      }

      if (el.border) div.style.border = el.border.width + 'px solid ' + el.border.color;
      if (el.shapeType === 'roundRect') div.style.borderRadius = '8px';
      else if (el.shapeType === 'ellipse') div.style.borderRadius = '50%';

      if (el.vertAlign === 'ctr') {
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.style.justifyContent = 'center';
      } else if (el.vertAlign === 'b') {
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.style.justifyContent = 'flex-end';
      }

      if (el.padLeft !== undefined) div.style.paddingLeft = el.padLeft + 'px';
      if (el.padTop !== undefined) div.style.paddingTop = el.padTop + 'px';
      if (el.padRight !== undefined) div.style.paddingRight = el.padRight + 'px';
      if (el.padBottom !== undefined) div.style.paddingBottom = el.padBottom + 'px';

      (el.paragraphs || []).forEach(function (para) {
        var pEl = document.createElement('div');
        pEl.className = 'slide-para';
        pEl.style.textAlign = para.align || 'left';
        if (para.lineSpacing) pEl.style.lineHeight = (para.lineSpacing / 100).toFixed(2);
        if (para.spaceBefore) pEl.style.marginTop = para.spaceBefore + 'pt';
        if (para.marginLeft) pEl.style.paddingLeft = para.marginLeft + 'px';

        if (para.bulletChar) {
          var bullet = document.createElement('span');
          bullet.className = 'slide-bullet';
          bullet.textContent = para.bulletChar + ' ';
          pEl.appendChild(bullet);
        }

        para.runs.forEach(function (run) {
          var span = document.createElement('span');
          span.className = 'slide-run';
          span.textContent = run.text;
          if (run.fontSize) span.style.fontSize = run.fontSize + 'pt';
          if (run.bold) span.style.fontWeight = 'bold';
          if (run.italic) span.style.fontStyle = 'italic';
          if (run.underline) span.style.textDecoration = 'underline';
          if (run.color) span.style.color = run.color;
          if (run.fontFamily) span.style.fontFamily = '"' + run.fontFamily + '", sans-serif';
          pEl.appendChild(span);
        });

        div.appendChild(pEl);
      });

      return div;
    }

    if (el.type === 'connector') {
      var cdiv = document.createElement('div');
      cdiv.className = 'slide-el slide-el-connector';
      cdiv.style.cssText = 'left:' + left + ';top:' + top + ';width:' + width + ';height:' + height + ';';
      if (el.border) {
        if (el.w > el.h) cdiv.style.borderBottom = el.border.width + 'px solid ' + el.border.color;
        else cdiv.style.borderLeft = el.border.width + 'px solid ' + el.border.color;
      }
      if (el.rotation) cdiv.style.transform = 'rotate(' + el.rotation + 'deg)';
      return cdiv;
    }

    return null;
  }

  // ===== NAVIGATION =====
  function goNext() {
    if (currentIndex < slides.length - 1) {
      playSwipeSound('next');
      if (slideContainer) slideContainer.className = 'slide-exit-left';
      setTimeout(function () { currentIndex++; renderSlide(); }, 250);
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      playSwipeSound('prev');
      if (slideContainer) slideContainer.className = 'slide-exit-right';
      setTimeout(function () { currentIndex--; renderSlide(); }, 250);
    }
  }

  function goToSlide(index) {
    if (index >= 0 && index < slides.length && index !== currentIndex) {
      playSwipeSound(index > currentIndex ? 'next' : 'prev');
      if (slideContainer) slideContainer.className = index > currentIndex ? 'slide-exit-left' : 'slide-exit-right';
      setTimeout(function () { currentIndex = index; renderSlide(); }, 250);
    }
    closeOverlays();
  }

  // Slide nav arrows
  if (slideNavLeft) slideNavLeft.addEventListener('click', function (e) { e.stopPropagation(); goPrev(); });
  if (slideNavRight) slideNavRight.addEventListener('click', function (e) { e.stopPropagation(); goNext(); });

  // Button controls
  if (btnNext) btnNext.addEventListener('click', goNext);
  if (btnPrev) btnPrev.addEventListener('click', goPrev);

  if (btnBack) btnBack.addEventListener('click', async function () {
    if (slides.length > 0) {
      var leave = await showConfirm('Leave the presentation? Your uploaded slides will be lost.');
      if (!leave) return;
    }
    stopGesture();
    showScreen('upload-screen');
    if (dropZone) dropZone.classList.remove('hidden');
    if (uploadProgress) uploadProgress.classList.add('hidden');
    setRingProgress(0);
    if (fileInput) fileInput.value = '';
    slides = [];
    currentIndex = 0;
  });

  if (btnFullscreen) btnFullscreen.addEventListener('click', function () {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  });

  // ===== SLIDE OVERVIEW =====
  function openOverview() {
    if (!overviewPanel || !overviewGrid) return;
    overviewGrid.innerHTML = '';

    slides.forEach(function (slide, idx) {
      var thumb = document.createElement('div');
      thumb.className = 'overview-thumb' + (idx === currentIndex ? ' active' : '');

      if (slide.type === 'image' && slide.image) {
        var img = document.createElement('img');
        img.src = slide.image;
        img.alt = 'Slide ' + (idx + 1);
        thumb.appendChild(img);
      } else {
        var placeholder = document.createElement('div');
        placeholder.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#1a1a1a;color:#555;font-size:14px;';
        placeholder.textContent = 'Slide ' + (idx + 1);
        thumb.appendChild(placeholder);
      }

      var label = document.createElement('div');
      label.className = 'overview-thumb-label';
      label.textContent = 'Slide ' + (idx + 1);
      thumb.appendChild(label);

      thumb.addEventListener('click', function () { goToSlide(idx); });
      overviewGrid.appendChild(thumb);
    });

    overviewPanel.classList.remove('hidden');
  }

  function closeOverview() {
    if (overviewPanel) overviewPanel.classList.add('hidden');
  }

  if (btnOverview) btnOverview.addEventListener('click', openOverview);
  if (overviewClose) overviewClose.addEventListener('click', closeOverview);

  // ===== HELP OVERLAY =====
  function openHelp() {
    if (helpOverlay) helpOverlay.classList.remove('hidden');
  }
  function closeHelp() {
    if (helpOverlay) helpOverlay.classList.add('hidden');
  }

  if (btnHelp) btnHelp.addEventListener('click', openHelp);
  if (helpClose) helpClose.addEventListener('click', closeHelp);

  // Close overlays on Escape or background click
  function closeOverlays() {
    closeOverview();
    closeHelp();
    if (pointerPanel) pointerPanel.classList.add('hidden');
  }

  if (helpOverlay) helpOverlay.addEventListener('click', function (e) { if (e.target === helpOverlay) closeHelp(); });
  if (overviewPanel) overviewPanel.addEventListener('click', function (e) { if (e.target === overviewPanel) closeOverview(); });

  // ===== KEYBOARD =====
  document.addEventListener('keydown', function (e) {
    // Always handle Escape
    if (e.key === 'Escape') {
      closeOverlays();
      return;
    }

    // Only handle viewer shortcuts when viewer is active
    if (!viewerScreen || !viewerScreen.classList.contains('screen-active')) return;

    // Ignore if an overlay is open
    if ((overviewPanel && !overviewPanel.classList.contains('hidden')) ||
        (helpOverlay && !helpOverlay.classList.contains('hidden'))) {
      if (e.key === 'Escape') closeOverlays();
      return;
    }

    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goNext(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
    else if (e.key === 'Home') { e.preventDefault(); goToSlide(0); }
    else if (e.key === 'End') { e.preventDefault(); goToSlide(slides.length - 1); }
    else if (e.key === 'g' || e.key === 'G') { if (gestureActive) stopGesture(); else startGesture(); }
    else if (e.key === 'l' || e.key === 'L') { if (btnLaser) btnLaser.click(); }
    else if (e.key === 'f' || e.key === 'F') { if (btnFullscreen) btnFullscreen.click(); }
    else if (e.key === 'o' || e.key === 'O') { openOverview(); }
    else if (e.key === '?' || e.key === '/') { openHelp(); }
  });

  // Click on slide area for next/prev
  if (slideArea) slideArea.addEventListener('click', function (e) {
    if (!viewerScreen || !viewerScreen.classList.contains('screen-active')) return;
    // Don't trigger on buttons
    if (e.target.closest('.slide-nav-arrow') || e.target.closest('.tool-btn')) return;
    var rect = slideArea.getBoundingClientRect();
    var x = e.clientX - rect.left;
    if (x > rect.width / 2) goNext(); else goPrev();
  });

  // ===== GESTURE CONTROL =====
  if (btnGesture) btnGesture.addEventListener('click', function () {
    if (gestureActive) stopGesture(); else startGesture();
  });

  if (camClose) camClose.addEventListener('click', function () { stopGesture(); });

  async function startGesture() {
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      if (camVideo) { camVideo.srcObject = stream; await camVideo.play(); }

      if (camCanvas) { camCanvas.width = 640; camCanvas.height = 480; }

      hands = new Hands({ locateFile: function (file) { return 'vendor/mediapipe/' + file; } });
      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
      });
      hands.onResults(onHandResults);

      mediaPipeCamera = new Camera(camVideo, {
        onFrame: async function () {
          if (hands && gestureActive) await hands.send({ image: camVideo });
        },
        width: 640,
        height: 480
      });
      mediaPipeCamera.start();

      gestureActive = true;
      if (cameraBox) cameraBox.classList.remove('hidden');
      if (btnGesture) btnGesture.classList.add('active');
      showNotification('Gesture control enabled', 'success');
    } catch (err) {
      console.error('Camera error:', err);
      showNotification('Could not access camera. Please allow camera permission.', 'error');
    }
  }

  function stopGesture() {
    gestureActive = false;
    laserActive = false;
    if (mediaPipeCamera) { mediaPipeCamera.stop(); mediaPipeCamera = null; }
    if (camVideo && camVideo.srcObject) {
      camVideo.srcObject.getTracks().forEach(function (t) { t.stop(); });
      camVideo.srcObject = null;
    }
    hands = null;
    positionHistory = [];
    if (cameraBox) cameraBox.classList.add('hidden');
    if (btnGesture) btnGesture.classList.remove('active');
    if (btnLaser) btnLaser.classList.remove('active');
    if (laserDot) laserDot.classList.add('hidden');
  }

  // Laser pointer toggle
  if (btnLaser) btnLaser.addEventListener('click', function () {
    if (!gestureActive) {
      startGesture().then(function () {
        laserActive = true;
        if (btnLaser) btnLaser.classList.add('active');
        showGestureToast('🎯', 'Laser Pointer ON');
      });
    } else {
      laserActive = !laserActive;
      if (btnLaser) btnLaser.classList.toggle('active', laserActive);
      if (!laserActive && laserDot) laserDot.classList.add('hidden');
      showGestureToast('🎯', laserActive ? 'Laser Pointer ON' : 'Laser Pointer OFF');
    }
  });

  function isPointingGesture(lm) {
    var indexExtended = lm[8].y < lm[6].y;
    var middleCurled = lm[12].y > lm[10].y;
    var ringCurled = lm[16].y > lm[14].y;
    var pinkyCurled = lm[20].y > lm[18].y;
    return indexExtended && middleCurled && ringCurled && pinkyCurled;
  }

  function updateLaserPointer(lm) {
    if (!laserActive) {
      if (laserDot) laserDot.classList.add('hidden');
      return;
    }

    if (isPointingGesture(lm)) {
      var rawX = 1 - lm[8].x;
      var rawY = lm[8].y;

      laserSmooth.x += (rawX - laserSmooth.x) * LASER_SMOOTHING;
      laserSmooth.y += (rawY - laserSmooth.y) * LASER_SMOOTHING;

      if (slideContainer) {
        var slideRect = slideContainer.getBoundingClientRect();
        var dotX = slideRect.left + laserSmooth.x * slideRect.width;
        var dotY = slideRect.top + laserSmooth.y * slideRect.height;

        if (laserDot) {
          laserDot.style.left = dotX + 'px';
          laserDot.style.top = dotY + 'px';
          laserDot.classList.remove('hidden');
        }
      }
    } else {
      if (laserDot) laserDot.classList.add('hidden');
    }
  }

  function onHandResults(results) {
    if (camCtx) camCtx.clearRect(0, 0, camCanvas.width, camCanvas.height);

    if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
      positionHistory = [];
      if (laserDot) laserDot.classList.add('hidden');
      return;
    }

    var lm = results.multiHandLandmarks[0];
    drawHand(lm);
    updateLaserPointer(lm);
    detectSwipe(lm);
  }

  function drawHand(lm) {
    if (!camCtx) return;
    var connections = [
      [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
      [0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],
      [0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]
    ];

    camCtx.strokeStyle = '#4a9eff';
    camCtx.lineWidth = 2;
    connections.forEach(function (pair) {
      camCtx.beginPath();
      camCtx.moveTo(lm[pair[0]].x * camCanvas.width, lm[pair[0]].y * camCanvas.height);
      camCtx.lineTo(lm[pair[1]].x * camCanvas.width, lm[pair[1]].y * camCanvas.height);
      camCtx.stroke();
    });

    lm.forEach(function (p) {
      camCtx.beginPath();
      camCtx.arc(p.x * camCanvas.width, p.y * camCanvas.height, 4, 0, Math.PI * 2);
      camCtx.fillStyle = '#fff';
      camCtx.fill();
    });
  }

  function detectSwipe(lm) {
    var wristX = lm[0].x;
    var now = Date.now();

    positionHistory.push({ x: wristX, t: now });
    if (positionHistory.length > 10) positionHistory.shift();

    if (positionHistory.length < 5) return;
    if (now - lastGestureTime < GESTURE_COOLDOWN) return;

    var oldest = positionHistory[0];
    var newest = positionHistory[positionHistory.length - 1];
    var dx = newest.x - oldest.x;
    var dt = newest.t - oldest.t;

    if (dt < 600 && Math.abs(dx) > SWIPE_THRESHOLD) {
      positionHistory = [];
      lastGestureTime = now;

      if (dx > 0) {
        goPrev();
        showGestureToast('👈', 'Previous');
      } else {
        goNext();
        showGestureToast('👉', 'Next');
      }
    }
  }

  // Gesture toast (center screen, auto-dismiss)
  function showGestureToast(icon, text) {
    if (toastIcon) toastIcon.textContent = icon;
    if (toastText) toastText.textContent = text;
    if (gestureToast) {
      gestureToast.classList.remove('hidden');
      gestureToast.style.animation = 'none';
      void gestureToast.offsetHeight;
      gestureToast.style.animation = '';
      setTimeout(function () { gestureToast.classList.add('hidden'); }, 800);
    }
  }

})();
