import * as THREE from "three";

const canvas = document.querySelector("#scene");
const video = document.querySelector("#inputVideo");
const overlay = document.querySelector("#handOverlay");
const overlayCtx = overlay.getContext("2d");
const mpCanvas = document.createElement("canvas");
const mpCtx = mpCanvas.getContext("2d");

const cameraStatus = document.querySelector("#cameraStatus");
const gestureStatus = document.querySelector("#gestureStatus");
const motionStatus = document.querySelector("#motionStatus");
const brandMark = document.querySelector("#brandMark");
const modeButtons = Array.from(document.querySelectorAll(".mode-option"));
const modelTextInput = document.querySelector("#modelText");
const particleCountInput = document.querySelector("#particleCount");
const particleSizeInput = document.querySelector("#particleSize");
const sensitivityInput = document.querySelector("#sensitivity");
const colorThemeInput = document.querySelector("#colorTheme");
const particleCountValue = document.querySelector("#particleCountValue");
const particleSizeValue = document.querySelector("#particleSizeValue");
const sensitivityValue = document.querySelector("#sensitivityValue");
const hud = document.querySelector("#hud");
const collapseButton = document.querySelector("#collapseButton");
const gestureLabels = Array.from(document.querySelectorAll(".gesture-row span"));
const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
const dprCap = isMobile ? 1 : 1;
const renderPixelRatio = Math.min(window.devicePixelRatio, dprCap);

