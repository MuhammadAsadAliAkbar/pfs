const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema(
  {
    prompt: {
      type: String,
      required: true,
      trim: true,
    },
    width: {
      type: Number,
      required: true,
    },
    height: {
      type: Number,
      required: true,
    },
    seed: {
      type: Number,
      required: true,
    },
    image: {
      type: String, // Base64 Data URL
      required: true,
    },
    contentType: {
      type: String,
      default: "image/jpeg",
    },

    referenceImage: { type: String, default: null },
    referenceContentType: { type: String, default: null },
    referenceFileName: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Image", imageSchema);