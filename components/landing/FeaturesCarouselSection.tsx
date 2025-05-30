// @ts-nocheck
"use client";

import React from "react";
import { Carousel, Card } from "@/components/ui/apple-cards-carousel";

const FeaturesCarouselSection: React.FC = () => {
  const cards = [
    {
      src: "/one_flow_one_canvas.png",
      title: "One Flow, One Canvas",
      category: "Workflow",
      content: (
        <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200">
          Jumpstart ideas with AI and work on the same canvas. Stay in flow.
        </p>
      ),
    },
    {
      src: "/tag_docs_2.png",
      title: "Tag Documents",
      category: "Context",
      content: (
        <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200">
          Tag documents as context for AI and never start from zero.
        </p>
      ),
    },
    {
      src: "/audio_usage_1.png",
      title: "Interact Your Way",
      category: "Flexibility",
      content: (
        <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200">
          Engage with your AI editor using voice, text, or even images for ultimate flexibility.
        </p>
      ),
    },
    {
      src: "/file_browser_1.png",
      title: "Stay Organized",
      category: "Management",
      content: (
        <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200">
          Easily manage your files and notes with an intuitive browser and folder system.
        </p>
      ),
    },
    {
      src: "/user_diff_models_1.png",
      title: "Use Different Models",
      category: "AI Models",
      content: (
        <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200">
          One model not getting it done? Switch it up and default the one that works for you.
        </p>
      ),
    },
  ];

  const items = cards.map((card, idx) => (
    <Card key={idx} card={card} index={idx} />
  ));

  return <Carousel items={items} />;
};

export default FeaturesCarouselSection;