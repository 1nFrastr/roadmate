import gsap from "gsap";
import { DEVICE_H } from "../constants";

const CONFETTI_COLORS = ["#6bbfa0", "#22d3ee", "#a78bfa", "#fbbf24", "#f472b6", "#34d399"];
const CONFETTI_COUNT = 112;

export interface ConfettiOrigin {
  x: number;
  y: number;
}

/** 礼花从 V 字叠放上方喷出，避开中间重叠的屏幕区域 */
export function computePairConfettiOrigin(
  playgroundWidth: number,
  layoutY: number,
  layoutScale: number,
): ConfettiOrigin {
  return {
    x: playgroundWidth / 2,
    y:
      layoutY +
      DEVICE_H * (0.5 - layoutScale * 0.14) -
      DEVICE_H * layoutScale * 0.28,
  };
}

export function launchConfetti(
  container: HTMLElement,
  origin: ConfettiOrigin,
): () => void {
  const particles: HTMLDivElement[] = [];

  for (let i = 0; i < CONFETTI_COUNT; i += 1) {
    const particle = document.createElement("div");
    particle.className = "pair-confetti-particle";
    const size = 6 + Math.random() * 8;
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]!;
    particle.style.width = `${size}px`;
    particle.style.height = `${Math.random() > 0.5 ? size : size * 0.45}px`;
    particle.style.backgroundColor = color;
    container.appendChild(particle);
    particles.push(particle);

    const angle = (Math.random() - 0.5) * Math.PI * 1.4 - Math.PI / 2;
    const distance = 120 + Math.random() * 220;
    const targetX = origin.x + Math.cos(angle) * distance;
    const targetY = origin.y + Math.sin(angle) * distance + 80 + Math.random() * 120;

    gsap.set(particle, {
      x: origin.x,
      y: origin.y,
      opacity: 1,
      scale: 0,
      rotation: Math.random() * 180,
    });
    gsap.to(particle, {
      x: targetX,
      y: targetY,
      rotation: `+=${180 + Math.random() * 540}`,
      scale: 0.6 + Math.random() * 0.8,
      opacity: 0,
      duration: 1.1 + Math.random() * 0.9,
      ease: "power2.out",
      delay: Math.random() * 0.25,
    });
  }

  return () => {
    particles.forEach((particle) => particle.remove());
  };
}
