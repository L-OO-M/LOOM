'use client';
import { useTransform, motion, useScroll } from 'motion/react';
import { useRef, forwardRef } from 'react';
export const Card = ({ i, letter, title, description, url, color, progress, range, targetScale, illustration = false, imageAlt }) => {
    const container = useRef(null);
    const { scrollYProgress } = useScroll({ target: container, offset: ['start end', 'start start'] });
    const imageScale = useTransform(scrollYProgress, [0, 1], [2, 1]);
    const scale = useTransform(progress, range, [1, targetScale]);
    return (<div ref={container} className="h-screen flex items-center justify-center sticky top-0">
      <motion.div style={{ backgroundColor: color, scale, top: `calc(-5vh + ${i * 25}px)` }} className="stack-card flex flex-col relative -top-[25%] h-[480px] w-[90%] md:w-[68%] max-w-[900px] rounded-2xl p-6 md:p-10 origin-top">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-xs uppercase tracking-[0.3em] opacity-70">Pillar 0{i + 1} / 04</span>
          <span className="font-mono text-xs uppercase tracking-[0.3em] opacity-70">L·O·O·M</span>
        </div>
        <div className="flex flex-col md:flex-row h-full mt-5 gap-6 md:gap-10 min-h-0">
          <div className="md:w-[40%] flex flex-col justify-end">
            <span className="font-display text-[7rem] md:text-[10rem] leading-[0.8] font-bold">{letter}</span>
            <h3 className="font-serif-accent italic text-3xl md:text-4xl mt-3">{title}</h3>
            <p className="text-sm md:text-base mt-3 opacity-85 max-w-sm">{description}</p>
          </div>
          <div className="relative md:w-[60%] flex-1 rounded-xl overflow-hidden min-h-[120px]">
            <motion.div className="w-full h-full" style={{ scale: illustration ? 1 : imageScale }}>
              <img src={url} alt={imageAlt || title} loading="lazy" width={illustration ? 1448 : 1280} height={illustration ? 1086 : 896} className={`absolute inset-0 w-full h-full ${illustration ? "object-contain" : "object-cover"}`}/>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>);
};
const Component = forwardRef(({ projects }, ref) => {
    const container = useRef(null);
    const { scrollYProgress } = useScroll({ target: container, offset: ['start start', 'end end'] });
    return (<section ref={ref} className="story-stack bg-background text-foreground">
      <div ref={container}>
        {projects.map((project, i) => {
            const targetScale = 1 - (projects.length - i) * 0.05;
            return (<Card key={`p_${i}`} i={i} letter={project.letter} url={project.link} title={project.title} color={project.color} illustration={project.illustration ?? false} imageAlt={project.imageAlt ?? project.title} description={project.description} progress={scrollYProgress} range={[i * 0.25, 1]} targetScale={targetScale}/>);
        })}
      </div>
    </section>);
});
Component.displayName = 'StackingCards';
export default Component;
