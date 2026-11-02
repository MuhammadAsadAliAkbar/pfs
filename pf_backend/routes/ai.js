const express = require("express");
const router = express.Router();
const axios = require("axios");
const auth = require("../middleware/auth");
const Image = require("../models/Image");
const { uploadSingle } = require("../middleware/upload");
const cloudinary = require("../config/cloudinary"); // adjust path
const { Readable } = require("stream");
const fs = require("fs");
const path = require("path");

router.post("/generate", uploadSingle("referenceImage"), async (req, res) => {
  try {
    const { prompt, width = 1024, height = 1024 } = req.body;
    const cleanPrompt = (prompt || "").trim();

    const w = Math.min(Math.max(parseInt(width, 10) || 1024, 256), 1536);
    const h = Math.min(Math.max(parseInt(height, 10) || 1024, 256), 1536);

    const secretKey = process.env.POLLINATIONS_SECRET_KEY;
    const appKey = process.env.POLLINATIONS_APP_KEY;

    if (!secretKey && !appKey) {
      return res.status(500).json({
        success: false,
        message: "Pollinations API keys are missing",
      });
    }

    const encodedPrompt = encodeURIComponent(cleanPrompt);
    const randomSeed = Math.floor(Math.random() * 2147483647);

    const imageUrl =
      `https://gen.pollinations.ai/image/${encodedPrompt}` +
      `?width=${w}&height=${h}&model=flux&seed=${randomSeed}&nologo=true`;

    console.log("Generating Pollinations AI Image...");
    console.log("Prompt:", cleanPrompt);

    const headers = { Accept: "image/*" };
    if (secretKey) headers.Authorization = `Bearer ${secretKey}`;
    if (appKey) headers["X-API-Key"] = appKey;

    // 1. Generate image
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 120000,
      headers,
    });

    const contentType = response.headers["content-type"] || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      const errorText = Buffer.from(response.data).toString("utf8");
      throw new Error(errorText || "Pollinations did not return a valid image");
    }

    const imageBuffer = Buffer.from(response.data);
    const extension = contentType.includes("png") ? "png" : "jpg";

    // ========== 2. Try to save locally (only if possible) ==========
    let localImageUrl = null;
    let localFileName = null;

    // Detect if we are on a writable filesystem
    const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NODE_ENV === "production";

    if (!isServerless) {
      try {
        const uploadsDir = path.join(__dirname, "../uploads/images");
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        localFileName = `ai_${Date.now()}_${randomSeed}.${extension}`;
        const localFilePath = path.join(uploadsDir, localFileName);

        fs.writeFileSync(localFilePath, imageBuffer);
        localImageUrl = `/uploads/images/${localFileName}`;
        console.log("Saved locally:", localImageUrl);
      } catch (localErr) {
        console.warn("Could not save locally:", localErr.message);
      }
    } else {
      console.log("Serverless environment detected → skipping local save");
    }

    // ========== 3. Always upload to Cloudinary ==========
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "ai-generated",
          resource_type: "image",
          public_id: `ai_${Date.now()}_${randomSeed}`,
          format: extension,
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );

      const readable = new Readable();
      readable._read = () => {};
      readable.push(imageBuffer);
      readable.push(null);
      readable.pipe(stream);
    });

    console.log("Uploaded to Cloudinary:", uploadResult.secure_url);

    // ========== 4. Save to MongoDB ==========
    const savedImage = await Image.create({
      prompt: cleanPrompt,
      width: w,
      height: h,
      seed: randomSeed,

      // Local (only if available)
      localImage: localImageUrl,
      localFileName: localFileName,

      // Cloudinary (always available)
      image: uploadResult.secure_url,
      cloudinaryPublicId: uploadResult.public_id,
      cloudinaryUrl: uploadResult.secure_url,

      contentType,

      referenceImage: req.file ? `/uploads/images/${req.file.filename}` : null,
      referenceContentType: req.file ? req.file.mimetype : null,
      referenceFileName: req.file ? req.file.originalname : null,
    });

    // ========== 5. Success Response ==========
    return res.status(200).json({
      success: true,
      message: "Image generated successfully",
      _id: savedImage._id,
      image: uploadResult.secure_url,          // ← Frontend should use this
      localImage: localImageUrl,               // null on serverless
      cloudinaryPublicId: uploadResult.public_id,
      width: w,
      height: h,
      seed: randomSeed,
      prompt: cleanPrompt,
      hasReferenceImage: !!req.file,
      createdAt: savedImage.createdAt,
    });

  } catch (err) {
    console.error("Error:", err.message);

    let errorDetails = err.message;
    if (err.response?.data) {
      try {
        const raw = Buffer.from(err.response.data).toString("utf8");
        const parsed = JSON.parse(raw);
        errorDetails = parsed.error || parsed.message || raw;
      } catch {
        errorDetails = Buffer.from(err.response.data).toString("utf8").slice(0, 1500);
      }
    }

    return res.status(err.response?.status || 500).json({
      success: false,
      message: "AI image generation failed",
      error: errorDetails,
    });
  }
});


module.exports = router;

