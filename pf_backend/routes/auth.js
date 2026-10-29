const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/auth");

const sign = (u) => jwt.sign({ id: u._id }, process.env.JWT_SECRET || "dev-secret", { expiresIn: "7d" });
const pub = (u) => ({ id: u._id, email: u.email, name: u.name });

router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || password.length < 6)
      return res.status(400).json({ error: "Email aur 6+ character password zaroori hai" });
    if (await User.findOne({ email: email.toLowerCase() }))
      return res.status(409).json({ error: "Email already registered" });
    const u = await User.create({ email, name: name || email.split("@")[0], password: await bcrypt.hash(password, 10) });
    res.json({ token: sign(u), user: pub(u) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const u = await User.findOne({ email: (email || "").toLowerCase() });
    if (!u || !(await bcrypt.compare(password || "", u.password)))
      return res.status(401).json({ error: "Wrong email or password" });
    res.json({ token: sign(u), user: pub(u) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/me", auth, async (req, res) => {
  const u = await User.findById(req.userId);
  if (!u) return res.status(404).json({ error: "User not found" });
  res.json(pub(u));
});

module.exports = router;
