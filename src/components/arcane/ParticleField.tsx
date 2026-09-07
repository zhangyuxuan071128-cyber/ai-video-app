import { useEffect, useRef } from "react";
import { motionConfig } from "../../config/motionConfig";

type ParticleKind = "dust" | "streak" | "fragment";

type Particle = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  opacity: number;
  phase: number;
  phaseSpeed: number;
  rotation: number;
  rotationSpeed: number;
  kind: ParticleKind;
};

type ParticleFieldProps = {
  className?: string;
};

const TAU = Math.PI * 2;

function makeParticle(width: number, height: number): Particle {
  const roll = Math.random();

  return {
    x: Math.random() * width,
    y: Math.random() * height,
    velocityX: (Math.random() - 0.5) * 3.4,
    velocityY: -1.4 - Math.random() * 4.1,
    radius: 0.45 + Math.random() * 1.15,
    opacity: 0.13 + Math.random() * 0.52,
    phase: Math.random() * TAU,
    phaseSpeed: 0.18 + Math.random() * 0.46,
    rotation: Math.random() * TAU,
    rotationSpeed: (Math.random() - 0.5) * 0.18,
    kind: roll > 0.91 ? "streak" : roll > 0.78 ? "fragment" : "dust",
  };
}

export function ParticleField({ className = "" }: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return undefined;

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = reducedMotionQuery.matches;
    let width = 1;
    let height = 1;
    let frame = 0;
    let lastTime = performance.now();
    let particles: Particle[] = [];
    let wheelImpulse = 0;

    const pointer = {
      active: false,
      x: -10_000,
      y: -10_000,
    };

    const rebuild = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const targetCount = reducedMotion
        ? motionConfig.particles.reduced
        : width < 900
          ? motionConfig.particles.compact
          : motionConfig.particles.desktop;

      particles = Array.from({ length: targetCount }, () => makeParticle(width, height));
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.active = event.pointerType !== "touch";
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    const onWheel = (event: WheelEvent) => {
      if (reducedMotion) return;
      wheelImpulse = Math.max(-1, Math.min(1, event.deltaY / 160));
    };

    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      rebuild();
    };

    const drawParticle = (particle: Particle, x: number, y: number, opacity: number) => {
      context.save();
      context.translate(x, y);
      context.rotate(particle.rotation);
      context.globalAlpha = opacity;

      if (particle.kind === "streak") {
        const gradient = context.createLinearGradient(0, -8, 0, 5);
        gradient.addColorStop(0, "rgba(191, 209, 255, 0)");
        gradient.addColorStop(0.7, "rgba(159, 141, 255, 0.72)");
        gradient.addColorStop(1, "rgba(239, 236, 255, 0.96)");
        context.strokeStyle = gradient;
        context.lineWidth = 0.75;
        context.beginPath();
        context.moveTo(0, -8 - particle.radius * 3);
        context.lineTo(0, 3);
        context.stroke();
      } else if (particle.kind === "fragment") {
        context.strokeStyle = "rgba(181, 168, 255, 0.84)";
        context.lineWidth = 0.6;
        context.beginPath();
        context.moveTo(0, -3.8);
        context.lineTo(2.2, 0);
        context.lineTo(0, 3.8);
        context.lineTo(-2.2, 0);
        context.closePath();
        context.stroke();
      } else {
        context.fillStyle = particle.radius > 1.05 ? "#c6c3ff" : "#8676ed";
        context.shadowColor = "rgba(121, 91, 255, 0.74)";
        context.shadowBlur = particle.radius * 4;
        context.beginPath();
        context.arc(0, 0, particle.radius, 0, TAU);
        context.fill();
      }

      context.restore();
    };

    const render = (now: number) => {
      frame = window.requestAnimationFrame(render);
      if (document.hidden) {
        lastTime = now;
        return;
      }

      const delta = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";

      for (const particle of particles) {
        if (!reducedMotion) {
          particle.x += particle.velocityX * delta;
          particle.y += (particle.velocityY - wheelImpulse * 18) * delta;
          particle.phase += particle.phaseSpeed * delta;
          particle.rotation += particle.rotationSpeed * delta;

          if (particle.y < -18) particle.y = height + 18;
          if (particle.y > height + 18) particle.y = -18;
          if (particle.x < -18) particle.x = width + 18;
          if (particle.x > width + 18) particle.x = -18;
        }

        let renderX = particle.x;
        let renderY = particle.y;

        if (pointer.active && !reducedMotion) {
          const deltaX = renderX - pointer.x;
          const deltaY = renderY - pointer.y;
          const distanceSquared = deltaX * deltaX + deltaY * deltaY;
          const radius = motionConfig.particles.pointerRadius;

          if (distanceSquared > 1 && distanceSquared < radius * radius) {
            const distance = Math.sqrt(distanceSquared);
            const influence = (1 - distance / radius) * motionConfig.particles.maxRepel;
            renderX += (deltaX / distance) * influence;
            renderY += (deltaY / distance) * influence;
          }
        }

        const shimmer = reducedMotion ? 0.72 : 0.58 + Math.sin(particle.phase) * 0.22;
        drawParticle(particle, renderX, renderY, particle.opacity * shimmer);
      }

      context.globalCompositeOperation = "source-over";
      wheelImpulse *= Math.pow(0.045, delta);
    };

    const resizeObserver = new ResizeObserver(rebuild);
    resizeObserver.observe(canvas);
    rebuild();
    frame = window.requestAnimationFrame(render);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("wheel", onWheel, { passive: true });
    reducedMotionQuery.addEventListener("change", onMotionPreferenceChange);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("wheel", onWheel);
      reducedMotionQuery.removeEventListener("change", onMotionPreferenceChange);
    };
  }, []);

  return <canvas ref={canvasRef} className={`star-particles ${className}`} aria-hidden="true" />;
}

export default ParticleField;
