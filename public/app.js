import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
});

const STORAGE_KEY = "mermaid-dnd-builder-state-v2";

const state = {
  direction: "TD",
  nodes: [],
  edges: [],
  selected: null,
  draggingNodeId: null,
  dragOffsetX: 0,
  dragOffsetY: 0,
  connectionDraft: null,
  paletteDrag: null,
  codeDirty: false,
  lastRenderedSvg: "",
  renderNonce: 0,
  nextNodeNumber: 1,
};

const canvas = document.getElementById("canvas");
const canvasSpacer = document.getElementById("canvas-spacer");
const edgeLayer = document.getElementById("edge-layer");
const mermaidCode = document.getElementById("mermaid-code");
const preview = document.getElementById("preview");
const inspector = document.getElementById("inspector");
const applyCodeBtn = document.getElementById("apply-code-btn");
const copyBtn = document.getElementById("copy-btn");
const exportSvgBtn = document.getElementById("export-svg-btn");
const exportPngBtn = document.getElementById("export-png-btn");
const resetBtn = document.getElementById("reset-btn");
const fitBtn = document.getElementById("fit-btn");
const exportJsonBtn = document.getElementById("export-json-btn");
const importJsonInput = document.getElementById("import-json-input");
const renderStatus = document.getElementById("render-status");
const canvasHint = canvas.querySelector(".canvas-hint");

function escapeMermaidText(value) {
  return String(value).replace(/"/g, "&quot;").trim() || "未命名";
}

function decodeMermaidText(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setRenderStatus(text, kind = "") {
  renderStatus.textContent = text;
  renderStatus.className = kind ? `render-status ${kind}` : "render-status";
}

function makeNodeSyntax(node) {
  const label = escapeMermaidText(node.label);
  switch (node.shape) {
    case "round":
      return `${node.id}("${label}")`;
    case "diamond":
      return `${node.id}{"${label}"}`;
    case "circle":
      return `${node.id}(("${label}"))`;
    case "subroutine":
      return `${node.id}[["${label}"]]`;
    case "rect":
    default:
      return `${node.id}["${label}"]`;
  }
}

function makeEdgeSyntax(edge) {
  const label = edge.label ? `|${escapeMermaidText(edge.label)}|` : "";
  return `${edge.from} -->${label} ${edge.to}`;
}

function generateMermaid() {
  const orderedNodes = [...state.nodes].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const lines = [`flowchart ${state.direction}`];

  if (orderedNodes.length === 0) {
    lines.push("  A[开始拖拽节点]");
  } else {
    orderedNodes.forEach((node) => {
      lines.push(`  ${makeNodeSyntax(node)}`);
    });
  }

  state.edges.forEach((edge) => {
    lines.push(`  ${makeEdgeSyntax(edge)}`);
  });

  return lines.join("\n");
}

function clearStoredState() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem("mermaid-dnd-builder-state-v1");
}

function saveState() {
  return;
}

function loadState() {
  clearStoredState();
  state.direction = "TD";
  state.nodes = [];
  state.edges = [];
  state.selected = null;
  state.draggingNodeId = null;
  state.dragOffsetX = 0;
  state.dragOffsetY = 0;
  state.connectionDraft = null;
  state.paletteDrag = null;
  state.codeDirty = false;
  state.lastRenderedSvg = "";
  state.renderNonce = 0;
  state.nextNodeNumber = 1;
}

function setSelected(selection) {
  state.selected = selection;
  renderInspector();
  renderCanvas();
}

function persistAndRender() {
  saveState();
  renderAllFromCanvas();
}

function applyCurrentCodeToState({ showAlert = true } = {}) {
  try {
    const parsed = parseMermaidToState(mermaidCode.value);
    state.direction = parsed.direction;
    state.nodes = parsed.nodes;
    state.edges = parsed.edges;
    state.selected = null;
    state.nextNodeNumber = parsed.nextNodeNumber;
    persistAndRender();
    return true;
  } catch (error) {
    if (showAlert) {
      alert(`应用代码失败: ${error.message || error}`);
    }
    return false;
  }
}

function ensureCanvasStateCurrent() {
  if (!state.codeDirty) {
    return true;
  }

  return applyCurrentCodeToState();
}

function getNodeById(nodeId) {
  return state.nodes.find((node) => node.id === nodeId) || null;
}

function removeNode(nodeId) {
  if (!ensureCanvasStateCurrent()) {
    return;
  }

  state.nodes = state.nodes.filter((node) => node.id !== nodeId);
  state.edges = state.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
  if (state.selected?.id === nodeId) {
    state.selected = null;
  }
  persistAndRender();
}

function removeEdge(edgeId) {
  if (!ensureCanvasStateCurrent()) {
    return;
  }

  state.edges = state.edges.filter((edge) => edge.id !== edgeId);
  if (state.selected?.id === edgeId) {
    state.selected = null;
  }
  persistAndRender();
}

function removeSelectedItem() {
  if (!state.selected) {
    return;
  }

  if (state.selected.type === "node") {
    removeNode(state.selected.id);
    return;
  }

  if (state.selected.type === "edge") {
    removeEdge(state.selected.id);
  }
}

function pointInCanvas(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clientX - rect.left + canvas.scrollLeft,
    y: clientY - rect.top + canvas.scrollTop,
  };
}

