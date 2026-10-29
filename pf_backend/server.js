require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000" }));
app.use(express.json({ limit: "100mb" }));

app.get("/api/health", (_, res) => res.json({ ok: true }));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/projects", require("./routes/projects"));
app.use("/api/image", require("./routes/image"));

const PORT = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/photoeditor")
  .then(() => app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`)))
  .catch((e) => { console.error("MongoDB connection failed:", e.message); process.exit(1); });
