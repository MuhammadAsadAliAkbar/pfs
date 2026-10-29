"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { api, setToken, getToken } from "../lib/api";
import "./premium-editor.css";

/* ---------- helpers ---------- */
const mk = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
const ctxOf = (c) => c.getContext("2d", { willReadFrequently: true });
let uid = 1;
const newLayer = (w, h, name, fill) => {
  const canvas = mk(w, h);
  if (fill) {
    const x = ctxOf(canvas);
    x.fillStyle = fill;
    x.fillRect(0, 0, w, h);
  }
  return { id: uid++, name, visible: true, opacity: 1, blend: "source-over", canvas };
};
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (r, g, b) =>
  "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
const loadImg = (src) =>
  new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });

const BLENDS = [
  "source-over", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion",
];

const TOOLS = [
  ["move", "✥", "Move layer (V)"],
  ["artboard", "▦", "Artboard (Shift+O)"],
  ["marquee", "▭", "Rectangular Marquee (M)"],
  ["ellipse-sel", "◯", "Elliptical Marquee (M)"],
  ["lasso", "〰️", "Lasso (L)"],
  ["poly-lasso", "⬠", "Polygonal Lasso (L)"],
  ["magic", "✨", "Magic Wand / Quick Select (W)"],
  ["crop", "✂", "Crop Tool (C)"],
  ["slice", "⧉", "Slice Tool (C)"],
  ["heal", "🩹", "Spot Healing / Healing Brush (J)"],
  ["patch", "🧩", "Patch Tool (J)"],
  ["clone", "◎", "Clone Stamp (S)"],
  ["dodge", "☀", "Dodge (O)"],
  ["burn", "🌑", "Burn (O)"],
  ["eraser", "⌫", "Eraser (E)"],
  ["brush", "🖌", "Brush (B)"],
  ["bucket", "🪣", "Paint Bucket / Fill (G)"],
  ["gradient", "🌈", "Gradient Tool (G)"],
  ["pen", "✒️", "Pen Tool (P)"],
  ["rect", "▭", "Rectangle Shape (U)"],
  ["ellipse", "◯", "Ellipse Shape (U)"],
  ["line", "／", "Line (U)"],
  ["text", "T", "Type Tool (T)"],
  ["picker", "💧", "Eyedropper (I)"],
  ["hand", "✋", "Hand Tool (H)"],
  ["zoomin", "🔍+", "Zoom In (Z)"],
  ["zoomout", "🔍−", "Zoom Out (Alt+Z)"],
];

const KEYS = {
  v: "move", m: "marquee", l: "lasso", w: "magic", c: "crop",
  j: "heal", s: "clone", o: "dodge", e: "eraser", b: "brush",
  g: "bucket", p: "pen", u: "rect", t: "text", i: "picker",
  h: "hand", z: "zoomin",
};

const SERVER_FILTERS = [
  ["blur", "Gaussian blur"], ["motion_blur", "Box blur"], ["sharpen", "Sharpen"],
  ["smooth", "Smooth"], ["detail", "Detail"], ["edges", "Find edges"],
  ["emboss", "Emboss"], ["contour", "Contour"], ["posterize", "Posterize"],
  ["solarize", "Solarize"], ["autocontrast", "Auto contrast"],
  ["equalize", "Equalize"], ["pixelate", "Pixelate"],
];

function floodFill(canvas, x, y, hex, tol) {
  const ctx = ctxOf(canvas);
  const { width: w, height: h } = canvas;
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const i0 = (y * w + x) * 4;
  const t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]];
  const [r, g, b] = hexToRgb(hex);
  const match = (i) =>
    Math.abs(d[i] - t[0]) <= tol &&
    Math.abs(d[i + 1] - t[1]) <= tol &&
    Math.abs(d[i + 2] - t[2]) <= tol &&
    Math.abs(d[i + 3] - t[3]) <= tol;
  const seen = new Uint8Array(w * h);
  const st = [x + y * w];
  while (st.length) {
    const p = st.pop();
    if (seen[p]) continue;
    const i = p * 4;
    if (!match(i)) continue;
    seen[p] = 1;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    const px = p % w;
    if (px > 0) st.push(p - 1);
    if (px < w - 1) st.push(p + 1);
    if (p >= w) st.push(p - w);
    if (p < w * (h - 1)) st.push(p + w);
  }
  ctx.putImageData(img, 0, 0);
}