function nodeCenter(node) {
  const element = canvas.querySelector(`[data-node-id="${node.id}"]`);
  if (!element) {
    return { x: node.x + 70, y: node.y + 32 };
  }

  return {
    x: node.x + element.offsetWidth / 2,
    y: node.y + element.offsetHeight / 2,
  };
}

function portPoint(node, type) {
  const element = canvas.querySelector(`[data-node-id="${node.id}"]`);
  if (!element) {
    return nodeCenter(node);
  }

  return {
    x: node.x + (type === "out" ? element.offsetWidth : 0),
    y: node.y + element.offsetHeight / 2,
  };
}

function makeCurvePath(start, end) {
  const deltaX = Math.max(60, Math.abs(end.x - start.x) * 0.45);
  return `M ${start.x} ${start.y} C ${start.x + deltaX} ${start.y}, ${end.x - deltaX} ${end.y}, ${end.x} ${end.y}`;
}

function updateCanvasHint() {
  canvasHint.hidden = state.nodes.length > 0;
}

function resizeCanvasSurface() {
  const maxX = state.nodes.reduce((value, node) => Math.max(value, node.x + 260), 1400);
  const maxY = state.nodes.reduce((value, node) => Math.max(value, node.y + 220), 900);
  canvasSpacer.style.width = `${maxX}px`;
  canvasSpacer.style.height = `${maxY}px`;
  edgeLayer.style.width = `${maxX}px`;
  edgeLayer.style.height = `${maxY}px`;
  edgeLayer.setAttribute("viewBox", `0 0 ${maxX} ${maxY}`);
}

function renderEdges() {
  const parts = [];

  state.edges.forEach((edge) => {
    const fromNode = getNodeById(edge.from);
    const toNode = getNodeById(edge.to);
    if (!fromNode || !toNode) {
      return;
    }

    const start = portPoint(fromNode, "out");
    const end = portPoint(toNode, "in");
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const selectedClass = state.selected?.type === "edge" && state.selected.id === edge.id ? "selected" : "";

    parts.push(
      `<path class="edge-path ${selectedClass}" data-edge-id="${edge.id}" d="${makeCurvePath(start, end)}" />`,
    );

    if (edge.label) {
      parts.push(
        `<text class="edge-label" x="${midX}" y="${midY - 8}" text-anchor="middle">${escapeHtml(edge.label)}</text>`,
      );
    }
  });

  if (state.connectionDraft) {
    const fromNode = getNodeById(state.connectionDraft.from);
    if (fromNode) {
      const start = portPoint(fromNode, "out");
      const end = state.connectionDraft.pointer;
      parts.push(`<path class="edge-path selected" d="${makeCurvePath(start, end)}" />`);
    }
  }

  edgeLayer.innerHTML = parts.join("");
}

