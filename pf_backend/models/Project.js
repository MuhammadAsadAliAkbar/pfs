const { Schema, model } = require("mongoose");
const LayerSchema = new Schema({
  name: String,
  visible: { type: Boolean, default: true },
  opacity: { type: Number, default: 1 },
  blend: { type: String, default: "source-over" },
  data: String, // PNG data URL
}, { _id: false });

module.exports = model("Project", new Schema({
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, default: "Untitled" },
  width: Number,
  height: Number,
  layers: [LayerSchema],
  thumbnail: String,
}, { timestamps: true }));
