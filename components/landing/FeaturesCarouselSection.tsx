// @ts-nocheck
"use client";

import React from "react";
import { Carousel, Card } from "@/components/ui/apple-cards-carousel";

interface FeaturesCarouselSectionProps {
  scrollToCarousel?: () => void;
  carouselRef?: React.RefObject<HTMLDivElement>;
}

const FeaturesCarouselSection: React.FC<FeaturesCarouselSectionProps> = ({ scrollToCarousel, carouselRef }) => {
  const cards = [
    {
      previewImageSrc: "/one_flow_one_canvas.png",
      title: "One Flow, One Canvas",
      caption: "Stay in flow by working on the same canvas as your AI.",
      // category: "Workflow",
      content: [
        <div key="section1">
          <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
          <strong>Working on the same canvas as your AI means you're not jumping between tools, tabs, or mental contexts.</strong> Everything you and the AI generate stays unified. This eliminates the friction of switching modes, so your flow remains uninterrupted. The result is faster iteration, clearer collaboration, and a workspace that actually feels collaborative.
            <br />
          </p>
          <div className="flex justify-center mt-4">
            <img src="/desktop-view2.png" alt="One Flow, One Canvas" className="w-full h-full object-cover rounded-xl max-w-xl" />
          </div>
        </div>,
        <div key="section2">
          <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
            <strong>Whether you're on your phone or at your desk, the experience stays seamless.</strong> The same canvas adapts to your screen so you never lose your place. Start an idea on mobile, refine it on desktop, and pick up right where you left off. Your workflow stays fluid, no matter the device.
          </p>
          <div className="flex justify-center mt-4">
            <img src="/mobile-view.png" alt="One Flow, One Canvas" className="w-auto h-full object-contain rounded-xl max-h-[400px]" />
          </div>
        </div>
      ],
    },
    {
      previewImageSrc: "/tag_docs_2.png",
      title: "Tag Documents",
      caption: "Tag documents as context for AI and never start from zero.",
      // category: "Context",
      content: [
        <div key="section-tag-docs">
          <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
            <strong>Tagging previous notes gives your AI instant context, so it knows what matters to you without needing a long explanation.</strong> You avoid repeating yourself and get more relevant results, faster. It turns your past work into a living knowledge base you can build on.
          </p>
          <div className="flex justify-center mt-4">
            <img src="/tag-documents.png" alt="Tag Documents" className="w-full h-full object-cover rounded-xl max-w-xl" />
          </div>
        </div>,
        <div key="section-search-and-tag">
          <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
            <strong>Instead of digging through folders, just ask your AI to find what you need.</strong> Manual search can break your flow. This turns your AI into a real assistant, surfacing the right content when you need it most.
          </p>
          <div className="flex justify-center mt-4">
            <img src="/search-and-tag.png" alt="Tag Documents" className="w-full h-full object-cover rounded-xl max-w-xl" />
          </div>
        </div>
      ],
    },
    {
      previewImageSrc: "/audio_usage_1.png",
      title: "Interact Your Way",
      caption: "Engage with your AI editor using voice, text, or even images for ultimate flexibility.",
      // category: "Flexibility",
      content: [
        <div key="section-interact-your-way">
        <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
          <strong>Engage with your AI editor however you think.</strong> Speak it, type it, or show it. Your ideas come through. The result is faster expression and less friction between you and your thoughts.
        </p>
        <div className="flex justify-center mt-4">
          <img src="/audio_usage_1.png" alt="Interact Your Way" className="w-full h-full object-cover rounded-xl max-w-xl" />
        </div>
        </div>
      ]
    },
    {
      previewImageSrc: "/file_browser_1.png",
      title: "Stay Organized",
      caption: "Easily manage your files and notes with an intuitive browser and folder system.",
      // category: "Management",
      content: [
        <div key="section-stay-organized">
        <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
          <strong>Stay organized without the clutter or complexity of traditional note apps.</strong> Most apps either bury your content in rigid folder hierarchies or overwhelm you with tagging systems that don't scale. This feature strikes the balance, giving you just enough structure to keep things clean and accessible.
        </p>
        <div className="flex justify-center mt-4">
          <img src="/file_browser_1.png" alt="Stay Organized" className="w-full h-full object-cover rounded-xl max-w-xl" />
        </div>
        </div>
      ],
    },
    {      
      previewImageSrc: "/user_diff_models_1.png",
      title: "Use Different Models",
      caption: "Switch between models and default to the one that works for you.",
      // category: "AI Models",
      content: [
        <div key="section-use-different-models">
        <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
          <strong>One model not getting it done?</strong> Some are better at writing, others at reasoning, summarizing, or translating. Switching lets you play to each model's strengths without being locked into one tool or platform. You get more accurate results and avoid the frustration of forcing one model to do everything.
        </p>
        <div className="flex justify-center mt-4">
          <img src="/user_diff_models_1.png" alt="Use Different Models" className="w-full h-full object-cover rounded-xl max-w-xl" />
        </div>
        </div>
  ],
    },
  ];

  const items = cards.map((card, idx) => (
    <Card key={idx} card={card} index={idx} scrollToCarousel={scrollToCarousel} />
  ));

  return <Carousel items={items} carouselRef={carouselRef} />;
};

export default FeaturesCarouselSection;