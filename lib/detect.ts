/**
 * On-device object detection for the table scan: MediaPipe's EfficientDet-Lite0
 * (80 COCO classes), with the model and its wasm runtime served from this
 * site. The content-security policy names every origin this app may reach,
 * and a detector that fetched from a CDN would be the one thing on the page
 * that quietly broke it.
 *
 * Client only: it needs a canvas and WebAssembly.
 */
import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";

export type Detection = { label: string; score: number; box: { x: number; y: number; w: number; h: number } };

let detector: Promise<ObjectDetector> | null = null;

/**
 * The runtime writes its own INFO lines ("Created TensorFlow Lite XNNPACK
 * delegate") to stderr, which the browser shows as errors. Demote exactly
 * those while it runs; anything else it prints stays an error.
 */
async function quietInfo<T>(fn: () => Promise<T> | T): Promise<T> {
  const error = console.error;
  console.error = (...a: unknown[]) => (typeof a[0] === "string" && a[0].startsWith("INFO: ") ? console.info(...a) : error(...a));
  try {
    return await fn();
  } finally {
    console.error = error;
  }
}

export function loadDetector(): Promise<ObjectDetector> {
  detector ??= quietInfo(async () => {
    const fileset = await FilesetResolver.forVisionTasks(new URL("/vision/wasm", location.origin).href);
    return ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: new URL("/vision/efficientdet_lite0.tflite", location.origin).href, delegate: "CPU" },
      runningMode: "IMAGE",
      scoreThreshold: 0.35,
      maxResults: 12,
    });
  }).catch((e) => {
    detector = null;
    throw e;
  });
  return detector;
}

/** Objects in a frame, best first. People and the table itself are not task objects. */
export async function detect(source: HTMLCanvasElement): Promise<Detection[]> {
  const d = await loadDetector();
  const out = await quietInfo(() => d.detect(source));
  return out.detections
    .map((x) => ({
      label: x.categories[0].categoryName,
      score: x.categories[0].score,
      box: { x: x.boundingBox!.originX, y: x.boundingBox!.originY, w: x.boundingBox!.width, h: x.boundingBox!.height },
    }))
    .filter((x) => x.label !== "person" && x.label !== "dining table")
    .sort((a, b) => b.score - a.score);
}

/** The average colour at the middle of a box, as hex. */
export function sampleColour(canvas: HTMLCanvasElement, b: { x: number; y: number; w: number; h: number }): string {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const x = Math.max(0, Math.round(b.x + b.w * 0.3)), y = Math.max(0, Math.round(b.y + b.h * 0.3));
  const w = Math.max(1, Math.min(Math.round(b.w * 0.4), canvas.width - x)), h = Math.max(1, Math.min(Math.round(b.h * 0.4), canvas.height - y));
  const d = ctx.getImageData(x, y, w, h).data;
  let r = 0, g = 0, bl = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    bl += d[i + 2];
    n++;
  }
  const hex = (v: number) => Math.round(v / Math.max(1, n)).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(bl)}`;
}

/**
 * The library prop a detected object is drawn as. The station loads models,
 * not photographs, so a "cup" on the real table is drawn as the Glass; an
 * object with no counterpart is left to the funder's own pick.
 */
const COCO_TO_PROP: Record<string, string> = {
  cup: "cup", "wine glass": "cup", bottle: "bottle", bowl: "bowl", spoon: "spoon", fork: "spoon", knife: "spoon",
  banana: "banana", apple: "apple", orange: "lemon", book: "book", "cell phone": "phone", remote: "phone",
  "sports ball": "ball", scissors: "pliers", toothbrush: "toothpaste", laptop: "laptop", sink: "sink",
  keyboard: "tray", "teddy bear": "block", clock: "plate", vase: "pen_cup",
};
export const propFor = (label: string): string | null => COCO_TO_PROP[label.toLowerCase()] ?? null;