function renderCanvas() {
  canvas.querySelectorAll(".node").forEach((node) => node.remove());
  resizeCanvasSurface();

  state.nodes.forEach((node) => {
    const element = document.createElement("div");
    const selectedClass = state.selected?.type === "node" && state.selected.id === node.id ? "selected" : "";
    element.className = `node ${node.shape} ${selectedClass}`.trim();
    element.style.left = `${node.x}px`;
    element.style.top = `${node.y}px`;
    element.dataset.nodeId = node.id;
    element.innerHTML = `
      <button class="port in" type="button" aria-label="Input port"></button>
      <div class="node-actions">
        <button class="node-delete" type="button" aria-label="Delete node">×</button>
      </div>
      <div class="node-label">${escapeHtml(node.label)}</div>
      <button class="port out" type="button" aria-label="Output port"></button>
    `;
    canvas.appendChild(element);
  });

  renderEdges();
  updateCanvasHint();
}

function renderInspector() {
  if (!state.selected) {
    inspector.className = "inspector empty";
    inspector.textContent = "选中节点后可以修改文字；选中连线后可以写连线标签。";
    return;
  }

  inspector.className = "inspector";

  if (state.selected.type === "node") {
    const node = getNodeById(state.selected.id);
    if (!node) {
      setSelected(null);
      return;
    }

    inspector.innerHTML = `
      <form class="inspector-form" id="node-form">
        <label>
          节点标题
          <input name="label" value="${escapeHtml(node.label)}" maxlength="60" />
        </label>
        <label>
          节点形状
          <select name="shape">
            <option value="rect" ${node.shape === "rect" ? "selected" : ""}>矩形</option>
            <option value="round" ${node.shape === "round" ? "selected" : ""}>圆角</option>
            <option value="diamond" ${node.shape === "diamond" ? "selected" : ""}>判断</option>
            <option value="circle" ${node.shape === "circle" ? "selected" : ""}>圆形</option>
            <option value="subroutine" ${node.shape === "subroutine" ? "selected" : ""}>子流程</option>
          </select>
        </label>
        <button class="danger-btn" type="button" id="delete-selected-node">删除节点</button>
      </form>
    `;

    inspector.querySelector("#node-form").addEventListener("input", (event) => {
      const form = event.currentTarget;
      node.label = form.label.value || "未命名";
      node.shape = form.shape.value;
      persistAndRender();
    });

    inspector.querySelector("#delete-selected-node").addEventListener("click", () => {
      removeNode(node.id);
    });

    return;
  }

  if (state.selected.type === "edge") {
    const edge = state.edges.find((item) => item.id === state.selected.id);
    if (!edge) {
      setSelected(null);
      return;
    }

    inspector.innerHTML = `
      <form class="inspector-form" id="edge-form">
        <label>
          连线标签
          <input name="label" value="${escapeHtml(edge.label || "")}" maxlength="40" placeholder="例如：是 / 否" />
        </label>
        <button class="danger-btn" type="button" id="delete-selected-edge">删除连线</button>
      </form>
    `;

    inspector.querySelector("#edge-form").addEventListener("input", (event) => {
      const form = event.currentTarget;
      edge.label = form.label.value.trim();
      persistAndRender();
    });

    inspector.querySelector("#delete-selected-edge").addEventListener("click", () => {
      removeEdge(edge.id);
    });
  }
}

async function renderPreview(code) {
  const currentNonce = ++state.renderNonce;

  try {
    const { svg } = await mermaid.render(`mermaid-preview-${Date.now()}`, code);
    if (currentNonce !== state.renderNonce) {
      return;
    }

    preview.innerHTML = svg;
    state.lastRenderedSvg = svg;
    setRenderStatus(state.codeDirty ? "代码已修改，未应用到画布" : "渲染成功", state.codeDirty ? "" : "ok");
  } catch (error) {
    if (currentNonce !== state.renderNonce) {
      return;
    }

    preview.innerHTML = `<pre>${escapeHtml(String(error.message || error))}</pre>`;
    state.lastRenderedSvg = "";
    setRenderStatus("渲染失败", "error");
  }
}

