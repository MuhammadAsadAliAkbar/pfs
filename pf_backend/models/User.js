const { Schema, model } = require("mongoose");
module.exports = model("User", new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: String,
  password: { type: String, required: true },
}, { timestamps: true }));
