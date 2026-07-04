import gsap from "gsap";

const CONFETTI_COLORS = ["#6bbfa0", "#22d3ee", "#a78bfa", "#fbbf24", "#f472b6", "#34d399"];

export function launchConfetti(
  container: HTMLElement,
  origin: { x: number; y: number },
): () => void {
  const particles: HTMLDivElement[] = [];
  const count = 56;

  for (let i = 0; i < count; i += 1) {
    const particle = document.createElement("div");
    particle.className = "pair-confetti-particle";
    const size = 6 + Math.random() * 8;
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]!;
    particle.style.width = `${size}px`;
    particle.style.height = `${Math.random() > 0.5 ? size : size * 0.45}px`;
    particle.style.backgroundColor = color;
    particle.style.left = "0";
    particle.style.top = "0";
    particle.style.transform = `translate(${origin.x}px, ${origin.y}px)`;
    container.appendChild(particle);
    particles.push(particle);

    const angle = (Math.random() - 0.5) * Math.PI * 1.4 - Math.PI / 2;
    const distance = 120 + Math.random() * 220;
    const targetX = origin.x + Math.cos(angle) * distance;
    const targetY = origin.y + Math.sin(angle) * distance + 80 + Math.random() * 120;

    gsap.fromTo(
      particle,
      { opacity: 1, scale: 0, rotation: Math.random() * 180 },
      {
        x: targetX - origin.x,
        y: targetY - origin.y,
        rotation: `+=${180 + Math.random() * 540}`,
        scale: 0.6 + Math.random() * 0.8,
        opacity: 0,
        duration: 1.1 + Math.random() * 0.9,
        ease: "power2.out",
        delay: Math.random() * 0.25,
      },
    );
  }

  const emoji = document.createElement("div");
  emoji.className = "pair-confetti-emoji";
  emoji.textContent = "🎉";
  emoji.style.left = "0";
  emoji.style.top = "0";
  emoji.style.transform = `translate(${origin.x}px, ${origin.y}px)`;
  container.appendChild(emoji);

  gsap.fromTo(
    emoji,
    { opacity: 0, scale: 0.2, y: 0 },
    {
      opacity: 1,
      scale: 1.4,
      y: -24,
      duration: 0.45,
      ease: "back.out(2)",
    },
  );
  gsap.to(emoji, {
    opacity: 0,
    scale: 1.8,
    y: -60,
    duration: 0.8,
    delay: 0.55,
    ease: "power2.in",
  });

  return () => {
    particles.forEach((particle) => particle.remove());
    emoji.remove();
  };
}
