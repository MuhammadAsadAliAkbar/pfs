const router = require("express").Router();

// Forwards filter requests to the Python (FastAPI + Pillow) service
router.post("/filter", async (req, res) => {
  try {
    const r = await fetch((process.env.PYTHON_URL || "http://127.0.0.1:8000") + "/filter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const j = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: j.detail || "Filter failed" });
    res.json(j);
  } catch {
    res.status(502).json({ error: "Python image service chal nahi rahi (port 8000)" });
  }
});

module.exports = router;
