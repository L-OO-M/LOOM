"use client";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import { useEffect, useRef } from "react";

const tints = {
  orange: "var(--primary)",
  gray: "var(--pillar-o1)",
  purple: "var(--pillar-m)",
  green: "var(--pillar-o2)",
};
export function GradientCard({
  badgeText,
  badgeColor,
  title,
  description,
  ctaText,
  ctaHref,
  imageUrl,
  gradient,
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial="rest"
      animate="rest"
      whileHover={reduced ? undefined : "hover"}
      variants={{ rest: { scale: 1, y: 0 }, hover: { scale: 1.03, y: -4 } }}
      className="h-full"
    >
      <div
        className="relative flex flex-col justify-between h-full w-full overflow-hidden rounded-2xl p-8 loom-domain-card shadow-sm transition-shadow duration-300 hover:shadow-lg"
        style={{ "--card-tint": tints[gradient] || tints.orange }}
      >
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" />
        <motion.div
          variants={{
            rest: { scale: 1, rotate: 0 },
            hover: reduced ? {} : { scale: 1.1, rotate: 3 },
          }}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
          className="absolute -right-1/4 -bottom-1/4 w-3/4 opacity-25 pointer-events-none"
          aria-hidden="true"
        >
          <Image
            src={imageUrl}
            alt=""
            width={1024}
            height={1024}
            sizes="(max-width: 768px) 75vw, 420px"
            className="h-auto w-full"
          />
        </motion.div>
        <div className="z-10 flex flex-col h-full">
          <div className="loom-domain-badge mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-xs font-medium text-primary backdrop-blur-sm w-fit">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: badgeColor }}
            />
            {badgeText}
          </div>
          <div className="flex-grow">
            <h3 className="text-2xl font-bold text-foreground mb-2">{title}</h3>
            <p className="text-muted-foreground max-w-xs">{description}</p>
          </div>
          <Link
            prefetch={false}
            href={ctaHref}
            className="group mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary"
          >
            {ctaText}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

function wrap(min, max, value) {
  const range = max - min;
  return ((((value - min) % range) + range) % range) + min;
}
export function ScrollBaseAnimation({
  children,
  baseVelocity = -5,
  clasname,
  delay = 0,
}) {
  const reduced = useReducedMotion();
  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const smooth = useSpring(velocity, { damping: 50, stiffness: 400 });
  const factor = useTransform(smooth, [0, 1000], [0, 2], { clamp: false });
  const x = useTransform(baseX, (value) => `${wrap(-20, -45, value)}%`);
  const started = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      started.current = true;
    }, delay);
    return () => clearTimeout(timer);
  }, [delay]);
  useAnimationFrame((_, delta) => {
    if (!started.current || reduced) return;
    const distance = (baseVelocity * delta) / 1000;
    baseX.set(baseX.get() + distance + distance * factor.get());
  });
  return (
    <div
      className="overflow-hidden whitespace-nowrap flex flex-nowrap"
      role="img"
      aria-label={children}
    >
      <motion.div
        className="flex whitespace-nowrap gap-10 flex-nowrap"
        style={{ x: reduced ? "0%" : x }}
        aria-hidden="true"
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`block sm:text-[8vw] text-[11vw] ${clasname || ""}`}
          >
            {children}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