function renderAllFromCanvas() {
  const code = generateMermaid();
  state.codeDirty = false;
  mermaidCode.classList.remove("dirty");
  mermaidCode.value = code;
  renderCanvas();
  renderInspector();
  renderPreview(code);
}

function makePalettePayload(item) {
  return {
    shape: item.dataset.shape,
    label: item.dataset.label,
  };
}

function parsePalettePayload(raw) {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.shape || !parsed?.label) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function readPalettePayload(dataTransfer) {
  if (dataTransfer) {
    const candidateTypes = ["application/json", "text/plain", "text"];
    for (const type of candidateTypes) {
      const parsed = parsePalettePayload(dataTransfer.getData(type));
      if (parsed) {
        return parsed;
      }
    }
  }

  return state.paletteDrag;
}

function createNode(shape, label, x, y) {
  if (!ensureCanvasStateCurrent()) {
    return;
  }

  const node = {
    id: `N${state.nextNodeNumber++}`,
    label,
    shape,
    x,
    y,
  };
  state.nodes.push(node);
  setSelected({ type: "node", id: node.id });
  persistAndRender();
}

function createNodeNearViewport(payload) {
  createNode(
    payload.shape,
    `${payload.label} ${state.nextNodeNumber}`,
    canvas.scrollLeft + 80,
    canvas.scrollTop + 120,
  );
}

function addEdge(fromId, toId) {
  if (!ensureCanvasStateCurrent()) {
    return;
  }

  if (fromId === toId) {
    return;
  }

  const exists = state.edges.some((edge) => edge.from === fromId && edge.to === toId);
  if (exists) {
    return;
  }

  state.edges.push({
    id: `E${Date.now()}${Math.floor(Math.random() * 1000)}`,
    from: fromId,
    to: toId,
    label: "",
  });
  persistAndRender();
}

function fitNodesToViewport() {
  if (!ensureCanvasStateCurrent()) {
    return;
  }

  if (state.nodes.length === 0) {
    return;
  }

  const minX = Math.min(...state.nodes.map((node) => node.x));
  const minY = Math.min(...state.nodes.map((node) => node.y));
  const offsetX = Math.max(24 - minX, 0);
  const offsetY = Math.max(80 - minY, 0);
  state.nodes.forEach((node) => {
    node.x += offsetX;
    node.y += offsetY;
  });
  persistAndRender();
}

function parseNodeToken(rawToken) {
  const token = rawToken.trim();
  const patterns = [
    { shape: "circle", regex: /^([A-Za-z][\w-]*)\(\("([\s\S]*?)"\)\)$/ },
    { shape: "subroutine", regex: /^([A-Za-z][\w-]*)\[\["([\s\S]*?)"\]\]$/ },
    { shape: "round", regex: /^([A-Za-z][\w-]*)\("([\s\S]*?)"\)$/ },
    { shape: "diamond", regex: /^([A-Za-z][\w-]*)\{"([\s\S]*?)"\}$/ },
    { shape: "rect", regex: /^([A-Za-z][\w-]*)\["([\s\S]*?)"\]$/ },
  ];

  for (const pattern of patterns) {
    const match = token.match(pattern.regex);
    if (match) {
      return {
        id: match[1],
        shape: pattern.shape,
        label: decodeMermaidText(match[2]) || match[1],
        explicit: true,
      };
    }
  }

  const plainMatch = token.match(/^([A-Za-z][\w-]*)$/);
  if (plainMatch) {
    return {
      id: plainMatch[1],
      shape: null,
      label: null,
      explicit: false,
    };
  }

  return null;
}

function parseEdgeLine(line) {
  const arrowIndex = line.indexOf("-->");
  if (arrowIndex === -1) {
    return null;
  }

  const fromToken = line.slice(0, arrowIndex).trim();
  let rest = line.slice(arrowIndex + 3).trim();
  let label = "";

  if (rest.startsWith("|")) {
    const closingIndex = rest.indexOf("|", 1);
    if (closingIndex === -1) {
      throw new Error(`无法解析连线标签: ${line}`);
    }
    label = decodeMermaidText(rest.slice(1, closingIndex));
    rest = rest.slice(closingIndex + 1).trim();
  }

  if (!rest) {
    throw new Error(`无法解析连线终点: ${line}`);
  }

  return {
    fromToken,
    toToken: rest,
    label,
  };
}

