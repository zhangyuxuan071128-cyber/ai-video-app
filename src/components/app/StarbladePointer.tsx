import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

gsap.registerPlugin(useGSAP);

type TrailPoint = {
  x: number;
  y: number;
  born: number;
  ttl: number;
  width: number;
  strength: number;
};

type Spark = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  born: number;
  ttl: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
};

type Sigil = {
  x: number;
  y: number;
  born: number;
  ttl: number;
  rotation: number;
  strength: number;
};

type PendingPointer = {
  x: number;
  y: number;
  time: number;
  interactive: boolean;
};

const TAU = Math.PI * 2;
const MAX_TRAIL_POINTS = 46;
const MAX_SPARKS = 34;
const INTERACTIVE_SELECTOR = "button, input, select, textarea, summary, a, label, [role='button']";
const MODAL_SELECTOR = "dialog[open], [aria-modal='true'], .uw-platform-wizard-layer, .uw-dialog-layer, .sx-modal";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function pointLife(point: TrailPoint, now: number) {
  return clamp(1 - (now - point.born) / point.ttl, 0, 1);
}

function drawTrailSegment(
  context: CanvasRenderingContext2D,
  from: TrailPoint,
  to: TrailPoint,
  life: number,
  headProgress: number,
) {
  const width = (from.width + to.width) * 0.5;
  const strength = (from.strength + to.strength) * 0.5;
  const alpha = life * life * strength;

  context.globalCompositeOperation = "source-over";
  context.lineCap = "butt";
  context.lineJoin = "round";
  context.shadowBlur = 8;
  context.shadowColor = `rgba(36, 12, 86, ${0.56 * alpha})`;
  context.strokeStyle = `rgba(1, 2, 10, ${0.34 * alpha})`;
  context.lineWidth = width * 4.8 + 7;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();

  context.globalCompositeOperation = "lighter";
  context.shadowBlur = 18;
  context.shadowColor = `rgba(105, 70, 255, ${0.86 * alpha})`;
  context.strokeStyle = `rgba(105, 68, 255, ${0.2 * alpha})`;
  context.lineWidth = width * 4.2;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();

  const colorProgress = Math.pow(headProgress, 1.7);
  const red = Math.round(142 + colorProgress * 94);
  const green = Math.round(101 + colorProgress * 126);
  const blue = 255;
  context.shadowBlur = 10;
  context.shadowColor = `rgba(129, 173, 255, ${0.9 * alpha})`;
  context.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${0.9 * alpha})`;
  context.lineWidth = Math.max(1.2, width * 1.45);
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();

  context.shadowBlur = 4;
  context.shadowColor = `rgba(255, 255, 255, ${alpha})`;
  context.strokeStyle = `rgba(244, 246, 255, ${(0.42 + colorProgress * 0.42) * alpha})`;
  context.lineWidth = Math.max(0.55, width * 0.28);
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
}

function drawSpark(context: CanvasRenderingContext2D, spark: Spark, now: number) {
  const life = clamp(1 - (now - spark.born) / spark.ttl, 0, 1);
  if (life <= 0) return;

  context.save();
  context.translate(spark.x, spark.y);
  context.rotate(spark.rotation);
  context.globalCompositeOperation = "lighter";
  context.globalAlpha = life * life;
  context.shadowBlur = 7;
  context.shadowColor = "rgba(128, 101, 255, 0.9)";
  context.strokeStyle = spark.size > 1.8 ? "#d9efff" : "#9c83ff";
  context.lineWidth = 0.75;
  context.beginPath();
  context.moveTo(-spark.size * 2.6, 0);
  context.lineTo(spark.size * 1.2, 0);
  context.stroke();
  context.restore();
}

function drawSigil(context: CanvasRenderingContext2D, sigil: Sigil, now: number) {
  const progress = clamp((now - sigil.born) / sigil.ttl, 0, 1);
  const alpha = Math.sin(progress * Math.PI) * sigil.strength;
  if (alpha <= 0) return;

  const radius = 15 + progress * 38;
  context.save();
  context.translate(sigil.x, sigil.y);
  context.rotate(sigil.rotation + progress * 0.48);
  context.globalCompositeOperation = "lighter";
  context.globalAlpha = alpha;
  context.shadowBlur = 11;
  context.shadowColor = "rgba(112, 77, 255, 0.88)";
  context.strokeStyle = "rgba(176, 163, 255, 0.78)";
  context.lineWidth = 0.8;
  context.setLineDash([2, 5, 11, 4]);
  context.beginPath();
  context.arc(0, 0, radius, 0, TAU);
  context.stroke();

  context.rotate(-progress * 1.1);
  context.strokeStyle = "rgba(126, 205, 255, 0.72)";
  context.setLineDash([1, 8]);
  context.beginPath();
  context.arc(0, 0, radius * 0.66, 0, TAU);
  context.stroke();

  context.setLineDash([]);
  context.strokeStyle = "rgba(232, 227, 255, 0.86)";
  for (let index = 0; index < 4; index += 1) {
    context.rotate(Math.PI / 2);
    context.beginPath();
    context.moveTo(radius * 0.46, 0);
    context.lineTo(radius * 0.82, 0);
    context.stroke();
  }
  context.restore();
}

export function StarbladePointer() {
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);

  useGSAP(
    (_context, contextSafe) => {
      const layer = layerRef.current;
      const canvas = canvasRef.current;
      const core = coreRef.current;
      if (!layer || !canvas || !core || !contextSafe || typeof window.matchMedia !== "function") return undefined;
      if (typeof CanvasRenderingContext2D === "undefined") return undefined;

      const context = canvas.getContext("2d", { alpha: true });
      if (!context) return undefined;
      const renderContext: CanvasRenderingContext2D = context;
      const renderLayer: HTMLDivElement = layer;

      const finePointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
      const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      const forcedColorsQuery = window.matchMedia("(forced-colors: active)");
      const trail: TrailPoint[] = [];
      const sparks: Spark[] = [];
      const sigils: Sigil[] = [];
      let pendingPointer: PendingPointer | null = null;
      let previousPointer: PendingPointer | null = null;
      let frame = 0;
      let width = 1;
      let height = 1;
      let pixelRatio = 1;
      let lastFrameTime = performance.now();
      let lastAngle = 0;
      let available = false;

      gsap.set(core, { xPercent: -50, yPercent: -50, opacity: 0, visibility: "visible", transformOrigin: "50% 50%" });
      const coreX = gsap.quickTo(core, "x", { duration: 0.075, ease: "power3.out", overwrite: "auto" });
      const coreY = gsap.quickTo(core, "y", { duration: 0.075, ease: "power3.out", overwrite: "auto" });
      const coreRotation = gsap.quickTo(core, "rotation", { duration: 0.13, ease: "power3.out", overwrite: "auto" });
      const coreScaleX = gsap.quickTo(core, "scaleX", { duration: 0.16, ease: "power3.out", overwrite: "auto" });
      const coreScaleY = gsap.quickTo(core, "scaleY", { duration: 0.16, ease: "power3.out", overwrite: "auto" });
      const coreOpacity = gsap.quickTo(core, "opacity", { duration: 0.14, ease: "power2.out", overwrite: "auto" });

      const clearEffect = () => {
        trail.length = 0;
        sparks.length = 0;
        sigils.length = 0;
        pendingPointer = null;
        previousPointer = null;
        renderContext.clearRect(0, 0, width, height);
        coreOpacity(0);
        renderLayer.dataset.active = "false";
      };

      const resize = () => {
        width = Math.max(1, window.innerWidth);
        height = Math.max(1, window.innerHeight);
        pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      };

      const isReducedByProduct = () => document.documentElement.dataset.sxReducedMotion === "true";

      const syncAvailability = () => {
        available = finePointerQuery.matches
          && !reducedMotionQuery.matches
          && !forcedColorsQuery.matches
          && !isReducedByProduct();
        layer.dataset.enabled = available ? "true" : "false";
        if (!available) {
          if (frame) window.cancelAnimationFrame(frame);
          frame = 0;
          clearEffect();
        }
      };

      const queueFrame = () => {
        if (!frame && available && !document.hidden) frame = window.requestAnimationFrame(render);
      };

      const spawnSparks = (pointer: PendingPointer, speed: number, angle: number) => {
        if (speed < 0.34 || pointer.interactive) return;
        const amount = speed > 0.78 ? 2 : 1;
        for (let index = 0; index < amount; index += 1) {
          const normal = angle + (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2 + Math.random() * 0.34);
          const velocity = 26 + speed * 58 + Math.random() * 34;
          sparks.push({
            x: pointer.x,
            y: pointer.y,
            velocityX: Math.cos(normal) * velocity,
            velocityY: Math.sin(normal) * velocity,
            born: pointer.time,
            ttl: 340 + Math.random() * 250,
            size: 0.8 + Math.random() * 1.7,
            rotation: angle + (Math.random() - 0.5) * 0.42,
            rotationSpeed: (Math.random() - 0.5) * 4.8,
          });
        }
        if (sparks.length > MAX_SPARKS) sparks.splice(0, sparks.length - MAX_SPARKS);
      };

      const consumePointer = (pointer: PendingPointer) => {
        coreX(pointer.x);
        coreY(pointer.y);

        if (!previousPointer) {
          previousPointer = pointer;
          coreOpacity(pointer.interactive ? 0.46 : 0.92);
          const scale = pointer.interactive ? 0.72 : 1;
          coreScaleX(scale);
          coreScaleY(scale);
          return;
        }

        const deltaX = pointer.x - previousPointer.x;
        const deltaY = pointer.y - previousPointer.y;
        const distance = Math.hypot(deltaX, deltaY);
        const elapsed = Math.max(8, pointer.time - previousPointer.time);
        const speed = clamp(distance / elapsed / 1.7, 0, 1);
        if (distance > 0.45) lastAngle = Math.atan2(deltaY, deltaX);

        coreRotation(lastAngle * (180 / Math.PI) + 45);
        coreOpacity(pointer.interactive ? 0.42 : 0.96);
        const scale = pointer.interactive ? 0.68 : 0.88 + speed * 0.34;
        coreScaleX(scale);
        coreScaleY(scale);

        if (distance >= 1.5) {
          const steps = Math.min(8, Math.max(1, Math.ceil(distance / 7)));
          const strength = pointer.interactive ? 0.5 : 1;
          for (let index = 1; index <= steps; index += 1) {
            const progress = index / steps;
            trail.push({
              x: previousPointer.x + deltaX * progress,
              y: previousPointer.y + deltaY * progress,
              born: pointer.time - (steps - index) * 4,
              ttl: 520 + speed * 310,
              width: (1.05 + speed * 2.85) * strength,
              strength,
            });
          }
          if (trail.length > MAX_TRAIL_POINTS) trail.splice(0, trail.length - MAX_TRAIL_POINTS);
          spawnSparks(pointer, speed, lastAngle);
        }

        previousPointer = pointer;
      };

      function render(now: number) {
        frame = 0;
        if (!available || document.hidden) return;

        const delta = Math.min((now - lastFrameTime) / 1000, 0.034);
        lastFrameTime = now;
        if (pendingPointer) {
          consumePointer(pendingPointer);
          pendingPointer = null;
        }

        renderContext.clearRect(0, 0, width, height);
        while (trail.length && pointLife(trail[0], now) <= 0) trail.shift();
        while (sparks.length && now - sparks[0].born >= sparks[0].ttl) sparks.shift();
        while (sigils.length && now - sigils[0].born >= sigils[0].ttl) sigils.shift();

        for (let index = 1; index < trail.length; index += 1) {
          const from = trail[index - 1];
          const to = trail[index];
          const life = Math.min(pointLife(from, now), pointLife(to, now));
          drawTrailSegment(renderContext, from, to, life, index / Math.max(1, trail.length - 1));
        }

        for (const spark of sparks) {
          spark.x += spark.velocityX * delta;
          spark.y += spark.velocityY * delta;
          spark.velocityX *= Math.pow(0.07, delta);
          spark.velocityY *= Math.pow(0.07, delta);
          spark.rotation += spark.rotationSpeed * delta;
          drawSpark(renderContext, spark, now);
        }

        for (const sigil of sigils) drawSigil(renderContext, sigil, now);
        renderContext.globalCompositeOperation = "source-over";
        renderContext.globalAlpha = 1;
        renderContext.shadowBlur = 0;
        renderContext.setLineDash([]);

        const hasAfterglow = trail.length > 1 || sparks.length > 0 || sigils.length > 0;
        renderLayer.dataset.active = hasAfterglow || previousPointer ? "true" : "false";
        if (pendingPointer || hasAfterglow) queueFrame();
      }

      const onPointerMove = contextSafe((event: PointerEvent) => {
        if (!available || event.pointerType !== "mouse" || document.querySelector(MODAL_SELECTOR)) {
          if (previousPointer || trail.length || sparks.length || sigils.length) clearEffect();
          return;
        }
        const target = event.target instanceof Element ? event.target : null;
        pendingPointer = {
          x: event.clientX,
          y: event.clientY,
          time: performance.now(),
          interactive: Boolean(target?.closest(INTERACTIVE_SELECTOR)),
        };
        queueFrame();
      });

      const onPointerDown = contextSafe((event: PointerEvent) => {
        if (!available || event.pointerType !== "mouse" || event.button !== 0 || document.querySelector(MODAL_SELECTOR)) return;
        const target = event.target instanceof Element ? event.target : null;
        sigils.push({
          x: event.clientX,
          y: event.clientY,
          born: performance.now(),
          ttl: 620,
          rotation: lastAngle,
          strength: target?.closest(INTERACTIVE_SELECTOR) ? 0.52 : 0.9,
        });
        if (sigils.length > 4) sigils.shift();
        queueFrame();
      });

      const onPointerLeave = contextSafe(() => {
        pendingPointer = null;
        previousPointer = null;
        coreOpacity(0);
        queueFrame();
      });

      const onVisibilityChange = () => {
        if (document.hidden) {
          if (frame) window.cancelAnimationFrame(frame);
          frame = 0;
          clearEffect();
        }
      };

      const attributeObserver = new MutationObserver(syncAvailability);
      attributeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-sx-reduced-motion"],
      });

      resize();
      syncAvailability();
      window.addEventListener("resize", resize, { passive: true });
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerdown", onPointerDown, { passive: true });
      window.addEventListener("pointerleave", onPointerLeave);
      window.addEventListener("blur", onPointerLeave);
      document.addEventListener("visibilitychange", onVisibilityChange);
      finePointerQuery.addEventListener("change", syncAvailability);
      reducedMotionQuery.addEventListener("change", syncAvailability);
      forcedColorsQuery.addEventListener("change", syncAvailability);

      return () => {
        if (frame) window.cancelAnimationFrame(frame);
        attributeObserver.disconnect();
        window.removeEventListener("resize", resize);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointerleave", onPointerLeave);
        window.removeEventListener("blur", onPointerLeave);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        finePointerQuery.removeEventListener("change", syncAvailability);
        reducedMotionQuery.removeEventListener("change", syncAvailability);
        forcedColorsQuery.removeEventListener("change", syncAvailability);
        gsap.killTweensOf(core);
      };
    },
    { scope: layerRef },
  );

  return (
    <div ref={layerRef} className="sx-starblade-pointer" data-active="false" data-enabled="false" aria-hidden="true">
      <canvas ref={canvasRef} className="sx-starblade-pointer__canvas" />
      <div ref={coreRef} className="sx-starblade-pointer__core">
        <span className="sx-starblade-pointer__void" />
        <span className="sx-starblade-pointer__flare" />
        <span className="sx-starblade-pointer__diamond" />
      </div>
    </div>
  );
}

export default StarbladePointer;
