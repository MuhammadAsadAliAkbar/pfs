"""Image processing microservice (FastAPI + Pillow).
Run: uvicorn main:app --port 8000 --reload
"""
import base64
import io

from fastapi import FastAPI, HTTPException
from PIL import Image, ImageFilter, ImageOps
from pydantic import BaseModel

app = FastAPI(title="Photo Editor Image Service")


class FilterRequest(BaseModel):
    image: str          # PNG data URL
    filter: str
    amount: float = 3   # strength slider (1-10)


def decode(data_url: str) -> Image.Image:
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(data_url))).convert("RGBA")


def encode(im: Image.Image) -> str:
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def on_rgb(fn):
    """Apply a filter to RGB only and keep the layer's alpha channel intact."""
    def wrapper(im: Image.Image, x: float) -> Image.Image:
        r, g, b, a = im.split()
        out = fn(Image.merge("RGB", (r, g, b)), x)
        r2, g2, b2 = out.split()
        return Image.merge("RGBA", (r2, g2, b2, a))
    return wrapper


def pixelate(im: Image.Image, x: float) -> Image.Image:
    block = max(2, int(x * 4))
    w, h = im.size
    small = im.resize((max(1, w // block), max(1, h // block)), Image.NEAREST)
    return small.resize((w, h), Image.NEAREST)


FILTERS = {
    "blur": lambda im, x: im.filter(ImageFilter.GaussianBlur(x * 2)),
    "motion_blur": lambda im, x: im.filter(ImageFilter.BoxBlur(x)),
    "sharpen": lambda im, x: im.filter(ImageFilter.UnsharpMask(radius=2, percent=int(80 * x), threshold=2)),
    "smooth": lambda im, x: im.filter(ImageFilter.SMOOTH_MORE),
    "detail": lambda im, x: im.filter(ImageFilter.DETAIL),
    "edges": on_rgb(lambda im, x: im.filter(ImageFilter.FIND_EDGES)),
    "emboss": on_rgb(lambda im, x: im.filter(ImageFilter.EMBOSS)),
    "contour": on_rgb(lambda im, x: im.filter(ImageFilter.CONTOUR)),
    "posterize": on_rgb(lambda im, x: ImageOps.posterize(im, max(1, min(8, int(9 - x))))),
    "solarize": on_rgb(lambda im, x: ImageOps.solarize(im, threshold=max(0, 255 - int(x * 25)))),
    "autocontrast": on_rgb(lambda im, x: ImageOps.autocontrast(im, cutoff=1)),
    "equalize": on_rgb(lambda im, x: ImageOps.equalize(im)),
    "pixelate": pixelate,
}


@app.get("/")
def health():
    return {"ok": True, "filters": sorted(FILTERS)}


@app.post("/filter")
def apply_filter(req: FilterRequest):
    fn = FILTERS.get(req.filter)
    if fn is None:
        raise HTTPException(status_code=400, detail=f"Unknown filter: {req.filter}")
    try:
        im = decode(req.image)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image data")
    return {"image": encode(fn(im, max(0.5, min(10, req.amount))))}