function layoutImportedNodes(nodes, edges, direction) {
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));

  edges.forEach((edge) => {
    if (adjacency.has(edge.from) && adjacency.has(edge.to)) {
      adjacency.get(edge.from).push(edge.to);
      indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
    }
  });

  const queue = nodes.filter((node) => (indegree.get(node.id) || 0) === 0).map((node) => node.id);
  const levelMap = new Map(queue.map((id) => [id, 0]));

  while (queue.length > 0) {
    const current = queue.shift();
    const currentLevel = levelMap.get(current) || 0;

    for (const next of adjacency.get(current) || []) {
      const nextLevel = Math.max(levelMap.get(next) || 0, currentLevel + 1);
      levelMap.set(next, nextLevel);
      indegree.set(next, (indegree.get(next) || 0) - 1);
      if ((indegree.get(next) || 0) <= 0) {
        queue.push(next);
      }
    }
  }

  let fallbackLevel = 0;
  nodes.forEach((node) => {
    if (!levelMap.has(node.id)) {
      levelMap.set(node.id, fallbackLevel++);
    }
  });

  const levelBuckets = new Map();
  nodes.forEach((node) => {
    const level = levelMap.get(node.id) || 0;
    if (!levelBuckets.has(level)) {
      levelBuckets.set(level, []);
    }
    levelBuckets.get(level).push(node);
  });

  const vertical = direction === "TD" || direction === "BT";
  [...levelBuckets.keys()]
    .sort((a, b) => a - b)
    .forEach((level) => {
      const bucket = levelBuckets.get(level);
      bucket.forEach((node, index) => {
        if (vertical) {
          node.x = 80 + index * 240;
          node.y = 100 + level * 180;
        } else {
          node.x = 80 + level * 260;
          node.y = 100 + index * 160;
        }
      });
    });
}

function parseMermaidToState(code) {
  if (code.trim() === "") {
    return {
      direction: "TD",
      nodes: [],
      edges: [],
      nextNodeNumber: 1,
    };
  }

  const lines = code
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%%"));

  if (lines.length === 0) {
    return {
      direction: "TD",
      nodes: [],
      edges: [],
      nextNodeNumber: 1,
    };
  }

  const headerMatch = lines[0].match(/^flowchart\s+(TD|BT|LR|RL)$/i);
  if (!headerMatch) {
    throw new Error("目前只支持解析 flowchart TD/BT/LR/RL");
  }

  const direction = headerMatch[1].toUpperCase();
  const nodeMap = new Map();
  const edges = [];
  const standaloneDeclaredIds = new Set();

  function upsertNode(rawToken) {
    const parsed = parseNodeToken(rawToken);
    if (!parsed) {
      throw new Error(`无法解析节点: ${rawToken}`);
    }

    const existing = nodeMap.get(parsed.id);
    if (existing) {
      if (parsed.shape) {
        existing.shape = parsed.shape;
      }
      if (parsed.label) {
        existing.label = parsed.label;
      }
      return existing;
    }

    const node = {
      id: parsed.id,
      shape: parsed.shape || "rect",
      label: parsed.label || parsed.id,
      x: 0,
      y: 0,
    };
    nodeMap.set(node.id, node);
    return node;
  }

  for (const line of lines.slice(1)) {
    const edgeData = parseEdgeLine(line);
    if (edgeData) {
      const fromNode = upsertNode(edgeData.fromToken);
      const toNode = upsertNode(edgeData.toToken);
      edges.push({
        id: `E${Date.now()}${Math.floor(Math.random() * 1000)}${edges.length}`,
        from: fromNode.id,
        to: toNode.id,
        label: edgeData.label,
      });
      continue;
    }

    upsertNode(line);
    const parsed = parseNodeToken(line);
    if (parsed) {
      standaloneDeclaredIds.add(parsed.id);
    }
  }

  let nodes = [...nodeMap.values()];
  let filteredEdges = edges;

  if (standaloneDeclaredIds.size > 0) {
    nodes = nodes.filter((node) => standaloneDeclaredIds.has(node.id));
    const keptIds = new Set(nodes.map((node) => node.id));
    filteredEdges = edges.filter((edge) => keptIds.has(edge.from) && keptIds.has(edge.to));
  }

  layoutImportedNodes(nodes, filteredEdges, direction);

  return {
    direction,
    nodes,
    edges: filteredEdges,
    nextNodeNumber: Math.max(
      1,
      ...nodes
        .map((node) => Number.parseInt(String(node.id).replace(/^\D+/, ""), 10))
        .filter(Number.isFinite)
        .map((value) => value + 1),
    ),
  };
}

