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
    const {
      prompt,
      width = 1024,
      height = 1024,
    } = req.body;
    const cleanPrompt = (prompt || "").trim();

   // 2. Validate dimensions
    const w = Math.min(Math.max(parseInt(width, 10) || 1024, 256), 1536);
    const h = Math.min(Math.max(parseInt(height, 10) || 1024, 256), 1536);

    // 3. Pollinations API Keys
    const secretKey = process.env.POLLINATIONS_SECRET_KEY;
    const appKey = process.env.POLLINATIONS_APP_KEY;

    if (!secretKey && !appKey) {
      return res.status(500).json({
        success: false,
        message: "Pollinations API keys are missing",
      });
    }

    // 4. Prepare encoded prompt
    const encodedPrompt = encodeURIComponent(cleanPrompt);

    // 5. Generate random seed
    const randomSeed = Math.floor(Math.random() * 2147483647);

    // 6. Pollinations API URL
    const imageUrl =
      `https://gen.pollinations.ai/image/${encodedPrompt}` +
      `?width=${w}` +
      `&height=${h}` +
      `&model=flux` +
      `&seed=${randomSeed}` +
      `&nologo=true`;

    console.log("Generating Pollinations AI Image...");
    console.log("Prompt:", cleanPrompt);
    console.log("Dimensions:", `${w}x${h}`);
    console.log("Seed:", randomSeed);
    console.log("Reference image:", req.file ? req.file.originalname : "none");

    // 7. Configure authentication headers
    const headers = {
      Accept: "image/*",
    };

    if (secretKey) {
      headers.Authorization = `Bearer ${secretKey}`;
    }
    if (appKey) {
      headers["X-API-Key"] = appKey;
    }

    // 8. Generate image from Pollinations
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 120000,
      headers,
    });

    // 9. Validate image response
    const contentType = response.headers["content-type"] || "image/jpeg";

    if (!contentType.startsWith("image/")) {
      const errorText = Buffer.from(response.data).toString("utf8");
      throw new Error(errorText || "Pollinations API did not return a valid image");
    }

    const imageBuffer = Buffer.from(response.data);

    // ========== 10. Save to Local Multer Folder (uploads/images) ==========
    const uploadsDir = path.join(__dirname, "../uploads/images"); // adjust if needed

    // Create folder if it doesn't exist
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const extension = contentType.includes("png") ? "png" : "jpg";
    const localFileName = `ai_${Date.now()}_${randomSeed}.${extension}`;
    const localFilePath = path.join(uploadsDir, localFileName);

    // Write the buffer to disk
    fs.writeFileSync(localFilePath, imageBuffer);

    const localImageUrl = `/uploads/images/${localFileName}`;
    console.log("Saved locally:", localImageUrl);

    // ========== 11. Upload to Cloudinary ==========
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

    // ========== 12. Save to MongoDB ==========
    const savedImage = await Image.create({
      prompt: cleanPrompt,
      width: w,
      height: h,
      seed: randomSeed,

      // Local path
      localImage: localImageUrl,
      localFileName: localFileName,

      // Cloudinary data
      image: uploadResult.secure_url,               // main URL (frontend will use this)
      cloudinaryPublicId: uploadResult.public_id,
      cloudinaryUrl: uploadResult.secure_url,

      contentType,

      // Reference image (if any)
      referenceImage: req.file
        ? `/uploads/images/${req.file.filename}`
        : null,
      referenceContentType: req.file ? req.file.mimetype : null,
      referenceFileName: req.file ? req.file.originalname : null,
    });

    // 13. Success response
    return res.status(200).json({
      success: true,
      message: "Image generated, saved locally & uploaded to Cloudinary",

      _id: savedImage._id,

      // Main image (Cloudinary)
      image: uploadResult.secure_url,

      // Local path also
      localImage: localImageUrl,

      cloudinaryPublicId: uploadResult.public_id,

      width: w,
      height: h,
      seed: randomSeed,
      prompt: cleanPrompt,

      hasReferenceImage: !!req.file,
      createdAt: savedImage.createdAt,
    });

  } catch (err) {
    console.error("Pollinations / Cloudinary Error:", err.message);

    let errorDetails = err.message;

    if (err.response?.data) {
      try {
        const rawData = Buffer.from(err.response.data).toString("utf8");
        console.error("API Error Response:", rawData);

        const parsed = JSON.parse(rawData);
        errorDetails =
          parsed.error ||
          parsed.message ||
          parsed.details ||
          rawData;
      } catch {
        errorDetails = Buffer.from(err.response.data).toString("utf8").slice(0, 2000);
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

