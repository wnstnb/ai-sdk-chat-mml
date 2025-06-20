// @ts-nocheck
"use client";

import React, { forwardRef } from "react";
// import { Carousel, Card } from "@/components/ui/apple-cards-carousel"; // Carousel removed
import { Card } from "@/components/ui/apple-cards-carousel"; // Card is still used

// Define props interface
interface FeaturesCarouselSectionProps {
  // carouselRef: React.RefObject<HTMLDivElement>; // Removed
  // scrollToCarousel: () => void; // Removed
}

const FeaturesCarouselSection = forwardRef<HTMLDivElement, FeaturesCarouselSectionProps>(({ /* carouselRef, scrollToCarousel */ }, ref) => {
  const cards = [
    {
      previewImageSrc: "/one-canvas-2.0.png",
      title: "One Flow,<br />One Canvas",
      caption: "Stay in flow by working on the same canvas as your AI.",
      // category: "Workflow",
      content: [
        <div key="section1">
          <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
          <strong>Working on the same canvas as your AI means you&apos;re not jumping between tools, tabs, or mental contexts.</strong> Everything you and the AI generate stays unified. This eliminates the friction of switching modes, so your flow remains uninterrupted. The result is faster iteration and a workspace that actually feels collaborative.
            <br />
          </p>
          <div className="flex justify-center mt-4">
            <img src="/one-canvas-3.png" alt="One Flow, One Canvas" className="w-full h-full object-cover rounded-xl max-w-xl" />
          </div>
        </div>,
        <div key="section2">
          <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
            <strong>Whether you&apos;re on your phone or at your desk, the experience stays seamless.</strong> The same canvas adapts to your screen so you never lose your place. Start an idea on mobile, refine it on desktop, and pick up right where you left off. Your workflow stays fluid, no matter the device.
          </p>
          <div className="flex justify-center mt-4">
            <img src="/one-canvas-4.png" alt="One Flow, One Canvas" className="w-auto h-full object-contain rounded-xl max-h-[400px]" />
          </div>
        </div>
      ],
    },
    {
      previewImageSrc: "/voice-summary-landing-1.png",
      title: "Live Voice<br />Summaries",
      caption: "Get a summary of your voice notes in real-time.",
      content: [
        <div key="section-live-voice-summary-1">
          <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
            <strong>Capture your thoughts as they come, and let the AI summarize them instantly.</strong> No more pausing to type or losing your train of thought. Just speak freely and get a clean, concise summary ready to use. It&apos;s the most natural way to unload your brain.
          </p>
          <div className="flex justify-center mt-4">
            <img src="/voice-summary-landing-1.png" alt="Live Voice Summary" className="w-full h-full object-cover rounded-xl max-w-xl" />
          </div>
        </div>,
        <div key="section-live-voice-summary-2">
          <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
            <strong>Your spoken notes are automatically transcribed and organized, turning unstructured audio into a structured document.</strong> Go from a stream of consciousness to an editable, shareable note in seconds. This bridges the gap between thinking and writing, making your workflow faster and more fluid.
          </p>
          <div className="flex justify-center mt-4">
            <img src="/voice-summary-landing-2.png" alt="Live Voice Summary Organized" className="w-full h-full object-cover rounded-xl max-w-xl" />
          </div>
        </div>
      ],
    },
    {
      previewImageSrc: "/web-scrape-1.png",
      title: "Web<br />Scraping",
      caption: "Capture and summarize web content effortlessly.",
      content: [
        <div key="section-web-scraping-1">
          <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
            <strong>Want to grab content from a webpage to read later?</strong> Simply provide one or more URLs, and we&apos;ll fetch the content for you. It&apos;s perfect for saving articles, blog posts, or any online material you want to revisit.
          </p>
          <div className="flex justify-center mt-4">
            <img src="/web-scrape-1.png" alt="Web Scraping - Capture Content" className="w-full h-full object-cover rounded-xl max-w-xl" />
          </div>
        </div>,
        <div key="section-web-scraping-2">
          <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
            <strong>Prefer a quick overview? Get an AI-powered summary for your URLs instead of the full text.</strong> This is ideal for quickly understanding the gist of multiple sources. Our web scraping is designed for flexibility, allowing you to capture content, consume it how you like, make notes, and even use it as context for future projects.
          </p>
          <div className="flex justify-center mt-4">
            <img src="/web-scrape-2.png" alt="Web Scraping - AI Summary" className="w-full h-full object-cover rounded-xl max-w-xl" />
          </div>
        </div>
      ],
    },
    {
      previewImageSrc: "/pdf-summary-1.png",
      title: "PDF<br />Summaries",
      caption: "Extract text or get summaries from PDF documents.",
      content: [
        <div key="section-pdf-summary-1">
          <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
            <strong>Easily process PDF documents by uploading the file directly.</strong> Whether you need the full text extracted or a concise AI-powered summary, you can quickly integrate PDF content into your notes and projects. This feature is perfect for research, reviewing reports, or incorporating academic papers into your workflow when you have the file handy.
          </p>
          <div className="flex justify-center mt-4">
            <img src="/pdf-summary-from-file.png" alt="PDF Summaries - Upload File" className="w-full h-full object-cover rounded-xl max-w-xl" />
          </div>
        </div>,
        <div key="section-pdf-summary-2">
          <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
            <strong>Alternatively, provide a URL to a publicly accessible PDF.</strong> Our tool will fetch and process it, allowing you to extract text or generate summaries just as easily. Ideal for when you&apos;re working with online documents and want to bring their content into your workspace without downloading first.
          </p>
          <div className="flex justify-center mt-4">
            <img src="/pdf-summary-from-url.png" alt="PDF Summaries - From URL" className="w-full h-full object-cover rounded-xl max-w-xl" />
          </div>
        </div>
      ],
    },
    {
      previewImageSrc: "/tag_docs_2.png",
      title: "Tag<br />Documents",
      caption: "Tag documents as context for AI<br />and never start from zero.",
      // category: "Context",
      content: [
        <div key="section-tag-docs">
          <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
            <strong>Tagging previous notes gives your AI instant context, so it knows what matters to you without needing a long explanation.</strong> Whether it&apos;s a typed note, a recorded voice memo, an AI-generated voice summary, or even a web page you&apos;ve scraped: if it&apos;s in your notes, it can be tagged and used as context. You avoid repeating yourself and get more relevant results, faster. It turns your past work into a living knowledge base you can build upon.
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
      title: "Interact<br />Your Way",
      caption: "Engage with your AI editor using voice, text, or even images for ultimate flexibility.",
      // category: "Flexibility",
      content: [
        <div key="section-interact-your-way">
        <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
          <strong>Engage with your AI editor in the way you best express yourself.</strong> Speak it, type it, or show it. Your ideas will come through. The result is faster expression and less friction between you and your thoughts.
        </p>
        <div className="flex justify-center mt-4">
          <img src="/audio_usage_1.png" alt="Interact Your Way" className="w-full h-full object-cover rounded-xl max-w-xl" />
        </div>
        </div>
      ]
    },
    // {
    //   previewImageSrc: "/file_browser_1.png",
    //   title: "Stay<br />Organized",
    //   caption: "Easily manage your files and notes with an intuitive browser and folder system.",
    //   // category: "Management",
    //   content: [
    //     <div key="section-stay-organized">
    //     <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
    //       <strong>Stay organized without the clutter or complexity of traditional note apps.</strong> Most apps either bury your content in rigid folder hierarchies or overwhelm you with tagging systems that don&apos;t scale. This feature strikes the balance, giving you just enough structure to keep things clean and accessible.
    //     </p>
    //     <div className="flex justify-center mt-4">
    //       <img src="/file_browser_1.png" alt="Stay Organized" className="w-full h-full object-cover rounded-xl max-w-xl" />
    //     </div>
    //     </div>
    //   ],
    // },
    {      
      previewImageSrc: "/user_diff_models_1.png",
      title: "Use Different<br />Models",
      caption: "Switch between models and default to the one that works for you.",
      // category: "AI Models",
      content: [
        <div key="section-use-different-models">
        <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
          <strong>One model not getting it done?</strong> Some are better at writing, others at reasoning, summarizing, or translating. Switching lets you play to each model&apos;s strengths without being locked into one tool or platform. You get more accurate results and avoid the frustration of forcing one model to do everything.
        </p>
        <div className="flex justify-center mt-4">
          <img src="/user_diff_models_1.png" alt="Use Different Models" className="w-full h-full object-cover rounded-xl max-w-xl" />
        </div>
        </div>
  ],
    },
    {
      previewImageSrc: "/multiplayer-1.png",
      title: "Collaborate<br />in Real-Time",
      caption: "Work together seamlessly with live multiplayer editing.",
      // category: "Collaboration",
      content: [
        <div key="section-multiplayer-1">
          <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
            <strong>Collaboration shouldn&apos;t mean constant back-and-forth or version conflicts.</strong> See changes as they happen, work on the same document simultaneously, and maintain your flow while building ideas together. Everyone stays on the same page.
          </p>
          <div className="flex justify-center mt-4">
            <img src="/multiplayer-1.png" alt="Real-time Collaboration" className="w-full h-full object-cover rounded-xl max-w-xl" />
          </div>
        </div>,
        <div key="section-multiplayer-2">
          <p className="text-lg leading-relaxed text-neutral-700 dark:text-neutral-200 text-left">
            <strong>Bring anyone on the platform into your workspace instantly.</strong> With granular permissions, you stay in complete control of your notes and documents. Choose who can view, edit, or comment, ensuring your work remains secure while enabling seamless collaboration with teammates, clients, or collaborators.
          </p>
          <div className="flex justify-center mt-4">
            <img src="/multiplayer-2.png" alt="Multiplayer AI Collaboration" className="w-full h-full object-cover rounded-xl max-w-xl" />
          </div>
        </div>
      ],
    },
  ];

  // const items = cards.map((card, idx) => (
  // <Card key={idx} card={card} index={idx} />
  // ));

  // return <Carousel items={items} ref={carouselRef} scrollToCarousel={scrollToCarousel} />;
  return (
    <div ref={ref} className="py-10 md:py-20 px-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 max-w-7xl mx-auto">
        {cards.map((cardData, idx) => (
          <Card key={idx} card={cardData} index={idx} />
        ))}
      </div>
    </div>
  );
});

FeaturesCarouselSection.displayName = 'FeaturesCarouselSection';

export default FeaturesCarouselSection;