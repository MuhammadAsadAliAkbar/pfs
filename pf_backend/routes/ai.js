const express = require("express");
const router = express.Router();
const axios = require("axios");
const auth = require("../middleware/auth");


// POST: Generate AI Image
router.post("/generate", async (req, res) => {
  try {
    const {
      prompt,
      width = 1024,
      height = 1024,
    } = req.body;

    // 1. Validate prompt
    if (
      !prompt ||
      typeof prompt !== "string" ||
      prompt.trim().length < 3
    ) {
      return res.status(400).json({
        success: false,
        message: "Prompt must contain at least 3 characters",
      });
    }

    // 2. Validate dimensions
    const w = Math.min(
      Math.max(parseInt(width, 10) || 1024, 256),
      1536
    );

    const h = Math.min(
      Math.max(parseInt(height, 10) || 1024, 256),
      1536
    );

    // 3. Pollinations API Keys
    const secretKey = process.env.POLLINATIONS_SECRET_KEY;
    const appKey = process.env.POLLINATIONS_APP_KEY;

    if (!secretKey && !appKey) {
      return res.status(500).json({
        success: false,
        message: "Pollinations API keys are missing",
      });
    }

    // 4. Prepare prompt
    const cleanPrompt = prompt.trim();
    const encodedPrompt = encodeURIComponent(cleanPrompt);

    // 5. Generate valid random seed
    // Maximum allowed: 2147483647
    const randomSeed = Math.floor(
      Math.random() * 2147483647
    );

    // 6. Pollinations API URL
    const imageUrl =
      `https://gen.pollinations.ai/image/${encodedPrompt}` +
      `?width=${w}` +
      `&height=${h}` +
      `&model=flux` +
      `&seed=${randomSeed}`;

    console.log("Generating Pollinations AI Image...");
    console.log("Prompt:", cleanPrompt);
    console.log("Dimensions:", `${w}x${h}`);
    console.log("Seed:", randomSeed);

    // 7. Configure authentication headers
    const headers = {
      Accept: "image/*",
    };

    if (secretKey) {
      headers.Authorization = `Bearer ${secretKey}`;
    }

    // Only use this if your Pollinations account/API
    // documentation specifically requires X-API-Key.
    if (appKey) {
      headers["X-API-Key"] = appKey;
    }

    // 8. Generate image
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 120000,
      headers,
    });

    // 9. Validate image response
    const contentType =
      response.headers["content-type"] || "image/jpeg";

    if (!contentType.startsWith("image/")) {
      throw new Error(
        "Pollinations API did not return a valid image"
      );
    }

    // 10. Convert image to Base64
    const base64 = Buffer.from(response.data).toString("base64");

    const dataUrl = `data:${contentType};base64,${base64}`;

    // 11. Success response
    return res.status(200).json({
      success: true,
      message: "Image generated successfully",
      image: dataUrl,
      width: w,
      height: h,
      seed: randomSeed,
      prompt: cleanPrompt,
    });

  } catch (err) {
    console.error("Pollinations AI Error:", err.message);

    let errorDetails = err.message;

    if (err.response?.data) {
      const rawData = Buffer.from(
        err.response.data
      ).toString("utf8");

      console.error("API Error Response:", rawData);

      try {
        const parsed = JSON.parse(rawData);

        errorDetails =
          parsed.error ||
          parsed.message ||
          parsed.details ||
          rawData;

      } catch {
        errorDetails = rawData.slice(0, 2000);
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