function magicSelect(canvas, x, y, tol) {
  const ctx = ctxOf(canvas);
  const { width: w, height: h } = canvas;
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const i0 = (y * w + x) * 4;
  const t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]];
  const match = (i) =>
    Math.abs(d[i] - t[0]) <= tol &&
    Math.abs(d[i + 1] - t[1]) <= tol &&
    Math.abs(d[i + 2] - t[2]) <= tol &&
    Math.abs(d[i + 3] - t[3]) <= tol;
  const mask = new Uint8Array(w * h);
  const st = [x + y * w];
  while (st.length) {
    const p = st.pop();
    if (mask[p]) continue;
    const i = p * 4;
    if (!match(i)) continue;
    mask[p] = 1;
    const px = p % w;
    if (px > 0) st.push(p - 1);
    if (px < w - 1) st.push(p + 1);
    if (p >= w) st.push(p - w);
    if (p < w * (h - 1)) st.push(p + w);
  }
  return { mask, w, h };
}

const PIXEL_FX = {
  grayscale: (d) => {
    for (let i = 0; i < d.length; i += 4) {
      const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  },
  invert: (d) => {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i];
      d[i + 1] = 255 - d[i + 1];
      d[i + 2] = 255 - d[i + 2];
    }
  },
  sepia: (d) => {
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      d[i] = 0.393 * r + 0.769 * g + 0.189 * b;
      d[i + 1] = 0.349 * r + 0.686 * g + 0.168 * b;
      d[i + 2] = 0.272 * r + 0.534 * g + 0.131 * b;
    }
  },
};

