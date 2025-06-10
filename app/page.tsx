'use client'; // Add this line because we're using useState

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link'; // Added Link import
import { ArrowRight, BrainCircuit, Clock, Layers, Zap, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button"; // Correct import path
import { motion, AnimatePresence } from "framer-motion"; // Import AnimatePresence
import FeaturesCarouselSection from "@/components/landing/FeaturesCarouselSection";
import FaqAccordion from "@/components/landing/FaqAccordion"; // This should already be correct for a default import

// Define the type for features explicitly
interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

// Define the type for the new feature list items
interface FeatureListItem {
  text: string;
}

// Define type for pricing plans
interface PricingPlan {
  id: 'monthly' | 'annual';
  name: string;
  price: string;
  priceDetails: string;
  features: string[];
  highlight?: string;
}

// New PricingSection component
const PricingSection = () => {
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual' | null>(null);

  const plans: PricingPlan[] = [
    {
      id: 'monthly',
      name: "Monthly",
      price: "$16",
      priceDetails: "/ month",
      features: ["7-day free trial", "Cancel anytime", "All features included", "Full access to multiple AI models"],
    },
    {
      id: 'annual',
      name: "Annual",
      price: "$150",
      priceDetails: "/ year",
      features: ["7-day free trial", "Cancel anytime", "All features included", "Full access to multiple AI models"],
      highlight: "Save 22%",
    },
  ];

  const handlePlanSelect = (planId: 'monthly' | 'annual') => {
    setSelectedPlan(planId);
  };

  const getStartedLink = selectedPlan ? `/signup?plan=${selectedPlan}` : "/signup";

  return (
    <section id="pricing" className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <motion.h2
          className="text-3xl md:text-4xl font-semibold text-center mb-4 text-[color:var(--accent-color)] font-newsreader"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false, amount: 0.5 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0 },
          }}
        >
          Simple Pricing. Full Access.
        </motion.h2>
        <motion.p
          className="text-lg md:text-xl text-center text-[color:var(--primary-color)]/80 mb-12 md:mb-16 max-w-2xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false, amount: 0.5 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0 },
          }}
        >
          Every feature, one clear price.
        </motion.p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12 md:mb-16">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.id}
              className={`bg-[color:var(--card-bg)]/60 backdrop-blur-md p-6 md:p-8 rounded-xl border shadow-xl cursor-pointer transition-all duration-300 ease-in-out relative overflow-hidden
                ${selectedPlan === plan.id ? 'border-[color:var(--accent-color)] shadow-2xl scale-105' : 'border-[color:var(--border-color)]/25 hover:border-[color:var(--accent-color)] hover:shadow-lg hover:scale-[1.02]'}`}
              onClick={() => handlePlanSelect(plan.id)}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: false, amount: 0.3 }}
              transition={{ duration: 0.5, delay: 0.3 + index * 0.15 }}
              variants={{
                hidden: { opacity: 0, y: 30, scale: 0.95 },
                visible: { opacity: 1, y: 0, scale: 1 },
              }}
            >
              {plan.highlight && (
                <div className="absolute top-0 right-0 bg-[color:var(--accent-color)] text-[color:var(--bg-color)] px-3 py-1 text-xs font-semibold rounded-bl-lg">
                  {plan.highlight}
                </div>
              )}
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-semibold text-[color:var(--primary-color)]">{plan.name}</h3>
                {selectedPlan === plan.id && <CheckCircle className="h-6 w-6 text-[color:var(--accent-color)]" />}
              </div>
              <p className="text-4xl font-bold text-[color:var(--accent-color)] mb-1">
                {plan.price}
                <span className="text-lg font-normal text-[color:var(--primary-color)]/70">{plan.priceDetails}</span>
              </p>
              <ul className="space-y-2 mt-6 text-[color:var(--primary-color)]/80">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center">
                    <ArrowRight className="h-4 w-4 mr-2 text-[color:var(--accent-color)] flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <motion.div
          className="text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false, amount: 0.3 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.8 }}
           variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0 },
          }}
        >
          <Link href={getStartedLink}>
            <Button variant="landing" className="px-10 py-7 text-lg">
              Get Started
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
};

