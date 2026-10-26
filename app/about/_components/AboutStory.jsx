"use client";

import FlowArt, { FlowSection } from "./StoryScroll";
import LanyardBadge from "./LanyardBadge";
import "./about-story.css";

export default function AboutStory() {
  return (
    <FlowArt aria-label="The LOOM story">
      <FlowSection className="flow-section--vision" aria-label="The vision">
        <p className="thread-kicker">01 — The vision</p>
        <div>
          <div className="loom-wordmark mb-8">
            <span className="loom-mark" aria-hidden="true">
              L
            </span>
            <span>LOOM / Student-led technical community</span>
          </div>
          <h1 className="thread-heading">
            More than a society. A culture of building.
          </h1>
        </div>
        <p className="thread-copy mt-auto max-w-3xl">
          <strong>
            LOOM — Learning, Opportunity, Open Source, and Mentorship.
          </strong>{" "}
          A place to learn new skills, build meaningful projects, share
          knowledge, and guide the next generation.
        </p>
      </FlowSection>

      <FlowSection
        className="flow-section--difference"
        aria-label="What makes LOOM different"
      >
        <p className="thread-kicker">02 — Built to do the opposite</p>
        <h2 className="thread-heading">A better way in.</h2>
        <div
          className="difference-grid"
          aria-label="Four ways LOOM supports students"
        >
          <article className="difference-item">
            <span className="item-number">01 — Accessibility</span>
            <h3>Everyone starts somewhere.</h3>
            <p>Beginners are welcome. No prior experience is required.</p>
          </article>
          <article className="difference-item">
            <span className="item-number">02 — Guidance</span>
            <h3>A clear path forward.</h3>
            <p>
              Structured learning roadmaps, curated resources, and peer
              mentorship.
            </p>
          </article>
          <article className="difference-item">
            <span className="item-number">03 — Engagement</span>
            <h3>Keep making things.</h3>
            <p>
              Year-round workshops, hands-on activities, shared projects, and
              challenges.
            </p>
          </article>
          <article className="difference-item">
            <span className="item-number">04 — Meaningful output</span>
            <h3>Make skills real.</h3>
            <p>
              Build projects, contribute to open source, join hackathons, and
              gain practical experience.
            </p>
          </article>
        </div>
      </FlowSection>

      <FlowSection
        className="flow-section--ecosystem"
        aria-label="The LOOM ecosystem"
      >
        <p className="thread-kicker">03 — The ecosystem</p>
        <div>
          <h2 className="thread-heading">Learn. Build. Contribute. Mentor.</h2>
          <p className="thread-copy mt-6">
            Knowledge keeps moving when we pass it on.
          </p>
        </div>
        <div
          className="ecosystem-grid"
          aria-label="Four stages of the LOOM community"
        >
          <article className="ecosystem-item">
            <span className="item-number">01</span>
            <h3>Learn</h3>
            <p>
              Find your foundations in guided roadmaps and practical workshops.
            </p>
          </article>
          <article className="ecosystem-item">
            <span className="item-number">02</span>
            <h3>Build</h3>
            <p>
              Turn new skills into projects, challenges, and collaborations.
            </p>
          </article>
          <article className="ecosystem-item">
            <span className="item-number">03</span>
            <h3>Contribute</h3>
            <p>Share your work, join open source, and help your community.</p>
          </article>
          <article className="ecosystem-item">
            <span className="item-number">04</span>
            <h3>Mentor</h3>
            <p>Pass on what you know and welcome the next generation.</p>
          </article>
        </div>
      </FlowSection>

      <FlowSection
        className="flow-section--future"
        aria-label="The future we're building"
      >
        <p className="thread-kicker">04 — A community that continues</p>
        <h2 className="thread-heading">
          The people may change. The culture continues.
        </h2>
        <p className="thread-copy max-w-4xl">
          LOOM is built to last beyond a single event, semester, or
          leadership team. Each generation can inherit more opportunities—and
          leave something valuable for the next.
        </p>
        <p className="future-note mt-auto">
          A community that outlives its founders.
        </p>
      </FlowSection>

      <FlowSection className="flow-section--join" aria-label="Join LOOM">
        <div className="join-layout">
          <div className="join-badge-wrap">
            <LanyardBadge
              className="join-badge"
              height="min(100svh, 820px)"
              cardWidth={246}
              title="Join LOOM"
              subtitle="LEARNING · OPEN SOURCE · OPPORTUNITY · MENTORSHIP"
              name="Your Story"
              role="STARTS HERE"
              strapText="learn · build · share · mentor"
              strapLabel="LOOM COMMUNITY"
              strapColor="var(--lanyard-strap-color)"
              inkColor="var(--lanyard-strap-ink)"
              cardColor="var(--lanyard-card-color)"
              ariaLabel="LOOM membership badge. Drag to swing, press to flip."
            />
          </div>
          <div className="join-copy">
            <p className="thread-kicker">05 — Join LOOM</p>
            <h2 className="thread-heading mt-8">Your thread starts here.</h2>
            <p className="thread-copy mt-8">
              Whether you are writing your first line of code or building your
              next big project, there is a place for you here.
            </p>
            <p className="mt-10 text-sm font-semibold uppercase leading-relaxed tracking-normal">
              Learn together. Build together. Pass it on.
            </p>
          </div>
        </div>
      </FlowSection>
    </FlowArt>
  );
}
