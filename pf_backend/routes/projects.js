const router = require("express").Router();
const Project = require("../models/Project");
const auth = require("../middleware/auth");

router.use(auth);

router.get("/", async (req, res) => {
  const list = await Project.find({ owner: req.userId })
    .select("name width height thumbnail updatedAt")
    .sort({ updatedAt: -1 });
  res.json(list);
});

router.post("/", async (req, res) => {
  try {
    const { name, width, height, layers, thumbnail } = req.body;
    res.json(await Project.create({ owner: req.userId, name, width, height, layers, thumbnail }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/:id", async (req, res) => {
  const p = await Project.findOne({ _id: req.params.id, owner: req.userId });
  if (!p) return res.status(404).json({ error: "Project not found" });
  res.json(p);
});

router.put("/:id", async (req, res) => {
  try {
    const { name, width, height, layers, thumbnail } = req.body;
    const p = await Project.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      { name, width, height, layers, thumbnail },
      { new: true }
    );
    if (!p) return res.status(404).json({ error: "Project not found" });
    res.json(p);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete("/:id", async (req, res) => {
  await Project.deleteOne({ _id: req.params.id, owner: req.userId });
  res.json({ ok: true });
});

module.exports = router;