// New FeatureListSection component
const FeatureListSection = () => {
  const featureItems: FeatureListItem[] = [
    { text: "Beautiful rich text editing with Markdown and drag-and-drop blocks." },
    { text: "Live voice summaries to capture your thoughts as they come." },
    { text: "Scrape and summarize web content to easily capture online information." },
    { text: "Process PDFs by uploading files or providing URLs to extract full text or get AI-powered summaries." },
    { text: "Smart AI integration to help you write, ideate, and refine effortlessly." },
    { text: "Autosave and manual version history so you never lose your work." },
    { text: "Browse previous versions with a clean, intuitive interface." },
    { text: "Auto-title your documents with AI so you can stay in flow." },
    { text: "Stay productive anywhere with both desktop and mobile layouts." },
    { text: "Tag notes and documents as context, and never start from zero." },
    { text: "Talk, type, or drop in images. Engage however you want." },
    { text: "Access to mutliple models so you're not platform hopping." },
  ];

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.2, // Stagger animation
        duration: 0.5,
        ease: "easeOut",
      },
    }),
  };

  return (
    <section id="full-feature-list" className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <motion.h2
          className="text-3xl md:text-4xl font-semibold text-center mb-12 md:mb-16 text-[color:var(--accent-color)] font-newsreader"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false, amount: 0.5 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0 },
          }}
        >
          Everything Your<br />Notes App Should Be
        </motion.h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 max-w-4xl mx-auto">
          {featureItems.map((item, index) => (
            <motion.div
              key={index}
              className="text-lg md:text-xl text-[color:var(--primary-color)]/90 flex items-start"
              custom={index}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: false, amount: 0.5 }}
              variants={itemVariants}
            >
              <ArrowRight className="mr-2 h-5 w-5 flex-shrink-0 mt-1" />
              <span>{item.text}</span>
            </motion.div>
          ))}
        </div>
        <motion.div
          className="text-center mt-16 md:mt-24"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: false, amount: 0.3 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: featureItems.length * 0.2 + 0.5 }}
           variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0 },
          }}
        >
          <Link href="/signup">
            <Button variant="landing" className="px-10 py-7 text-lg">
              Try Free For 7 Days 
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
};