function sanitizeSvgMarkup(svgMarkup) {
  return svgMarkup.includes('xmlns="http://www.w3.org/2000/svg"')
    ? svgMarkup
    : svgMarkup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
}

function downloadBlob(filename, type, content) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportSvg() {
  if (!state.lastRenderedSvg) {
    return;
  }

  downloadBlob("mermaid-diagram.svg", "image/svg+xml;charset=utf-8", sanitizeSvgMarkup(state.lastRenderedSvg));
}

async function exportPng() {
  const svgElement = preview.querySelector("svg");
  if (!svgElement || !state.lastRenderedSvg) {
    return;
  }

  const bounds = svgElement.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.ceil(bounds.width));
  const height = Math.max(1, Math.ceil(bounds.height));
  const canvasElement = document.createElement("canvas");
  canvasElement.width = Math.max(1, Math.ceil(width * scale));
  canvasElement.height = Math.max(1, Math.ceil(height * scale));

  const context = canvasElement.getContext("2d");
  context.scale(scale, scale);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  const svgBlob = new Blob([sanitizeSvgMarkup(state.lastRenderedSvg)], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise((resolve, reject) => {
      const tempImage = new Image();
      tempImage.onload = () => resolve(tempImage);
      tempImage.onerror = reject;
      tempImage.src = url;
    });
    context.drawImage(image, 0, 0, width, height);
    const pngBlob = await new Promise((resolve) => canvasElement.toBlob(resolve, "image/png"));
    if (pngBlob) {
      downloadBlob("mermaid-diagram.png", "image/png", pngBlob);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

document.querySelectorAll(".palette-item").forEach((item) => {
  item.addEventListener("dragstart", (event) => {
    const payload = makePalettePayload(item);
    const raw = JSON.stringify(payload);
    state.paletteDrag = payload;
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/json", raw);
    event.dataTransfer.setData("text/plain", raw);
  });

  item.addEventListener("dragend", () => {
    state.paletteDrag = null;
  });

  item.addEventListener("click", () => {
    createNodeNearViewport(makePalettePayload(item));
  });
});

canvas.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
});

canvas.addEventListener("drop", (event) => {
  event.preventDefault();
  const payload = readPalettePayload(event.dataTransfer);
  state.paletteDrag = null;
  if (!payload) {
    return;
  }

  const point = pointInCanvas(event.clientX, event.clientY);
  createNode(payload.shape, `${payload.label} ${state.nextNodeNumber}`, point.x - 70, point.y - 32);
});

canvas.addEventListener("pointerdown", (event) => {
  if (state.codeDirty) {
    applyCurrentCodeToState();
    return;
  }

  const nodeElement = event.target.closest(".node");
  const edgeElement = event.target.closest(".edge-path");

  if (edgeElement?.dataset.edgeId) {
    setSelected({ type: "edge", id: edgeElement.dataset.edgeId });
    return;
  }

  if (!nodeElement) {
    setSelected(null);
    return;
  }

  const nodeId = nodeElement.dataset.nodeId;

  if (event.target.closest(".node-delete")) {
    return;
  }

  setSelected({ type: "node", id: nodeId });

  if (event.target.closest(".port.out")) {
    const pointer = pointInCanvas(event.clientX, event.clientY);
    state.connectionDraft = { from: nodeId, pointer };
    renderEdges();
    return;
  }

  if (event.target.closest(".port.in")) {
    return;
  }

  const node = getNodeById(nodeId);
  if (!node) {
    return;
  }

  const rect = nodeElement.getBoundingClientRect();
  state.draggingNodeId = nodeId;
  state.dragOffsetX = event.clientX - rect.left;
  state.dragOffsetY = event.clientY - rect.top;
  nodeElement.querySelector(".node-label")?.style.setProperty("cursor", "grabbing");
});

