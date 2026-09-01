/**
 * Party popper bursts for newly arriving posts on the wall.
 *
 * Deliberately dependency-free and canvas-based: one shared full-viewport
 * canvas is created on first use, torn down once the last particle dies, and
 * the whole thing no-ops under prefers-reduced-motion.
 */

const COLORS = [
  "#E41D5C", // NORDEEP accent
  "#FF5C8A",
  "#F4524D",
  "#FFFFFF",
  "#7FD4FF",
  "#8DE8B4",
  "#C9A9FF",
];

const GRAVITY = 1500; // px/s²
const DRAG = 1.6;

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  width: number;
  height: number;
  color: string;
  age: number;
  life: number;
  ribbon: boolean;
};

let canvas: HTMLCanvasElement | null = null;
let context: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let frame = 0;
let previous = 0;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function sizeCanvas() {
  if (!canvas || !context) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:46;";
  document.body.appendChild(canvas);
  context = canvas.getContext("2d");
  sizeCanvas();
  window.addEventListener("resize", sizeCanvas, { passive: true });
}

function teardown() {
  window.removeEventListener("resize", sizeCanvas);
  canvas?.remove();
  canvas = null;
  context = null;
  particles = [];
  frame = 0;
}

function tick(timestamp: number) {
  if (!context || !canvas) return;

  const delta = Math.min(0.05, (timestamp - previous) / 1000 || 0);
  previous = timestamp;

  context.clearRect(0, 0, window.innerWidth, window.innerHeight);

  particles = particles.filter((p) => {
    p.age += delta;
    if (p.age >= p.life) return false;

    // Air resistance, then gravity.
    p.vx -= p.vx * DRAG * delta;
    p.vy -= p.vy * DRAG * delta;
    p.vy += GRAVITY * delta;

    p.x += p.vx * delta;
    p.y += p.vy * delta;
    p.rotation += p.spin * delta;

    if (p.y > window.innerHeight + 60) return false;

    const remaining = 1 - p.age / p.life;
    context!.save();
    context!.globalAlpha = Math.min(1, remaining * 2.2);
    context!.translate(p.x, p.y);
    context!.rotate(p.rotation);
    context!.fillStyle = p.color;
    // Ribbons squash and stretch as they tumble; squares stay square.
    const squash = p.ribbon ? Math.cos(p.rotation * 1.4) : 1;
    context!.fillRect(
      -p.width / 2,
      -p.height / 2,
      p.width,
      Math.max(1, p.height * squash),
    );
    context!.restore();
    return true;
  });

  if (particles.length === 0) {
    teardown();
    return;
  }
  frame = window.requestAnimationFrame(tick);
}

/**
 * Fires a cone of confetti from (x, y).
 *
 * @param angle Direction in radians. 0 points right, Math.PI points left.
 * @param spread Width of the cone in radians.
 */
export function burst(
  x: number,
  y: number,
  {
    angle = -Math.PI / 2,
    spread = Math.PI / 3,
    count = 60,
    power = 900,
  }: { angle?: number; spread?: number; count?: number; power?: number } = {},
): void {
  if (typeof window === "undefined" || prefersReducedMotion()) return;
  // Nobody is watching a background tab, and the animation loop is suspended
  // there, so particles would just pile up on the canvas until it is shown.
  if (document.hidden) return;

  ensureCanvas();
  if (!context) return;

  for (let i = 0; i < count; i += 1) {
    const theta = angle + (Math.random() - 0.5) * spread;
    const speed = power * (0.45 + Math.random() * 0.75);
    const ribbon = Math.random() > 0.45;

    particles.push({
      x,
      y,
      vx: Math.cos(theta) * speed,
      vy: Math.sin(theta) * speed,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 18,
      width: ribbon ? 4 + Math.random() * 3 : 6 + Math.random() * 4,
      height: ribbon ? 10 + Math.random() * 8 : 6 + Math.random() * 4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      age: 0,
      life: 1.4 + Math.random() * 1.2,
      ribbon,
    });
  }

  if (!frame) {
    previous = performance.now();
    frame = window.requestAnimationFrame(tick);
  }
}

/** Cancels everything in flight — used when the wall unmounts. */
export function clearConfetti(): void {
  if (frame) window.cancelAnimationFrame(frame);
  teardown();
}