// Renamed component to avoid conflict with default export naming conventions if needed elsewhere
export default function LandingPageContent() {
  const [activeTabIndex, setActiveTabIndex] = useState(0); // New state for active tab
  const featuresSectionRef = useRef<HTMLDivElement>(null); // New ref for the features section
  const carouselSectionRef = useRef<HTMLDivElement>(null); // Declare carouselSectionRef
  const [currentCanvasImageIndex, setCurrentCanvasImageIndex] = useState(0); // Index for Desktop (0) or Mobile (1) view for the first tab
  const [currentTagDocsImageIndex, setCurrentTagDocsImageIndex] = useState(0); // Index for Tag Directly (0) or Ask AI (1)

  const handleSmoothScroll = (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>, targetId: string) => {
    event.preventDefault();
    const targetElement = document.getElementById(targetId);
    if (targetElement) {
      targetElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  const canvasImageSources = [
    "/one_flow_one_canvas.png",
    "/one_flow_one_canvas_2.png"
  ];

  const tagDocsImageSources = [
    "/tag_docs_2.png", // Image for "Tag Directly"
    "/tag_docs_3.png"  // Image for "Ask AI"
  ];

  const tagDocsViewNames = ["Tag Directly", "Ask AI"];

  const features: Feature[] = [
    {
      icon: <Layers className="h-8 w-8 text-[color:var(--muted-text-color)]" />, // Use CSS variable
      title: "One Flow,<br />One Canvas",
      description: "Jumpstart ideas with AI and work on the same canvas. Stay in flow."
    },
    {
      icon: <Clock className="h-8 w-8 text-[color:var(--muted-text-color)]" />, // Use CSS variable
      title: "Tag<br />Documents",
      description: "Tag documents as context for AI and never start from zero."
    },
    {
      icon: <Zap className="h-8 w-8 text-[color:var(--muted-text-color)]" />, // Use CSS variable
      title: "Interact<br />Your Way",
      description: "Engage with your AI editor using voice, text, or even images<br />for ultimate flexibility."
    },
    {
      icon: <BrainCircuit className="h-8 w-8 text-[color:var(--muted-text-color)]" />, // Use CSS variable
      title: "Stay<br />Organized",
      description: "Easily manage your files and notes with an intuitive browser and folder system."
    },
    {
      icon: <BrainCircuit className="h-8 w-8 text-[color:var(--muted-text-color)]" />, // Use CSS variable for the new tab
      title: "Use Different<br />Models",
      description: "One model not getting it done? Switch it up and default the one that works for you."
    }
  ];

  // Variants for the heading animation
  const headingVariants = {
    hidden: { opacity: 0, filter: 'blur(8px)', y: 20 },
    visible: { opacity: 1, filter: 'blur(0px)', y: 0 },
  };

  const contentVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0 },
  };

  const buttonVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  // Add ref for the main parallax container
  // const mainRef = useRef<HTMLDivElement>(null); // REMOVED: No longer needed for JS parallax

  // Add ref for intersection observer
  const heroRef = useRef<HTMLDivElement>(null);

  // Add ref for the actual scroll container
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // State to track hero section visibility
  const [isHeroVisible, setIsHeroVisible] = useState(false);

  // Intersection Observer Logic - Modified to only observe hero section
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Check if the entry's target is the hero section
          if (entry.target === heroRef.current) {
            setIsHeroVisible(entry.isIntersecting);
            // Apply/remove 'is-visible' class for hero animations if needed by CSS
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
            } else {
              entry.target.classList.remove('is-visible');
            }
          }
        });
      },
      {
        root: null,
        rootMargin: '0px',
        threshold: 0.3, // Threshold for hero section visibility
      }
    );

    const heroSectionElement = heroRef.current;

    if (heroSectionElement) {
      observer.observe(heroSectionElement);
    }

    // Cleanup function
    return () => {
      if (heroSectionElement) {
        observer.unobserve(heroSectionElement);
      }
    };
  }, []); // Empty dependency array ensures this runs only once on mount


  const handleTabClick = (index: number) => {
    setActiveTabIndex(index);
    // Scroll to the start of the features section, making tabs visible
    featuresSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Renamed and modified to handle sub-tab clicks for the canvas view
  const handleCanvasViewChange = (index: number) => {
    setCurrentCanvasImageIndex(index);
  };

  const handleTagDocsViewChange = (index: number) => {
    setCurrentTagDocsImageIndex(index);
  };

  const scrollToCarousel = () => {
    carouselSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    // Removed min-h-screen from main, letting inner div control height
    // <main ref={mainRef} className="parallax-bg text-[color:var(--text-color)] "> // REMOVED mainRef
    <main className="parallax-bg text-[color:var(--text-color)] "> 
      {/* Content wrapper - Make it a flex container filling height */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header Section - Static glass-like background */}
        <header 
          className={`fixed top-0 left-0 right-0 z-50 bg-[color:var(--card-bg)]/70 backdrop-blur-lg shadow-md`}
        >
          <div 
            className={`container mx-auto px-6 flex items-center justify-between py-1`}
          >
            <div className="flex items-center">
              {/* Use theme variable for logo color */}
              <img src="/tuon-logo-svg-type.svg" alt="Tuon Logo" className="h-8 w-8" style={{ filter: 'var(--logo-filter)' }} />
              {/* Removed TEMP UI DEBUG */}
            </div>
            <nav className="flex items-center space-x-4 mobile-nav-actions">
              {/* Use theme variables for nav links */}
              {/* <a href="#features" className="text-sm font-medium text-[color:var(--primary-color)]/80 hover:text-[color:var(--accent-color)] transition-colors">Features</a> */}
              {/* <a href="#how-it-works" className="text-sm font-medium text-[color:var(--primary-color)]/80 hover:text-[color:var(--accent-color)] transition-colors">How It Works</a> */}
              {/* Use theme variables for button colors/hover */}
              <Link 
                href="#pricing" 
                onClick={(e) => handleSmoothScroll(e, 'pricing')}
              >
                <Button variant="ghost" className="text-sm text-[color:var(--primary-color)] hover:text-[color:var(--accent-color)] hover:bg-[color:var(--hover-bg)]/20">Pricing</Button>
              </Link>
              <Link 
                href="#faq-accordion" 
                onClick={(e) => handleSmoothScroll(e, 'faq-accordion')}  /* Added FAQ link */
              >
                <Button variant="ghost" className="text-sm text-[color:var(--primary-color)] hover:text-[color:var(--accent-color)] hover:bg-[color:var(--hover-bg)]/20">FAQ</Button>
              </Link>
              <Link 
                href="#full-feature-list" 
                onClick={(e) => handleSmoothScroll(e, 'full-feature-list')}
              >
                <Button variant="ghost" className="text-sm text-[color:var(--primary-color)] hover:text-[color:var(--accent-color)] hover:bg-[color:var(--hover-bg)]/20">Features</Button>
              </Link>
              
              <Link href="/login">
                <Button variant="ghost" className="text-sm text-[color:var(--primary-color)] hover:text-[color:var(--accent-color)] hover:bg-[color:var(--hover-bg)]/20">Login</Button>
              </Link>
            </nav>
          </div>
        </header>

        {/* Main Content Area - Added ref and overflow */}
        <div ref={scrollContainerRef} className="flex-grow overflow-y-auto scroll-smooth pt-20"> {/* Added scroll-smooth and padding-top to account for fixed header */}
          {/* Hero Section */}
          <div className="card-snap-wrapper flex items-center justify-center px-4">
            <section 
              ref={heroRef} // Add the ref here
              className="hero-section container mx-auto pt-16 md:pt-20 pb-6 flex items-center justify-center text-center min-h-[40vh] w-full"> {/* MODIFIED padding */}
              {/* Removed semi-transparent overlay for readability */}
              <motion.div 
                className="max-w-4xl mx-auto relative z-10"
                initial="hidden"
                animate={isHeroVisible ? "visible" : "hidden"} // Use state here
                transition={{ staggerChildren: 0.2 }}
              >
                <motion.h1
                  className="text-5xl md:text-6xl lg:text-7xl leading-tight text-[color:var(--accent-color)] mb-8 font-newsreader"
                  variants={headingVariants}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                >
                  The notes app that<br />brings it all together
                </motion.h1>
                <motion.p 
                  className="text-lg md:text-xl text-[color:var(--primary-color)]/90 mb-12 max-w-2xl leading-relaxed mx-auto"
                  variants={contentVariants}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                >
                  Upload and extract PDFs. Transcribe live audio. Save and summarize web pages. Track every version of your notes.<br />All in one place.

                </motion.p>
                <motion.div 
                  className="flex flex-col sm:flex-row gap-4 justify-center"
                  variants={buttonVariants}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                >
                  <Link href="/signup">
                    <Button variant="landing" className="px-8 py-6 text-base">
                      Try Free For 7 Days
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link 
                    href="#features-carousel" 
                    onClick={(e) => handleSmoothScroll(e, 'features-carousel')}
                  >
                    <Button variant="ghost" className="bg-[color:var(--card-bg)]/70 backdrop-blur-lg border border-[color:var(--border-color)]/25 text-[color:var(--primary-color)] hover:bg-[color:var(--card-bg)]/80 hover:text-[color:var(--accent-color)] hover:border-[color:var(--accent-color)]/50 px-8 py-6 text-base transition-all duration-300">
                      Explore Features
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                </motion.div>
              </motion.div>
            </section>
          </div>

          {/* Features Carousel Section */}
          <section id="features-carousel" ref={carouselSectionRef} className="pt-6 pb-0 flex flex-col items-center">
            <FeaturesCarouselSection />
          </section>

          {/* Pricing Section */}
          <PricingSection />

          {/* FAQ Accordion Section */}
          <section id="faq-accordion" className="pt-6 md:pt-8 pb-10 md:pb-12 flex flex-col items-center scroll-mt-12">
            <div className="container mx-auto px-4 w-full max-w-3xl">
              <h2 className="text-3xl md:text-4xl font-semibold text-center mb-6 md:mb-8 text-[color:var(--accent-color)] font-newsreader">
                Frequently Asked Questions
              </h2>
              <FaqAccordion />
            </div>
          </section>

          {/* Full Feature List Section */}
          <FeatureListSection />

          {/* Legacy Tabbed Features Section (hidden) */}
          <section ref={featuresSectionRef} id="features-tabs" className="pt-6 pb-20 min-h-screen flex flex-col items-center hidden"> {/* Hidden old section */}
            {/* Tabs Container - Stays max-w-3xl */}
            <div className="w-full max-w-3xl mx-auto px-4">
              {/* Tabs */}
              <div className="flex border-b border-[color:var(--border-color)]/30 mb-8 justify-center">
                {features.map((feature, index) => (
                  <button
                    key={index}
                    onClick={() => handleTabClick(index)}
                    className={`py-3 px-2 sm:px-3 font-medium text-xs sm:text-sm md:text-base focus:outline-none transition-all duration-300 ease-in-out relative group
                      w-24 sm:w-28 md:w-32 h-12 sm:h-14 md:h-16 flex items-center justify-center text-center leading-tight
                      ${activeTabIndex === index
                        ? 'text-[color:var(--accent-color)]'
                        : 'text-[color:var(--muted-text-color)] hover:text-[color:var(--primary-color)]'
                      }`}
                  >
                    <span 
                      dangerouslySetInnerHTML={{ __html: feature.title }}
                      className="block w-full leading-tight"
                    ></span>
                    <span className={`absolute bottom-[-1px] left-0 w-full h-0.5 bg-[color:var(--accent-color)] transform transition-transform duration-300 ease-out
                      ${activeTabIndex === index ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`}></span>
                  </button>
                ))}
              </div>
            </div> {/* End of Tabs Container */}

            {/* Tab Content Card Container - Wider: max-w-5xl */}
            <div className="w-full max-w-5xl mx-auto px-4"> 
              <div className="bg-[color:var(--card-bg)]/70 backdrop-blur-lg p-8 md:p-10 rounded-xl border border-[color:var(--border-color)]/25 shadow-2xl min-h-[350px] flex items-center justify-center w-full"> {/* MODIFIED: Added w-full */} 
                <AnimatePresence mode="wait">
                  {activeTabIndex === 0 ? (
                    // MODIFIED layout for "One Flow, One Canvas" to be vertical
                    <motion.div
                      key={activeTabIndex}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="flex flex-col items-center text-center w-full gap-6 md:gap-8" // MODIFIED: Vertical layout, centered
                    >
                      {/* Text Content (Title, Description) - Icon Removed */}
                      <div className="flex flex-col items-center text-center">
                        <h3 className="text-2xl md:text-3xl font-semibold mb-4 text-[color:var(--accent-color)] font-newsreader"
                            dangerouslySetInnerHTML={{ __html: features[activeTabIndex].title }}>
                        </h3>
                        <p className="text-md md:text-lg text-[color:var(--primary-color)]/90 leading-relaxed max-w-xl"
                           dangerouslySetInnerHTML={{ __html: features[activeTabIndex].description }}>
                        </p>
                      </div>

                      {/* Sub-tabs for Desktop/Mobile view - Styled like main tabs */}
                      <div className="flex border-b border-[color:var(--border-color)]/30 mb-6 md:mb-8 justify-center">
                        {["Desktop View", "Mobile View"].map((viewName, index) => (
                          <button
                            key={viewName}
                            onClick={() => handleCanvasViewChange(index)}
                            className={`py-3 px-4 sm:px-5 font-medium text-xs sm:text-sm focus:outline-none transition-all duration-300 ease-in-out relative group
                              ${currentCanvasImageIndex === index
                                ? 'text-[color:var(--accent-color)]'
                                : 'text-[color:var(--muted-text-color)] hover:text-[color:var(--primary-color)]'
                              }`}
                          >
                            {viewName}
                            <span className={`absolute bottom-[-1px] left-0 w-full h-0.5 bg-[color:var(--accent-color)] transform transition-transform duration-300 ease-out
                              ${currentCanvasImageIndex === index ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`}></span>
                          </button>
                        ))}
                      </div>

                      {/* Image display area with Fade Animation */}
                      <div className="w-full flex justify-center items-center relative min-h-[250px] sm:min-h-[300px] md:min-h-[400px]">
                        <AnimatePresence mode="wait">
                          <motion.img
                            key={canvasImageSources[currentCanvasImageIndex]}
                            src={canvasImageSources[currentCanvasImageIndex]}
                            alt={`${features[activeTabIndex].title} - ${currentCanvasImageIndex === 0 ? "Desktop" : "Mobile"} View`}
                            className={`rounded-lg shadow-xl h-auto object-contain 
                              ${currentCanvasImageIndex === 0 ? 'w-full' : 'w-4/5 mx-auto' // Desktop full width, Mobile 80% width and centered
                            }`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, position: 'absolute', top:0, left:0 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                          />
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  ) : activeTabIndex === 1 ? (
                    // MODIFIED layout for "Tag Documents" to be vertical
                    <motion.div
                      key={activeTabIndex} 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="flex flex-col items-center text-center w-full gap-6 md:gap-8" // MODIFIED: Vertical layout, centered
                    >
                      {/* Text Content (Title, Description) - Icon Removed */}
                      <div className="flex flex-col items-center text-center">
                        <h3 className="text-2xl md:text-3xl font-semibold mb-4 text-[color:var(--accent-color)] font-newsreader"
                            dangerouslySetInnerHTML={{ __html: features[activeTabIndex].title }}>
                        </h3>
                        <p className="text-md md:text-lg text-[color:var(--primary-color)]/90 leading-relaxed max-w-xl"
                           dangerouslySetInnerHTML={{ __html: features[activeTabIndex].description }}>
                        </p>
                      </div>

                      {/* Sub-tabs for "Tag Documents" - Styled like main tabs */}
                      <div className="flex border-b border-[color:var(--border-color)]/30 mb-6 md:mb-8 justify-center">
                        {tagDocsViewNames.map((viewName, index) => (
                          <button
                            key={viewName}
                            onClick={() => handleTagDocsViewChange(index)}
                            className={`py-3 px-4 sm:px-5 font-medium text-xs sm:text-sm focus:outline-none transition-all duration-300 ease-in-out relative group
                              ${currentTagDocsImageIndex === index
                                ? 'text-[color:var(--accent-color)]'
                                : 'text-[color:var(--muted-text-color)] hover:text-[color:var(--primary-color)]'
                              }`}
                          >
                            {viewName}
                            <span className={`absolute bottom-[-1px] left-0 w-full h-0.5 bg-[color:var(--accent-color)] transform transition-transform duration-300 ease-out
                              ${currentTagDocsImageIndex === index ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`}></span>
                          </button>
                        ))}
                      </div>

                      {/* Image display area with Fade Animation */}
                      <div className="w-full flex justify-center items-start relative min-h-[250px] sm:min-h-[300px] md:min-h-[400px]">
                        <AnimatePresence mode="wait">
                          <motion.img
                            key={tagDocsImageSources[currentTagDocsImageIndex]}
                            src={tagDocsImageSources[currentTagDocsImageIndex]}
                            alt={`${features[activeTabIndex].title} - ${tagDocsViewNames[currentTagDocsImageIndex]}`}
                            className="rounded-lg shadow-xl h-auto object-contain w-full max-w-lg" // Added max-w-lg for consistency
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, position: 'absolute', top:0, left:0 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                          />
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  ) : activeTabIndex === 2 ? ( // Layout for "Interact Your Way" tab (index 2)
                    <motion.div
                      key={activeTabIndex}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="flex flex-col items-center text-center w-full gap-6 md:gap-8"
                    >
                      {/* Text Content (Title, Description) - Icon Removed */}
                      <div className="flex flex-col items-center text-center">
                        <h3 className="text-2xl md:text-3xl font-semibold mb-4 text-[color:var(--accent-color)] font-newsreader"
                            dangerouslySetInnerHTML={{ __html: features[activeTabIndex].title }}>
                        </h3>
                        <p className="text-md md:text-lg text-[color:var(--primary-color)]/90 leading-relaxed max-w-xl"
                           dangerouslySetInnerHTML={{ __html: features[activeTabIndex].description }}>
                        </p>
                      </div>

                      {/* Image Below Text */}
                      <div className="w-full flex justify-center items-center mt-4 md:mt-6">
                        <img
                          src="/audio_usage_1.png" // Assuming image is in public folder
                          alt={features[activeTabIndex].title}
                          className="rounded-lg shadow-xl h-auto object-contain max-w-lg w-full"
                        />
                      </div>
                    </motion.div>
                  ) : activeTabIndex === 3 ? (
                    // Layout for "Stay Organized" tab (index 3)
                    <motion.div
                      key={activeTabIndex}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="flex flex-col items-center text-center w-full gap-6 md:gap-8"
                    >
                      {/* Text Content (Title, Description) - Icon Removed */}
                      <div className="flex flex-col items-center text-center">
                        <h3 className="text-2xl md:text-3xl font-semibold mb-4 text-[color:var(--accent-color)] font-newsreader"
                            dangerouslySetInnerHTML={{ __html: features[activeTabIndex].title }}>
                        </h3>
                        <p className="text-md md:text-lg text-[color:var(--primary-color)]/90 leading-relaxed max-w-xl"
                           dangerouslySetInnerHTML={{ __html: features[activeTabIndex].description }}>
                        </p>
                      </div>

                      {/* Image Below Text */}
                      <div className="w-full flex justify-center items-center mt-4 md:mt-6">
                        <img
                          src="/file_browser_1.png" // Assuming image is in public folder
                          alt={features[activeTabIndex].title}
                          className="rounded-lg shadow-xl h-auto object-contain max-w-lg w-full"
                        />
                      </div>
                    </motion.div>
                  ) : activeTabIndex === 4 ? (
                    // Layout for "Use different models" tab (index 4)
                    <motion.div
                      key={activeTabIndex}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="flex flex-col items-center text-center w-full gap-6 md:gap-8"
                    >
                      {/* Text Content (Title, Description) - Icon Removed */}
                      <div className="flex flex-col items-center text-center">
                        <h3 className="text-2xl md:text-3xl font-semibold mb-4 text-[color:var(--accent-color)] font-newsreader"
                            dangerouslySetInnerHTML={{ __html: features[activeTabIndex].title }}>
                        </h3>
                        <p className="text-md md:text-lg text-[color:var(--primary-color)]/90 leading-relaxed max-w-xl"
                           dangerouslySetInnerHTML={{ __html: features[activeTabIndex].description }}>
                        </p>
                      </div>

                      {/* Image Below Text */}
                      <div className="w-full flex justify-center items-center mt-4 md:mt-6">
                        <img
                          src="/user_diff_models_1.png" // Assuming image is in public folder
                          alt={features[activeTabIndex].title}
                          className="rounded-lg shadow-xl h-auto object-contain max-w-lg w-full"
                        />
                      </div>
                    </motion.div>
                  ) : (
                    // Default centered layout for the remaining tab (Interact Your Way - index 2)
                    <motion.div
                      key={activeTabIndex}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="flex flex-col items-center text-center w-full"
                    >
                      {/* Icon Div Removed
                      <div className="mb-5">
                        {React.cloneElement(features[activeTabIndex].icon as React.ReactElement, { className: "h-10 w-10 text-[color:var(--muted-text-color)]" })}
                      </div>
                      */}
                      <h3 className="text-2xl md:text-3xl font-semibold mb-4 text-[color:var(--accent-color)] font-newsreader"
                          dangerouslySetInnerHTML={{ __html: features[activeTabIndex].title }}>
                      </h3>
                      <p className="text-md md:text-lg text-[color:var(--primary-color)]/90 leading-relaxed max-w-md"
                         dangerouslySetInnerHTML={{ __html: features[activeTabIndex].description }}>
                        </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div> {/* End of Tab Content Card Container */}
          </section>

        </div>

        {/* Footer Section - Added relative z-20 */}
        <footer className="py-12 bg-[color:var(--bg-color)] relative z-20">
          <div className="container mx-auto px-6">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <div className="mb-6 md:mb-0">
                <Link href="/" className="flex items-center">
                  <img src="/tuon-logo-svg-type.svg" alt="Tuon Logo" className="h-8 w-8 mr-2" style={{ filter: 'var(--logo-filter)' }} />
                  <span className="text-xl font-bold text-[color:var(--accent-color)] font-newsreader">tuon.io</span>
                </Link>
                <p className="text-sm text-[color:var(--primary-color)]/60 mt-2">Bring it all into focus</p>
              </div>
              <div className="flex flex-col md:flex-row gap-x-8 gap-y-4 text-sm text-[color:var(--primary-color)]/60">
                {/* <Link href="#" className="hover:text-[color:var(--accent-color)]">About Us</Link> */}
                <Link href="/privacy" className="hover:text-[color:var(--accent-color)]">Privacy Policy</Link>
                <Link href="/terms" className="hover:text-[color:var(--accent-color)]">Terms of Service</Link>
                {/* <Link href="mailto:support@dodatathings.dev" className="hover:text-[color:var(--accent-color)]">Contact</Link> */}
              </div>
            </div>
             {/* Use theme variables */}
            <div className="mt-8 pt-8 border-t border-[color:var(--border-color)]/20 text-center text-sm text-[color:var(--primary-color)]/60">
              © {new Date().getFullYear()} dodatathings.dev. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
} 