const state = {
  particleCount: Number(particleCountInput.value),
  particleSize: Number(particleSizeInput.value),
  interactionMode: "hand",
  modelText: modelTextInput.value.trim() || "亖孒冇",
  sensitivity: Number(sensitivityInput.value),
  colorTheme: colorThemeInput.value,
  spread: 0.0,
  targetSpread: 0.0,
  shapeMix: 0,
  targetShapeMix: 0,
  rotationY: 0,
  angularVelocity: 0,
  lastPalmX: null,
  lastPalmY: null,
  lastGestureTime: 0,
  mouseDown: false,
  mouseStartX: 0,
  mouseStartY: 0,
  lastMouseX: null,
  lastMouseY: null,
  mouseTargetVelocity: 0,
  targetOffsetX: 0,
  targetOffsetY: 0,
  offsetX: 0,
  offsetY: 0
};

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05070d, 0.035);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, 1.1, 15);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(renderPixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const group = new THREE.Group();
scene.add(group);

const pointGeometry = new THREE.BufferGeometry();
const particleUniforms = {
  uTime: { value: 0 },
  uSpread: { value: state.spread },
  uShapeMix: { value: state.shapeMix },
  uSize: { value: state.particleSize },
  uPixelRatio: { value: renderPixelRatio }
};
const material = new THREE.ShaderMaterial({
  uniforms: particleUniforms,
  vertexShader: `
    attribute vec3 sphereTarget;
    attribute vec3 scatterTarget;
    attribute float phase;
    attribute vec3 color;
    uniform float uTime;
    uniform float uSpread;
    uniform float uShapeMix;
    uniform float uSize;
    uniform float uPixelRatio;
    varying vec3 vColor;

    void main() {
      vec3 formed = mix(position, sphereTarget, uShapeMix);
      vec3 particlePosition = mix(formed, scatterTarget, uSpread);
      float p = phase + uTime * 0.75;
      particlePosition.x += sin(p) * 0.035;
      particlePosition.y += cos(p * 1.3) * 0.035;
      particlePosition.z += sin(p * 1.7) * 0.06;

      vec4 mvPosition = modelViewMatrix * vec4(particlePosition, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      gl_PointSize = clamp(uSize * 1150.0 * uPixelRatio / max(1.0, -mvPosition.z), 1.0, 9.0);
      vColor = color;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;

    void main() {
      vec2 uv = gl_PointCoord - vec2(0.5);
      float alpha = smoothstep(0.5, 0.08, length(uv));
      gl_FragColor = vec4(vColor, alpha * 0.94);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending
});
const points = new THREE.Points(pointGeometry, material);
group.add(points);

const starGeometry = new THREE.BufferGeometry();
const starMaterial = new THREE.PointsMaterial({
  size: 0.018,
  color: 0xc7b98a,
  transparent: true,
  opacity: 0.42,
  depthWrite: false
});
const starPositions = new Float32Array(720);
for (let i = 0; i < starPositions.length; i += 3) {
  starPositions[i] = (Math.random() - 0.5) * 56;
  starPositions[i + 1] = (Math.random() - 0.5) * 34;
  starPositions[i + 2] = -Math.random() * 42 - 2;
}
starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
scene.add(new THREE.Points(starGeometry, starMaterial));

let baseTargets = new Float32Array();
let sphereTargets = new Float32Array();
let scatterTargets = new Float32Array();
let colors = new Float32Array();
let phases = new Float32Array();
let textRebuildTimer = 0;
let particleRebuildTimer = 0;

const hasEmoji = (str) => /\p{Extended_Pictographic}/u.test(str);

function makeLetterTargets(count, rawText) {
  const text = (rawText || "亖孒冇").trim().slice(0, 12) || "亖孒冇";
  const emoji = hasEmoji(text);
  const width = 1200;
  const height = 440;
  const textCanvas = document.createElement("canvas");
  textCanvas.width = width;
  textCanvas.height = height;
  const ctx = textCanvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  const emojiFonts = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Twemoji Mozilla"';
  const textFonts = '"Microsoft YaHei", "PingFang SC", Arial, sans-serif';
  let fontSize = 330;
  do {
    const fonts = emoji ? `${emojiFonts}, ${textFonts}` : textFonts;
    ctx.font = `900 ${fontSize}px ${fonts}`;
    fontSize -= 8;
  } while (ctx.measureText(text).width > width * 0.88 && fontSize > 92);
  ctx.fillText(text, width / 2, height / 2 + 16);

  const image = ctx.getImageData(0, 0, width, height).data;
  let pixels = [];
  const step = emoji ? 2 : 3;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (image[(y * width + x) * 4] > 40) pixels.push([x, y]);
    }
  }

  if (emoji && pixels.length) {
    const gridW = Math.ceil(width / step);
    const gridH = Math.ceil(height / step);
    const grid = new Uint8Array(gridW * gridH);
    for (const [px, py] of pixels) {
      grid[Math.floor(py / step) * gridW + Math.floor(px / step)] = 1;
    }
    // Flood fill from edges to mark exterior, remaining empty cells are interior holes
    const visited = new Uint8Array(gridW * gridH);
    const queue = [];
    const enqueue = (gx, gy) => {
      if (gx < 0 || gx >= gridW || gy < 0 || gy >= gridH) return;
      const idx = gy * gridW + gx;
      if (visited[idx] || grid[idx]) return;
      visited[idx] = 1;
      queue.push(gx, gy);
    };
    for (let gx = 0; gx < gridW; gx++) { enqueue(gx, 0); enqueue(gx, gridH - 1); }
    for (let gy = 1; gy < gridH - 1; gy++) { enqueue(0, gy); enqueue(gridW - 1, gy); }
    while (queue.length) {
      const gy = queue.pop();
      const gx = queue.pop();
      enqueue(gx - 1, gy); enqueue(gx + 1, gy);
      enqueue(gx, gy - 1); enqueue(gx, gy + 1);
    }
    for (let i = 0; i < grid.length; i++) {
      if (!grid[i] && !visited[i]) grid[i] = 1;
    }
    pixels = [];
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        if (grid[gy * gridW + gx]) {
          pixels.push([gx * step, gy * step]);
        }
      }
    }
  }

  if (!pixels.length && text !== "亖孒冇") return makeLetterTargets(count, "亖孒冇");

  const targets = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const [x, y] = pixels[(Math.random() * pixels.length) | 0];
    const jitterX = (Math.random() - 0.5) * 0.08;
    const jitterY = (Math.random() - 0.5) * 0.08;
    targets[i * 3] = (x / width - 0.5) * 11.4 + jitterX;
    targets[i * 3 + 1] = -(y / height - 0.5) * 4.4 + jitterY;
    targets[i * 3 + 2] = (Math.random() - 0.5) * 0.9;
  }
  return targets;
}

function makeSphereTargets(count) {
  const targets = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = Math.PI * 2 * u;
    const phi = Math.acos(2 * v - 1);
    const radius = 3.4 + Math.sin(theta * 6) * 0.28;
    const tube = 0.35 * Math.sin(phi * 8 + theta * 3);
    targets[i * 3] = Math.sin(phi) * Math.cos(theta) * (radius + tube);
    targets[i * 3 + 1] = Math.cos(phi) * (radius * 0.72);
    targets[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * (radius + tube);
  }
  return targets;
}

function makeScatterTargets(count) {
  const targets = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const radius = 6 + Math.random() * 8;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    targets[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
    targets[i * 3 + 1] = Math.cos(phi) * radius * 0.8;
    targets[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
  }
  return targets;
}

function rebuildParticles() {
  const count = state.particleCount;
  baseTargets = makeLetterTargets(count, state.modelText);
  sphereTargets = makeSphereTargets(count);
  scatterTargets = makeScatterTargets(count);
  colors = new Float32Array(count * 3);
  phases = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    phases[i] = Math.random() * Math.PI * 2;
  }
  updateParticleColors(false);

  pointGeometry.setAttribute("position", new THREE.BufferAttribute(baseTargets, 3));
  pointGeometry.setAttribute("sphereTarget", new THREE.BufferAttribute(sphereTargets, 3));
  pointGeometry.setAttribute("scatterTarget", new THREE.BufferAttribute(scatterTargets, 3));
  pointGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  pointGeometry.setAttribute("phase", new THREE.BufferAttribute(phases, 1));
  pointGeometry.computeBoundingSphere();
}

function updateParticleColors(markNeedsUpdate = true) {
  const palettes = {
    khaki: ["#efe3b6", "#c7b98a", "#9faa7d"],
    sage: ["#dce4c7", "#b8c3a3", "#8f9b7b"],
    mist: ["#dce6e8", "#b8c7c9", "#8fa0a2"],
    lavender: ["#e2dce8", "#c5bdcf", "#a29aac"],
    porcelain: ["#f0eadc", "#d3cbbb", "#afa794"]
  };
  const [a, b, c] = palettes[state.colorTheme] || palettes.khaki;
  const colorA = new THREE.Color(a);
  const colorB = new THREE.Color(b);
  const colorC = new THREE.Color(c);
  const split = 0.55;
  const count = state.particleCount;

  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const color = t < split
      ? colorA.clone().lerp(colorB, t / split)
      : colorB.clone().lerp(colorC, (t - split) / (1 - split));
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  if (markNeedsUpdate && pointGeometry.attributes.color) {
    pointGeometry.attributes.color.needsUpdate = true;
  }
}

function updateHudValues() {
  particleCountValue.textContent = String(state.particleCount);
  particleSizeValue.textContent = state.particleSize.toFixed(3);
  sensitivityValue.textContent = state.sensitivity.toFixed(1);
  brandMark.textContent = state.modelText || "亖孒冇";
  particleUniforms.uSize.value = state.particleSize;
}

function updateModeLabels() {
  const labels = state.interactionMode === "mouse"
    ? ["拖拽移动", "点击聚拢", "松开发散"]
    : ["张手发散", "握拳聚拢", "移动定位"];
  gestureLabels.forEach((label, index) => {
    label.textContent = labels[index];
  });
}

collapseButton.addEventListener("click", () => {
  const collapsed = hud.classList.toggle("is-collapsed");
  collapseButton.textContent = collapsed ? "展开" : "收起";
  collapseButton.setAttribute("aria-expanded", String(!collapsed));
});

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    if (!mode || mode === state.interactionMode) return;
    modeButtons.forEach((b) => {
      b.classList.remove("is-active");
      b.setAttribute("aria-checked", "false");
    });
    btn.classList.add("is-active");
    btn.setAttribute("aria-checked", "true");
    state.interactionMode = mode;
    state.lastPalmX = null;
    state.lastPalmY = null;
    state.lastMouseX = null;
    state.lastMouseY = null;
    state.mouseTargetVelocity = 0;
    state.mouseDown = false;
    state.angularVelocity *= 0.35;
    state.targetOffsetX = 0;
    state.targetOffsetY = 0;
    if (mode === "mouse") {
      gestureStatus.textContent = "鼠标模式";
      state.targetSpread = 1.0;
      state.targetShapeMix = 0.55;
    } else {
      gestureStatus.textContent = "等待手势";
      state.targetSpread = 0.0;
      state.targetShapeMix = 0.0;
    }
    updateModeLabels();
  });
});

modelTextInput.addEventListener("input", () => {
  window.clearTimeout(textRebuildTimer);
  const nextText = modelTextInput.value.trim().slice(0, 12) || "亖孒冇";
  state.modelText = nextText;
  updateHudValues();
  textRebuildTimer = window.setTimeout(() => {
    rebuildParticles();
  }, 180);
});

particleCountInput.addEventListener("input", () => {
  window.clearTimeout(particleRebuildTimer);
  state.particleCount = Number(particleCountInput.value);
  updateHudValues();
  particleRebuildTimer = window.setTimeout(() => {
    rebuildParticles();
  }, 140);
});

particleSizeInput.addEventListener("input", () => {
  state.particleSize = Number(particleSizeInput.value);
  updateHudValues();
});

sensitivityInput.addEventListener("input", () => {
  state.sensitivity = Number(sensitivityInput.value);
  updateHudValues();
});

colorThemeInput.addEventListener("change", () => {
  state.colorTheme = colorThemeInput.value;
  updateParticleColors();
});

function classifyGesture(landmarks) {
  const wrist = landmarks[0];
  const fingerTips = [8, 12, 16, 20];
  const fingerPips = [6, 10, 14, 18];
  const fingerMcps = [5, 9, 13, 17];

  let curledCount = 0;
  for (let i = 0; i < 4; i++) {
    const tip = landmarks[fingerTips[i]];
    const pip = landmarks[fingerPips[i]];
    const mcp = landmarks[fingerMcps[i]];
    const tipToMcp = Math.hypot(tip.x - mcp.x, tip.y - mcp.y);
    const pipToMcp = Math.hypot(pip.x - mcp.x, pip.y - mcp.y);
    if (pipToMcp > 0.01 && tipToMcp < pipToMcp * 0.90) {
      curledCount++;
    }
  }

  const openness = fingerTips.reduce((sum, tipIdx, i) => {
    const tip = landmarks[tipIdx];
    const mcp = landmarks[fingerMcps[i]];
    return sum + Math.hypot(tip.x - mcp.x, tip.y - mcp.y, tip.z - mcp.z);
  }, 0) / fingerTips.length;

  const palmX = (wrist.x + landmarks[5].x + landmarks[17].x) / 3;
  const palmY = (wrist.y + landmarks[5].y + landmarks[17].y) / 3;
  return { curledCount, openness, palmX, palmY };
}

function onHandResults(results) {
  resizeOverlay();
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

  if (state.interactionMode !== "hand") {
    state.targetOffsetX = 0;
    state.targetOffsetY = 0;
    return;
  }

  if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
    gestureStatus.textContent = cameraStatus.textContent === "运行中" ? "未检测到手" : "等待摄像头";
    state.targetSpread = 0.0;
    state.targetShapeMix = 0.0;
    state.targetOffsetX = 0;
    state.targetOffsetY = 0;
    state.lastPalmX = null;
    state.lastPalmY = null;
    return;
  }

  const landmarks = results.multiHandLandmarks[0];
  drawHand(landmarks);
  const { curledCount, openness, palmX, palmY } = classifyGesture(landmarks);

  const isFist = curledCount >= 3 && openness < 0.22;
  const isOpen = curledCount <= 1 && openness > 0.12;

  if (isOpen) {
    gestureStatus.textContent = "张手 " + curledCount + "|" + openness.toFixed(2);
    state.targetSpread = 1.0;
    state.targetShapeMix = 0.55;
  } else if (isFist) {
    gestureStatus.textContent = "握拳 " + curledCount + "|" + openness.toFixed(2);
    state.targetSpread = 0.0;
    state.targetShapeMix = 0.0;
  } else {
    gestureStatus.textContent = "半开 " + curledCount + "|" + openness.toFixed(2);
    state.targetSpread = curledCount >= 4 ? 0.0 : 0.3;
    state.targetShapeMix = curledCount >= 4 ? 0.0 : 0.25;
  }

  const maxOffset = 1.6;
  const rawX = (palmX - 0.5) * 4.5 * state.sensitivity;
  const rawY = (0.5 - palmY) * 3.2 * state.sensitivity;
  const dist = Math.hypot(rawX, rawY);
  if (dist > maxOffset) {
    state.targetOffsetX = (rawX / dist) * maxOffset;
    state.targetOffsetY = (rawY / dist) * maxOffset;
  } else {
    state.targetOffsetX = rawX;
    state.targetOffsetY = rawY;
  }

  state.lastPalmX = palmX;
  state.lastPalmY = palmY;
}

function drawHand(landmarks) {
  const links = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]
  ];
  overlayCtx.lineWidth = 3;
  overlayCtx.strokeStyle = "rgba(103, 232, 249, 0.9)";
  overlayCtx.fillStyle = "rgba(255, 255, 255, 0.95)";
  for (const [a, b] of links) {
    overlayCtx.beginPath();
    overlayCtx.moveTo(landmarks[a].x * overlay.width, landmarks[a].y * overlay.height);
    overlayCtx.lineTo(landmarks[b].x * overlay.width, landmarks[b].y * overlay.height);
    overlayCtx.stroke();
  }
  for (const point of landmarks) {
    overlayCtx.beginPath();
    overlayCtx.arc(point.x * overlay.width, point.y * overlay.height, 3.2, 0, Math.PI * 2);
    overlayCtx.fill();
  }
}

function resizeOverlay() {
  const rect = overlay.getBoundingClientRect();
  const overlayDpr = Math.min(window.devicePixelRatio, 2);
  const width = Math.max(1, Math.round(rect.width * overlayDpr));
  const height = Math.max(1, Math.round(rect.height * overlayDpr));
  if (overlay.width !== width || overlay.height !== height) {
    overlay.width = width;
    overlay.height = height;
  }
}

async function startHands() {
  if (!window.Hands) {
    cameraStatus.textContent = "库未加载";
    return;
  }

  cameraStatus.textContent = "加载模型中";

  const hands = new window.Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: isMobile ? 0 : 1,
    minDetectionConfidence: 0.70,
    minTrackingConfidence: 0.55
  });
  hands.onResults(onHandResults);

  const constraints = isMobile ? {
    video: {
      facingMode: "user"
    },
    audio: false
  } : {
    video: {
      width: { ideal: 480 },
      height: { ideal: 360 },
      facingMode: "user"
    },
    audio: false
  };

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    const msg = String(error.message || error);
    if (msg.includes("Requested device not found") || msg.includes("NotFoundError")) {
      cameraStatus.textContent = "未找到摄像头";
    } else if (msg.includes("NotAllowedError") || msg.includes("Permission denied")) {
      cameraStatus.textContent = "权限被拒绝";
    } else if (msg.includes("NotReadableError") || msg.includes("Could not start")) {
      cameraStatus.textContent = "摄像头被占用";
    } else if (window.location.protocol === "file:") {
      cameraStatus.textContent = "需要HTTP服务";
      gestureStatus.textContent = "请用服务器打开";
    } else {
      cameraStatus.textContent = "未授权";
    }
    if (gestureStatus.textContent !== "请用服务器打开") {
      gestureStatus.textContent = "鼠标备用";
    }
    console.warn("摄像头启动失败:", error);
    return;
  }

  video.srcObject = stream;
  try {
    await video.play();
    cameraStatus.textContent = "运行中";
  } catch (playError) {
    console.warn("video.play() 被浏览器拦截，等待用户交互:", playError);
    cameraStatus.textContent = "点击屏幕启动";
    const resumePlay = () => {
      video.play().then(() => {
        cameraStatus.textContent = "运行中";
      }).catch(() => {});
      document.removeEventListener("click", resumePlay);
      document.removeEventListener("touchend", resumePlay);
    };
    document.addEventListener("click", resumePlay);
    document.addEventListener("touchend", resumePlay);
  }

  await new Promise((resolve) => {
    if (video.videoWidth > 0) return resolve();
    const onMeta = () => {
      video.removeEventListener("loadedmetadata", onMeta);
      resolve();
    };
    video.addEventListener("loadedmetadata", onMeta);
    setTimeout(resolve, 3000);
  });

  let handsBusy = false;
  let frameErrors = 0;
  function processFrame() {
    if (video.readyState < 2) {
      requestAnimationFrame(processFrame);
      return;
    }
    if (handsBusy) {
      requestAnimationFrame(processFrame);
      return;
    }
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    if (mpCanvas.width !== vw || mpCanvas.height !== vh) {
      mpCanvas.width = vw;
      mpCanvas.height = vh;
    }
    mpCtx.drawImage(video, 0, 0, vw, vh);
    handsBusy = true;
    hands.send({ image: mpCanvas }).catch((err) => {
      frameErrors++;
      console.warn("MediaPipe send error:", err.message || err);
      if (frameErrors > 20) {
        cameraStatus.textContent = "识别异常";
        gestureStatus.textContent = "请刷新页面";
      }
    }).finally(() => {
      handsBusy = false;
      requestAnimationFrame(processFrame);
    });
  }
  processFrame();
}

canvas.addEventListener("pointerdown", (event) => {
  if (state.interactionMode !== "mouse") return;
  state.mouseDown = true;
  state.mouseStartX = event.clientX;
  state.mouseStartY = event.clientY;
  state.lastMouseX = event.clientX;
  state.lastMouseY = event.clientY;
  state.targetSpread = 0.0;
  state.targetShapeMix = 0.0;
});

window.addEventListener("pointerup", () => {
  if (state.interactionMode !== "mouse" || !state.mouseDown) return;
  state.mouseDown = false;
  state.lastMouseX = null;
  state.lastMouseY = null;
  state.mouseTargetVelocity = 0;
  state.targetSpread = 1.0;
  state.targetShapeMix = 0.55;
  state.targetOffsetX = 0;
  state.targetOffsetY = 0;
});

window.addEventListener("pointermove", (event) => {
  if (state.interactionMode !== "mouse") return;
  state.lastMouseX = event.clientX;
  state.lastMouseY = event.clientY;
  if (state.mouseDown) {
    const dx = event.clientX - state.mouseStartX;
    const dy = event.clientY - state.mouseStartY;
    const maxOffset = 1.6;
    const rawX = dx * 0.012 * state.sensitivity;
    const rawY = -dy * 0.012 * state.sensitivity;
    const dist = Math.hypot(rawX, rawY);
    if (dist > maxOffset) {
      state.targetOffsetX = (rawX / dist) * maxOffset;
      state.targetOffsetY = (rawY / dist) * maxOffset;
    } else {
      state.targetOffsetX = rawX;
      state.targetOffsetY = rawY;
    }
  }
});

window.addEventListener("pointerleave", () => {
  if (state.interactionMode !== "mouse") return;
  state.lastMouseX = null;
  state.lastMouseY = null;
  state.mouseTargetVelocity = 0;
  state.targetOffsetX = 0;
  state.targetOffsetY = 0;
});

function animate(time) {
  requestAnimationFrame(animate);
  const seconds = time * 0.001;
  const compacting = state.targetSpread < state.spread;
  const hardCompacting = compacting && state.spread > 0.35;
  const spreadEase = hardCompacting ? 0.34 : compacting ? 0.24 : 0.13;
  const shapeEase = hardCompacting ? 0.28 : compacting ? 0.2 : 0.1;
  state.spread += (state.targetSpread - state.spread) * spreadEase;
  state.shapeMix += (state.targetShapeMix - state.shapeMix) * shapeEase;
  if (state.interactionMode === "mouse") {
    state.angularVelocity += (state.mouseTargetVelocity - state.angularVelocity) * 0.18;
    state.mouseTargetVelocity *= 0.92;
  }
  state.rotationY += state.angularVelocity * 0.045;
  state.angularVelocity *= 0.975;

  particleUniforms.uTime.value = seconds;
  particleUniforms.uSpread.value = state.spread;
  particleUniforms.uShapeMix.value = state.shapeMix;

  const ease = 0.14;
  state.offsetX += (state.targetOffsetX - state.offsetX) * ease;
  state.offsetY += (state.targetOffsetY - state.offsetY) * ease;
  const maxOffset = 1.6;
  const offDist = Math.hypot(state.offsetX, state.offsetY);
  if (offDist > maxOffset) {
    state.offsetX = (state.offsetX / offDist) * maxOffset;
    state.offsetY = (state.offsetY / offDist) * maxOffset;
  }

  group.position.x = state.offsetX;
  group.position.y = state.offsetY;
  group.rotation.y = state.rotationY + Math.sin(seconds * 0.32) * 0.12;
  group.rotation.x = Math.sin(seconds * 0.24) * 0.06;
  motionStatus.textContent = Math.abs(state.angularVelocity).toFixed(2);

  renderer.render(scene, camera);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  particleUniforms.uPixelRatio.value = renderPixelRatio;
  resizeOverlay();
}

window.addEventListener("resize", resize);

function waitForMediaPipe(maxWait = 10000) {
  return new Promise((resolve) => {
    if (window.Hands) return resolve(true);
    const start = performance.now();
    function check() {
      if (window.Hands) return resolve(true);
      if (performance.now() - start > maxWait) return resolve(false);
      setTimeout(check, 200);
    }
    check();
  });
}

(async () => {
  updateHudValues();
  updateModeLabels();
  rebuildParticles();
  resize();
  const ready = await waitForMediaPipe();
  if (ready) {
    await startHands();
  } else {
    cameraStatus.textContent = "库加载失败";
    gestureStatus.textContent = "鼠标备用";
  }
  requestAnimationFrame(animate);
})();