/* ---------- component ---------- */
export default function Editor() {
  const view = useRef(null);
  const layersRef = useRef([]);
  const drag = useRef(null);
  const hist = useRef({ undo: [], redo: [] });

  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  const [activeId, setActiveId] = useState(null);
  const [tool, setTool] = useState("brush");
  const [color, setColor] = useState("#e11d48");
  const [brush, setBrush] = useState(12);
  const [alpha, setAlpha] = useState(1);
  const [tol, setTol] = useState(32);
  const [fillShape, setFillShape] = useState(true);
  const [zoom, setZoom] = useState(0.7);
  const [adj, setAdj] = useState({ b: 0, c: 0, s: 0 });
  const [fAmount, setFAmount] = useState(3);
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [pid, setPid] = useState(null);
  const [name, setName] = useState("Untitled");
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState("layers");
  const [auth, setAuth] = useState({ email: "", password: "", name: "" });

  const [selection, setSelection] = useState(null);
  const cloneSrc = useRef(null);
  const pathPts = useRef([]);
  const pan = useRef({ x: 0, y: 0 });

  const active = () => layersRef.current.find((l) => l.id === activeId);

  const render = useCallback(() => {
    const v = view.current;
    if (!v) return;
    const x = v.getContext("2d");
    x.clearRect(0, 0, v.width, v.height);
    for (const l of layersRef.current) {
      if (!l.visible) continue;
      x.globalAlpha = l.opacity;
      x.globalCompositeOperation = l.blend;
      x.drawImage(l.canvas, 0, 0);
    }
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";

    if (selection) {
      x.save();
      x.strokeStyle = "#00d4ff";
      x.lineWidth = 1 / zoom;
      x.setLineDash([4 / zoom, 4 / zoom]);
      if (!selection.mask) {
        x.strokeRect(selection.x, selection.y, selection.w, selection.h);
      }
      x.restore();
    }
  }, [selection, zoom]);

  useEffect(() => { render(); });

  useEffect(() => {
    if (layersRef.current.length) return;
    const bg = newLayer(size.w, size.h, "Background", "#ffffff");
    const l1 = newLayer(size.w, size.h, "Layer 1");
    layersRef.current = [bg, l1];
    setActiveId(l1.id);
    bump();
    if (getToken()) {
      api.me()
        .then((u) => { setUser(u); refreshProjects(); })
        .catch(() => setToken(null));
    }
  }, []); // eslint-disable-line

  /* history */
  const snapLayer = (l) => ({
    k: "p", id: l.id,
    img: ctxOf(l.canvas).getImageData(0, 0, l.canvas.width, l.canvas.height),
  });
  const snapAll = () => ({
    k: "s", w: size.w, h: size.h, active: activeId,
    layers: layersRef.current.map((l) => ({
      id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend,
      img: ctxOf(l.canvas).getImageData(0, 0, size.w, size.h),
    })),
  });
  const push = (e) => {
    const h = hist.current;
    h.undo.push(e);
    if (h.undo.length > 40) h.undo.shift();
    h.redo = [];
  };
  const pushPixel = () => { const l = active(); if (l) push(snapLayer(l)); };
  const pushAll = () => push(snapAll());
  const applyEntry = (e) => {
    if (e.k === "p") {
      const l = layersRef.current.find((x) => x.id === e.id);
      if (l) ctxOf(l.canvas).putImageData(e.img, 0, 0);
    } else {
      layersRef.current = e.layers.map((m) => {
        const c = mk(e.w, e.h);
        ctxOf(c).putImageData(m.img, 0, 0);
        return { id: m.id, name: m.name, visible: m.visible, opacity: m.opacity, blend: m.blend, canvas: c };
      });
      setSize({ w: e.w, h: e.h });
      setActiveId(e.active);
    }
  };
  const step = (from, to) => {
    const h = hist.current;
    const e = h[from].pop();
    if (!e) return;
    let cur = null;
    if (e.k === "p") {
      const l = layersRef.current.find((x) => x.id === e.id);
      if (l) cur = snapLayer(l);
    } else cur = snapAll();
    if (cur) h[to].push(cur);
    applyEntry(e);
    render();
    bump();
  };
  const undo = () => step("undo", "redo");
  const redo = () => step("redo", "undo");

  /* layers */
  const addLayer = () => {
    pushAll();
    const l = newLayer(size.w, size.h, "Layer " + (layersRef.current.length + 1));
    const i = layersRef.current.findIndex((x) => x.id === activeId);
    layersRef.current.splice(i < 0 ? layersRef.current.length : i + 1, 0, l);
    setActiveId(l.id);
    bump();
  };
  const dupLayer = () => {
    const l = active();
    if (!l) return;
    pushAll();
    const n = newLayer(size.w, size.h, l.name + " copy");
    ctxOf(n.canvas).drawImage(l.canvas, 0, 0);
    n.opacity = l.opacity;
    n.blend = l.blend;
    layersRef.current.splice(layersRef.current.indexOf(l) + 1, 0, n);
    setActiveId(n.id);
    bump();
  };
  const delLayer = () => {
    if (layersRef.current.length < 2) return setMsg("Kam az kam ek layer rehni chahiye");
    pushAll();
    const i = layersRef.current.findIndex((x) => x.id === activeId);
    layersRef.current.splice(i, 1);
    setActiveId(layersRef.current[Math.max(0, i - 1)].id);
    render();
    bump();
  };
  const moveLayer = (dir) => {
    const a = layersRef.current;
    const i = a.findIndex((x) => x.id === activeId);
    const j = i + dir;
    if (j < 0 || j >= a.length) return;
    pushAll();
    [a[i], a[j]] = [a[j], a[i]];
    render();
    bump();
  };
  const mergeDown = () => {
    const a = layersRef.current;
    const i = a.findIndex((x) => x.id === activeId);
    if (i < 1) return setMsg("Neeche koi layer nahi hai");
    pushAll();
    const c = ctxOf(a[i - 1].canvas);
    c.globalAlpha = a[i].opacity;
    c.globalCompositeOperation = a[i].blend;
    c.drawImage(a[i].canvas, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    a.splice(i, 1);
    setActiveId(a[i - 1].id);
    render();
    bump();
  };

  /* document */
  const newDoc = () => {
    const v = prompt("Canvas size (width x height)", "1200x800");
    if (!v) return;
    const [w, h] = v.toLowerCase().split("x").map((n) => Math.max(16, Math.min(4000, parseInt(n) || 0)));
    if (!w || !h) return;
    const bg = newLayer(w, h, "Background", "#ffffff");
    const l1 = newLayer(w, h, "Layer 1");
    layersRef.current = [bg, l1];
    hist.current = { undo: [], redo: [] };
    setSize({ w, h });
    setActiveId(l1.id);
    setPid(null);
    setName("Untitled");
    setSelection(null);
    bump();
  };
  const openImage = async (file) => {
    const img = await loadImg(URL.createObjectURL(file));
    pushAll();
    const l = newLayer(size.w, size.h, file.name.slice(0, 18));
    const s = Math.min(1, size.w / img.width, size.h / img.height);
    const w = img.width * s, h = img.height * s;
    ctxOf(l.canvas).drawImage(img, (size.w - w) / 2, (size.h - h) / 2, w, h);
    layersRef.current.push(l);
    setActiveId(l.id);
    render();
    bump();
  };
  const composite = (white) => {
    const c = mk(size.w, size.h);
    const x = ctxOf(c);
    if (white) { x.fillStyle = "#fff"; x.fillRect(0, 0, size.w, size.h); }
    for (const l of layersRef.current) {
      if (!l.visible) continue;
      x.globalAlpha = l.opacity;
      x.globalCompositeOperation = l.blend;
      x.drawImage(l.canvas, 0, 0);
    }
    return c;
  };
  const exportImg = (type) => {
    composite(type === "jpeg").toBlob((b) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `${name || "image"}.${type === "jpeg" ? "jpg" : "png"}`;
      a.click();
    }, "image/" + type, 0.92);
  };

  /* filters */
  const applyPixel = (fn) => {
    const l = active();
    if (!l) return;
    pushPixel();
    const c = ctxOf(l.canvas);
    const img = c.getImageData(0, 0, size.w, size.h);
    fn(img.data);
    c.putImageData(img, 0, 0);
    render();
  };
  const applyAdjust = () => {
    const { b, c, s } = adj;
    const cc = c * 2.55;
    const f = (259 * (cc + 255)) / (255 * (259 - cc));
    const bb = b * 2.55;
    const sat = 1 + s / 100;
    applyPixel((d) => {
      for (let i = 0; i < d.length; i += 4) {
        let r = f * (d[i] - 128) + 128 + bb;
        let g = f * (d[i + 1] - 128) + 128 + bb;
        let bl = f * (d[i + 2] - 128) + 128 + bb;
        const gr = 0.299 * r + 0.587 * g + 0.114 * bl;
        d[i] = gr + (r - gr) * sat;
        d[i + 1] = gr + (g - gr) * sat;
        d[i + 2] = gr + (bl - gr) * sat;
      }
    });
    setAdj({ b: 0, c: 0, s: 0 });
  };
  const serverFilter = async (f) => {
    const l = active();
    if (!l) return;
    setMsg("Processing " + f + "…");
    try {
      const r = await api.filter(l.canvas.toDataURL("image/png"), f, fAmount);
      const img = await loadImg(r.image);
      pushPixel();
      const c = ctxOf(l.canvas);
      c.clearRect(0, 0, size.w, size.h);
      c.drawImage(img, 0, 0);
      render();
      setMsg("");
    } catch (e) {
      setMsg(e.message);
    }
  };

  /* account / projects */
  const refreshProjects = () => api.projects().then(setProjects).catch(() => {});
  const doAuth = async (mode) => {
    try {
      const r = mode === "login" ? await api.login(auth) : await api.register(auth);
      setToken(r.token);
      setUser(r.user);
      setMsg("");
      refreshProjects();
      setTab("projects");
    } catch (e) {
      setMsg(e.message);
    }
  };
  const logout = () => { setToken(null); setUser(null); setProjects([]); };
  const thumb = () => {
    const c = mk(200, Math.round((200 * size.h) / size.w));
    ctxOf(c).drawImage(composite(true), 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.6);
  };
  const save = async () => {
    if (!user) { setTab("account"); return setMsg("Save karne ke liye pehle login karo"); }
    try {
      const payload = {
        name, width: size.w, height: size.h, thumbnail: thumb(),
        layers: layersRef.current.map((l) => ({
          name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend,
          data: l.canvas.toDataURL("image/png"),
        })),
      };
      const r = pid ? await api.update(pid, payload) : await api.create(payload);
      setPid(r._id);
      refreshProjects();
      setMsg("Saved ✓");
      setTimeout(() => setMsg(""), 1500);
    } catch (e) {
      setMsg(e.message);
    }
  };
  const openProject = async (id) => {
    try {
      const p = await api.project(id);
      const ls = [];
      for (const L of p.layers) {
        const l = newLayer(p.width, p.height, L.name);
        Object.assign(l, { visible: L.visible, opacity: L.opacity, blend: L.blend });
        ctxOf(l.canvas).drawImage(await loadImg(L.data), 0, 0);
        ls.push(l);
      }
      layersRef.current = ls;
      hist.current = { undo: [], redo: [] };
      setSize({ w: p.width, h: p.height });
      setActiveId(ls[ls.length - 1].id);
      setPid(p._id);
      setName(p.name);
      setSelection(null);
      bump();
    } catch (e) {
      setMsg(e.message);
    }
  };
  const delProject = async (id) => {
    if (confirm("Delete this project?")) {
      await api.remove(id);
      if (id === pid) setPid(null);
      refreshProjects();
    }
  };

  /* drawing helpers */
  const pos = (e) => {
    const r = view.current.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * size.w) / r.width,
      y: ((e.clientY - r.top) * size.h) / r.height,
    };
  };

  const stroke = (a, b, mode = "brush") => {
    const l = active();
    if (!l) return;
    const c = ctxOf(l.canvas);
    c.save();
    c.globalAlpha = alpha;
    c.lineWidth = brush;
    c.lineCap = "round";
    c.lineJoin = "round";
    if (mode === "eraser") {
      c.globalCompositeOperation = "destination-out";
      c.strokeStyle = "#000";
    } else if (mode === "dodge") {
      c.globalCompositeOperation = "lighter";
      c.strokeStyle = "rgba(255,255,255,0.15)";
    } else if (mode === "burn") {
      c.globalCompositeOperation = "multiply";
      c.strokeStyle = "rgba(0,0,0,0.15)";
    } else {
      c.strokeStyle = color;
    }
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x + 0.01, b.y);
    c.stroke();
    c.restore();
  };

  const drawShape = (x, t, a, b) => {
    x.save();
    x.globalAlpha = alpha;
    x.strokeStyle = x.fillStyle = color;
    x.lineWidth = brush;
    x.lineCap = "round";
    x.beginPath();
    if (t === "rect") x.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    else if (t === "ellipse")
      x.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
    else { x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); }
    if (t !== "line" && fillShape) x.fill();
    else x.stroke();
    x.restore();
  };

  const clonePaint = (a, b) => {
    const l = active();
    if (!l || !cloneSrc.current) return;
    const srcL = layersRef.current.find((x) => x.id === cloneSrc.current.layerId) || l;
    const c = ctxOf(l.canvas);
    const sx = cloneSrc.current.x + (a.x - drag.current.origin.x);
    const sy = cloneSrc.current.y + (a.y - drag.current.origin.y);
    c.save();
    c.globalAlpha = alpha;
    c.beginPath();
    c.arc(b.x, b.y, brush / 2, 0, Math.PI * 2);
    c.clip();
    c.drawImage(srcL.canvas, sx - brush / 2, sy - brush / 2, brush, brush, b.x - brush / 2, b.y - brush / 2, brush, brush);
    c.restore();
  };

  const drawGradient = (a, b) => {
    const l = active();
    if (!l) return;
    const c = ctxOf(l.canvas);
    const g = c.createLinearGradient(a.x, a.y, b.x, b.y);
    g.addColorStop(0, color);
    g.addColorStop(1, "transparent");
    c.save();
    c.globalAlpha = alpha;
    c.fillStyle = g;
    c.fillRect(0, 0, size.w, size.h);
    c.restore();
  };

  /* pointer handlers */
  const onDown = (e) => {
    const l = active();
    if (!l && !["hand", "zoomin", "zoomout", "move", "artboard"].includes(tool)) return;
    if (l && !l.visible && !["hand", "zoomin", "zoomout", "move"].includes(tool))
      return setMsg("Layer hidden hai — pehle eye on karo");

    const p = pos(e);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === "hand") {
      drag.current = { start: p, panX: pan.current.x, panY: pan.current.y };
      return;
    }

    // Zoom In
    if (tool === "zoomin") {
      setZoom((z) => Math.min(4, +(z + 0.15).toFixed(2)));
      return;
    }

    // Zoom Out
    if (tool === "zoomout") {
      setZoom((z) => Math.max(0.1, +(z - 0.15).toFixed(2)));
      return;
    }

    if (tool === "picker") {
      const d = view.current.getContext("2d").getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
      setColor(toHex(d[0], d[1], d[2]));
      return;
    }
    if (tool === "magic") {
      const sel = magicSelect(l.canvas, p.x, p.y, tol);
      if (sel) setSelection(sel);
      return;
    }
    if (tool === "clone") {
      if (e.altKey) {
        cloneSrc.current = { x: p.x, y: p.y, layerId: l.id };
        setMsg("Clone source set");
        setTimeout(() => setMsg(""), 1200);
        return;
      }
      if (!cloneSrc.current) {
        setMsg("Alt+Click se pehle source set karo");
        return;
      }
      pushPixel();
      drag.current = { last: p, origin: p };
      clonePaint(p, p);
      render();
      return;
    }
    if (tool === "heal") {
      pushPixel();
      drag.current = { last: p };
      const offset = 8;
      cloneSrc.current = { x: p.x + offset, y: p.y + offset, layerId: l.id };
      clonePaint(p, p);
      render();
      return;
    }
    if (tool === "pen" || tool === "poly-lasso") {
      pathPts.current.push(p);
      if (pathPts.current.length > 1) {
        render();
        const x = view.current.getContext("2d");
        x.save();
        x.strokeStyle = tool === "pen" ? color : "#00d4ff";
        x.lineWidth = tool === "pen" ? brush : 1 / zoom;
        x.beginPath();
        x.moveTo(pathPts.current[0].x, pathPts.current[0].y);
        pathPts.current.forEach((pt) => x.lineTo(pt.x, pt.y));
        x.stroke();
        x.restore();
      }
      return;
    }
    if (["marquee", "ellipse-sel", "lasso", "crop", "slice", "artboard", "patch"].includes(tool)) {
      drag.current = { start: p };
      return;
    }
    if (["brush", "eraser", "dodge", "burn"].includes(tool)) {
      pushPixel();
      drag.current = { last: p };
      stroke(p, p, tool);
      render();
      return;
    }
    if (tool === "bucket") {
      pushPixel();
      floodFill(l.canvas, p.x, p.y, color, tol);
      render();
      return;
    }
    if (tool === "move") {
      pushPixel();
      const cp = mk(size.w, size.h);
      ctxOf(cp).drawImage(l.canvas, 0, 0);
      drag.current = { start: p, cp };
      return;
    }
    if (tool === "text") {
      const t = prompt("Text likho:");
      if (!t) return;
      pushPixel();
      const c = ctxOf(l.canvas);
      c.save();
      c.globalAlpha = alpha;
      c.fillStyle = color;
      c.font = `${brush * 3}px "Segoe UI", sans-serif`;
      c.fillText(t, p.x, p.y);
      c.restore();
      render();
      return;
    }
    if (["rect", "ellipse", "line", "gradient"].includes(tool)) {
      drag.current = { start: p };
    }
  };

  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = pos(e);
    const l = active();

    if (tool === "hand") return;
    if (["brush", "eraser", "dodge", "burn"].includes(tool)) {
      stroke(d.last, p, tool);
      d.last = p;
      render();
      return;
    }
    if (tool === "clone" || tool === "heal") {
      clonePaint(d.last, p);
      d.last = p;
      render();
      return;
    }
    if (tool === "move" && d.cp) {
      const c = ctxOf(l.canvas);
      c.clearRect(0, 0, size.w, size.h);
      c.drawImage(d.cp, p.x - d.start.x, p.y - d.start.y);
      render();
      return;
    }
    if (["rect", "ellipse", "line", "marquee", "ellipse-sel", "crop", "slice", "artboard", "gradient", "patch"].includes(tool)) {
      render();
      const x = view.current.getContext("2d");
      if (["marquee", "ellipse-sel", "crop", "slice", "artboard", "patch"].includes(tool)) {
        x.save();
        x.strokeStyle = "#00d4ff";
        x.lineWidth = 1 / zoom;
        x.setLineDash([4 / zoom, 4 / zoom]);
        if (tool === "ellipse-sel") {
          x.beginPath();
          x.ellipse((d.start.x + p.x) / 2, (d.start.y + p.y) / 2, Math.abs(p.x - d.start.x) / 2, Math.abs(p.y - d.start.y) / 2, 0, 0, Math.PI * 2);
          x.stroke();
        } else {
          x.strokeRect(d.start.x, d.start.y, p.x - d.start.x, p.y - d.start.y);
        }
        x.restore();
      } else if (tool === "gradient") {
        x.save();
        x.strokeStyle = color;
        x.lineWidth = 2 / zoom;
        x.beginPath();
        x.moveTo(d.start.x, d.start.y);
        x.lineTo(p.x, p.y);
        x.stroke();
        x.restore();
      } else {
        drawShape(x, tool, d.start, p);
      }
    }
  };

  const onUp = (e) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const p = pos(e);
    const l = active();

    if (["rect", "ellipse", "line"].includes(tool)) {
      pushPixel();
      drawShape(ctxOf(l.canvas), tool, d.start, p);
      render();
      return;
    }
    if (tool === "gradient") {
      pushPixel();
      drawGradient(d.start, p);
      render();
      return;
    }
    if (["marquee", "ellipse-sel", "crop", "slice", "artboard", "patch"].includes(tool)) {
      const x = Math.min(d.start.x, p.x);
      const y = Math.min(d.start.y, p.y);
      const w = Math.abs(p.x - d.start.x);
      const h = Math.abs(p.y - d.start.y);
      if (w < 2 || h < 2) {
        setSelection(null);
        render();
        return;
      }
      if (tool === "crop") {
        pushAll();
        const nw = Math.round(w), nh = Math.round(h);
        layersRef.current = layersRef.current.map((layer) => {
          const nc = mk(nw, nh);
          ctxOf(nc).drawImage(layer.canvas, x, y, w, h, 0, 0, nw, nh);
          return { ...layer, canvas: nc };
        });
        setSize({ w: nw, h: nh });
        setSelection(null);
        hist.current = { undo: [], redo: [] };
        bump();
        setMsg(`Cropped to ${nw}×${nh}`);
        setTimeout(() => setMsg(""), 1500);
        return;
      }
      if (tool === "artboard") {
        setMsg("Artboard created (visual only in this version)");
        setTimeout(() => setMsg(""), 1500);
      }
      setSelection({ x, y, w, h, type: tool });
      render();
    }
  };

  const onDblClick = () => {
    if ((tool === "pen" || tool === "poly-lasso") && pathPts.current.length > 2) {
      const l = active();
      if (!l) return;
      pushPixel();
      const c = ctxOf(l.canvas);
      c.save();
      c.globalAlpha = alpha;
      c.strokeStyle = c.fillStyle = color;
      c.lineWidth = brush;
      c.beginPath();
      c.moveTo(pathPts.current[0].x, pathPts.current[0].y);
      pathPts.current.forEach((pt) => c.lineTo(pt.x, pt.y));
      c.closePath();
      if (tool === "poly-lasso" || fillShape) c.fill();
      else c.stroke();
      c.restore();
      pathPts.current = [];
      render();
    }
  };

  /* shortcuts */
  useEffect(() => {
    const h = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && k === "y") { e.preventDefault(); redo(); return; }
      if (mod && k === "s") { e.preventDefault(); save(); return; }
      if (KEYS[k] && !mod) setTool(KEYS[k]);
      if (k === "[") setBrush((b) => Math.max(1, b - 4));
      if (k === "]") setBrush((b) => Math.min(200, b + 4));
      if (k === "escape") { setSelection(null); pathPts.current = []; render(); }
      if ((k === "delete" || k === "backspace") && selection && active()) {
        pushPixel();
        const c = ctxOf(active().canvas);
        c.save();
        c.globalCompositeOperation = "destination-out";
        if (!selection.mask) c.fillRect(selection.x, selection.y, selection.w, selection.h);
        c.restore();
        setSelection(null);
        render();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const al = active();
  const set = (obj, k, v) => { obj[k] = v; render(); bump(); };

  return (
    <div className="app">
      {/* Top Menu */}
      <header className="menu">
        <span className="logo">PF</span>
        <input type="text" className="pname" value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" />
        <button onClick={newDoc}>New</button>
        <label className="btn">
          Open image
          <input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && openImage(e.target.files[0])} />
        </label>
        <button onClick={save}>Save</button>
        <button onClick={() => exportImg("png")}>Export PNG</button>
        <button onClick={() => exportImg("jpeg")}>Export JPG</button>
        <span className="sp" />
        <button onClick={undo}>Undo</button>
        <button onClick={redo}>Redo</button>
        <button onClick={() => setZoom((z) => Math.max(0.1, +(z - 0.1).toFixed(2)))}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(4, +(z + 0.1).toFixed(2)))}>+</button>
      </header>

      <div className="body">
        {/* ===== LEFT SIDEBAR – Tools (Left → Right wrap) ===== */}
        <aside className="tools">
          {TOOLS.map(([id, icon, tip]) => (
            <button
              key={id}
              title={tip}
              aria-label={tip}
              className={tool === id ? "on" : ""}
              onClick={() => { setTool(id); pathPts.current = []; }}
            >
              {icon}
            </button>
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            title="Color"
            aria-label="Color"
          />
        </aside>

        {/* Canvas Stage */}
        <main className="stage">
          <div className="opts">
            <label>
              Size {brush}
              <input type="range" min="1" max="200" value={brush} onChange={(e) => setBrush(+e.target.value)} />
            </label>
            <label>
              Opacity {Math.round(alpha * 100)}%
              <input type="range" min="0.05" max="1" step="0.05" value={alpha} onChange={(e) => setAlpha(+e.target.value)} />
            </label>
            {(tool === "bucket" || tool === "magic") && (
              <label>
                Tolerance {tol}
                <input type="range" min="0" max="128" value={tol} onChange={(e) => setTol(+e.target.value)} />
              </label>
            )}
            {(tool === "rect" || tool === "ellipse" || tool === "pen") && (
              <label>
                <input type="checkbox" checked={fillShape} onChange={(e) => setFillShape(e.target.checked)} />
                Filled
              </label>
            )}
            {tool === "clone" && <span className="hint">Alt+Click = set source</span>}
            {tool === "pen" && <span className="hint">Click points · Double-click to close</span>}
            <label>{size.w} × {size.h}px</label>
            {selection && (
              <button onClick={() => { setSelection(null); render(); }}>Deselect</button>
            )}
          </div>

          <div className="scroll">
            <canvas
              ref={view}
              className="doc"
              width={size.w}
              height={size.h}
              style={{ width: size.w * zoom, height: size.h * zoom }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onDoubleClick={onDblClick}
            />
          </div>
        </main>

        {/* Right Panel */}
        <aside className="panel">
          <div className="tabs">
            {["layers", "adjust", "filters", "projects", "account"].map((t) => (
              <button
                key={t}
                className={tab === t ? "on" : ""}
                onClick={() => { setTab(t); if (t === "projects" && user) refreshProjects(); }}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "layers" && (
            <div className="pane">
              <div className="row">
                <button onClick={addLayer}>Add</button>
                <button onClick={dupLayer}>Duplicate</button>
                <button onClick={delLayer}>Delete</button>
                <button onClick={() => moveLayer(1)}>Up</button>
                <button onClick={() => moveLayer(-1)}>Down</button>
                <button onClick={mergeDown}>Merge down</button>
              </div>
              {al && (
                <div className="row">
                  <label>
                    Opacity {Math.round(al.opacity * 100)}%
                    <input type="range" min="0" max="1" step="0.01" value={al.opacity} onChange={(e) => set(al, "opacity", +e.target.value)} />
                  </label>
                  <label>
                    Blend
                    <select value={al.blend} onChange={(e) => set(al, "blend", e.target.value)}>
                      {BLENDS.map((b) => (
                        <option key={b} value={b}>{b === "source-over" ? "normal" : b}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              {[...layersRef.current].reverse().map((l) => (
                <div key={l.id} className={"layer" + (l.id === activeId ? " on" : "")} onClick={() => setActiveId(l.id)}>
                  <button title="Show / hide" onClick={(e) => { e.stopPropagation(); set(l, "visible", !l.visible); }}>
                    {l.visible ? "👁" : "—"}
                  </button>
                  <input type="text" value={l.name} onChange={(e) => set(l, "name", e.target.value)} aria-label="Layer name" />
                </div>
              ))}
            </div>
          )}

          {tab === "adjust" && (
            <div className="pane">
              <div className="row">
                {Object.keys(PIXEL_FX).map((k) => (
                  <button key={k} onClick={() => applyPixel(PIXEL_FX[k])}>{k}</button>
                ))}
              </div>
              <h4>Brightness / contrast / saturation</h4>
              <div className="row">
                <label>
                  Brightness {adj.b}
                  <input type="range" min="-100" max="100" value={adj.b} onChange={(e) => setAdj({ ...adj, b: +e.target.value })} />
                </label>
                <label>
                  Contrast {adj.c}
                  <input type="range" min="-100" max="100" value={adj.c} onChange={(e) => setAdj({ ...adj, c: +e.target.value })} />
                </label>
                <label>
                  Saturation {adj.s}
                  <input type="range" min="-100" max="100" value={adj.s} onChange={(e) => setAdj({ ...adj, s: +e.target.value })} />
                </label>
              </div>
              <button onClick={applyAdjust}>Apply to layer</button>
            </div>
          )}

          {tab === "filters" && (
            <div className="pane">
              <h4>Python (Pillow) filters — active layer par</h4>
              <label className="row">
                <span>Strength {fAmount}</span>
                <input type="range" min="1" max="10" value={fAmount} onChange={(e) => setFAmount(+e.target.value)} />
              </label>
              <div className="row">
                {SERVER_FILTERS.map(([id, label]) => (
                  <button key={id} onClick={() => serverFilter(id)}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {tab === "projects" && (
            <div className="pane">
              {!user && <span>Projects dekhne ke liye login karo.</span>}
              {user && projects.length === 0 && <span>Abhi koi saved project nahi. Save button dabao.</span>}
              {projects.map((p) => (
                <div key={p._id} className="proj" onClick={() => openProject(p._id)}>
                  {p.thumbnail ? <img src={p.thumbnail} alt="" /> : <img alt="" />}
                  <div style={{ flex: 1 }}>
                    {p.name}
                    <small>{p.width}×{p.height}</small>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); delProject(p._id); }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {tab === "account" && (
            <div className="pane">
              {user ? (
                <>
                  <span>Logged in: <b>{user.name}</b> ({user.email})</span>
                  <button onClick={logout}>Logout</button>
                </>
              ) : (
                <>
                  <input type="text" placeholder="Name (register ke liye)" value={auth.name} onChange={(e) => setAuth({ ...auth, name: e.target.value })} />
                  <input type="email" placeholder="Email" value={auth.email} onChange={(e) => setAuth({ ...auth, email: e.target.value })} />
                  <input type="password" placeholder="Password (6+ chars)" value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} />
                  <div className="row">
                    <button onClick={() => doAuth("login")}>Login</button>
                    <button onClick={() => doAuth("register")}>Register</button>
                  </div>
                </>
              )}
            </div>
          )}
        </aside>
      </div>

      {msg && <div className="toast" onClick={() => setMsg("")}>{msg}</div>}
    </div>
  );
}