canvas.addEventListener("click", (event) => {
  const deleteButton = event.target.closest(".node-delete");
  if (!deleteButton) {
    return;
  }

  event.stopPropagation();
  const nodeElement = deleteButton.closest(".node");
  if (!nodeElement?.dataset.nodeId) {
    return;
  }

  removeNode(nodeElement.dataset.nodeId);
});

window.addEventListener("pointermove", (event) => {
  if (state.draggingNodeId) {
    const node = getNodeById(state.draggingNodeId);
    if (!node) {
      return;
    }

    const point = pointInCanvas(event.clientX, event.clientY);
    node.x = point.x - state.dragOffsetX;
    node.y = point.y - state.dragOffsetY;
    renderCanvas();
    return;
  }

  if (state.connectionDraft) {
    state.connectionDraft.pointer = pointInCanvas(event.clientX, event.clientY);
    renderEdges();
  }
});

window.addEventListener("pointerup", (event) => {
  if (state.draggingNodeId) {
    state.draggingNodeId = null;
    persistAndRender();
  }

  if (state.connectionDraft) {
    const targetPort = event.target.closest(".port.in");
    const targetNode = targetPort?.closest(".node");
    if (targetNode?.dataset.nodeId) {
      addEdge(state.connectionDraft.from, targetNode.dataset.nodeId);
    } else {
      renderCanvas();
    }
    state.connectionDraft = null;
    renderEdges();
  }
});

mermaidCode.addEventListener("input", () => {
  state.codeDirty = true;
  mermaidCode.classList.add("dirty");
  renderPreview(mermaidCode.value);
});

applyCodeBtn.addEventListener("click", () => {
  applyCurrentCodeToState();
});

copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(mermaidCode.value);
  copyBtn.textContent = "已复制";
  window.setTimeout(() => {
    copyBtn.textContent = "复制代码";
  }, 1200);
});

exportSvgBtn.addEventListener("click", exportSvg);
exportPngBtn.addEventListener("click", exportPng);

resetBtn.addEventListener("click", () => {
  state.direction = "TD";
  state.nodes = [];
  state.edges = [];
  state.selected = null;
  state.nextNodeNumber = 1;
  persistAndRender();
});

fitBtn.addEventListener("click", fitNodesToViewport);

exportJsonBtn.addEventListener("click", () => {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          direction: state.direction,
          nodes: state.nodes,
          edges: state.edges,
          nextNodeNumber: state.nextNodeNumber,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  downloadBlob("mermaid-builder.json", "application/json", blob);
});

importJsonInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    state.direction = typeof parsed.direction === "string" ? parsed.direction : "TD";
    state.nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    state.edges = Array.isArray(parsed.edges) ? parsed.edges : [];
    state.nextNodeNumber = Number.isFinite(parsed.nextNodeNumber) ? parsed.nextNodeNumber : state.nodes.length + 1;
    state.selected = null;
    persistAndRender();
  } catch (error) {
    alert(`导入失败: ${error.message || error}`);
  } finally {
    importJsonInput.value = "";
  }
});

window.addEventListener("keydown", (event) => {
  const activeTag = document.activeElement?.tagName;
  const isTyping =
    activeTag === "INPUT" ||
    activeTag === "TEXTAREA" ||
    document.activeElement?.isContentEditable;

  if (isTyping) {
    return;
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    removeSelectedItem();
  }
});

loadState();
renderAllFromCanvas();
