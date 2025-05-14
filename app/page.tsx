'use client'; // Add this line because we're using useState

import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, BrainCircuit, Clock, Layers, Zap } from "lucide-react";
import { Button } from "@/components/ui/button"; // Correct import path
import { motion, AnimatePresence } from "framer-motion"; // Import AnimatePresence

// Define the type for features explicitly
interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

// Renamed component to avoid conflict with default export naming conventions if needed elsewhere
export default function LandingPageContent() {
  console.log("LandingPageContent rendering..."); // Add log here
  const [email, setEmail] = useState("");
  const [activeTabIndex, setActiveTabIndex] = useState(0); // New state for active tab
  const featuresSectionRef = useRef<HTMLDivElement>(null); // New ref for the features section

  const features: Feature[] = [
    {
      icon: <Layers className="h-8 w-8 text-[color:var(--muted-text-color)]" />, // Use CSS variable
      title: "One Flow, One Canvas",
      description: "Jumpstart ideas with AI and work on the same canvas. Stay in flow."
    },
    {
      icon: <Clock className="h-8 w-8 text-[color:var(--muted-text-color)]" />, // Use CSS variable
      title: "Tag Documents",
      description: "Tag documents as context for AI and never start from zero."
    },
    {
      icon: <Zap className="h-8 w-8 text-[color:var(--muted-text-color)]" />, // Use CSS variable
      title: "Interact Your Way",
      description: "Engage with your AI editor using voice, text, or even images for ultimate flexibility."
    },
    {
      icon: <BrainCircuit className="h-8 w-8 text-[color:var(--muted-text-color)]" />, // Use CSS variable
      title: "Stay Organized",
      description: "Easily manage your files and notes with an intuitive browser and folder system."
    },
    {
      icon: <BrainCircuit className="h-8 w-8 text-[color:var(--muted-text-color)]" />, // Use CSS variable for the new tab
      title: "Use different models",
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Consider a more robust notification system than alert
    alert(`Thank you for your interest! We'll notify ${email} when we launch.`);
    setEmail("");
  };

  // Ref for the main parallax container
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

  // Effect for Parallax Background Scroll - REMOVED
  /*
  useEffect(() => {
    const scrollElement = scrollContainerRef.current; // Target the flex-grow div
    const mainElement = mainRef.current; // Still need main for setting the style

    if (!scrollElement || !mainElement) {
      console.log("Parallax effect: scrollContainerRef or mainRef is null on mount, exiting.");
      return; // Exit if refs are not available yet
    }
    console.log("Attaching parallax scroll listener to scroll container:", scrollElement);

    const handleScroll = () => {
      console.log("Scroll event detected on scroll container!");
      const scrollY = scrollElement.scrollTop; // Use scrollTop of the scroll container
      const offsetY = scrollY * 0.4;
      console.log(`scrollContainer.scrollTop: ${scrollY}, calculated offsetY: ${offsetY}`);
      // Apply the style to the main parallax background element
      mainElement.style.setProperty('--background-offset-y', `${offsetY}px`); 
    };

    scrollElement.addEventListener('scroll', handleScroll); // Attach listener to scroll container
    handleScroll(); // Initial call

    // Cleanup listener on unmount
    return () => {
      console.log("Removing parallax scroll listener from scroll container");
      scrollElement.removeEventListener('scroll', handleScroll); // Remove listener from scroll container
    };
    // Dependency array still empty
  }, []); 
  */

  const handleTabClick = (index: number) => {
    setActiveTabIndex(index);
    // Scroll to the start of the features section, making tabs visible
    featuresSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    // Removed min-h-screen from main, letting inner div control height
    // <main ref={mainRef} className="parallax-bg text-[color:var(--text-color)] "> // REMOVED mainRef
    <main className="parallax-bg text-[color:var(--text-color)] "> 
      {/* Content wrapper - Make it a flex container filling height */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header Section - Added relative z-20 */}
        <header className="container mx-auto px-6 py-6 flex items-center justify-between relative z-20">
          <div className="flex items-center">
            {/* Use theme variable for logo color */}
            <img src="/tuon-logo-svg-type.svg" alt="Tuon Logo" className="h-8 w-8" style={{ filter: 'var(--logo-filter)' }} />
          </div>
          <nav className="hidden md:flex items-center space-x-8">
            {/* Use theme variables for nav links */}
            {/* <a href="#features" className="text-sm font-medium text-[color:var(--primary-color)]/80 hover:text-[color:var(--accent-color)] transition-colors">Features</a> */}
            {/* <a href="#how-it-works" className="text-sm font-medium text-[color:var(--primary-color)]/80 hover:text-[color:var(--accent-color)] transition-colors">How It Works</a> */}
            {/* Use theme variables for button colors/hover */}
            {/* <Button variant="ghost" className="text-sm text-[color:var(--primary-color)] hover:text-[color:var(--accent-color)] hover:bg-[color:var(--hover-bg)]/20">Sign In</Button> */}
            <Button className="text-sm bg-[color:var(--primary-color)] text-[color:var(--bg-color)] hover:bg-[color:var(--accent-color)]">Get Started</Button>
          </nav>
        </header>

        {/* Main Content Area - Added ref and overflow */}
        <div ref={scrollContainerRef} className="flex-grow overflow-y-auto"> 
          {/* Hero Section */}
          <div className="card-snap-wrapper flex items-center justify-center px-4">
            <section 
              ref={heroRef} // Add the ref here
              className="hero-section container mx-auto py-32 md:py-40 flex items-center justify-center text-center min-h-[calc(100vh-500px)] w-full">
              {/* Add semi-transparent overlay for readability */}
              <div className="absolute inset-0 bg-black/50 z-0"></div>
              <motion.div 
                className="max-w-4xl mx-auto relative z-10"
                initial="hidden"
                animate={isHeroVisible ? "visible" : "hidden"} // Use state here
                transition={{ staggerChildren: 0.2 }}
              >
                <motion.h1
                  className="text-5xl md:text-6xl lg:text-7xl font-bold leading-tight text-[color:var(--accent-color)] mb-8 font-newsreader"
                  variants={headingVariants}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                >
                  Seamless ideas, <br />seamless work.
                </motion.h1>
                <motion.p 
                  className="text-lg md:text-xl text-[color:var(--primary-color)]/90 mb-12 max-w-2xl leading-relaxed mx-auto"
                  variants={contentVariants}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                >
                  Tuon removes friction between AI and your organic creative flow. Focus on crafting your best notes, documents & research in one place.
                </motion.p>
                <motion.div 
                  className="flex flex-col sm:flex-row gap-4 justify-center"
                  variants={buttonVariants}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                >
                  {/* <Button className="bg-[color:var(--primary-color)] text-[color:var(--bg-color)] hover:bg-[color:var(--accent-color)] px-8 py-6 text-base">
                    Try the Demo
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                  <Button variant="ghost" className="border border-[color:var(--primary-color)]/20 text-[color:var(--primary-color)] hover:bg-[color:var(--hover-bg)]/20 hover:text-[color:var(--accent-color)] px-8 py-6 text-base">
                    Explore Features
                  </Button> */}
                </motion.div>
              </motion.div>
            </section>
          </div>

          {/* New Tabbed Features Section */}
          <section ref={featuresSectionRef} id="features-tabs" className="py-20 min-h-screen flex flex-col items-center">
            {/* Tabs Container - Stays max-w-3xl */}
            <div className="w-full max-w-3xl mx-auto px-4">
              {/* Tabs */}
              <div className="flex border-b border-[color:var(--border-color)]/30 mb-8 justify-center">
                {features.map((feature, index) => (
                  <button
                    key={index}
                    onClick={() => handleTabClick(index)}
                    className={`py-3 px-4 sm:px-5 font-medium text-xs sm:text-sm md:text-base focus:outline-none transition-all duration-300 ease-in-out relative group
                      ${activeTabIndex === index
                        ? 'text-[color:var(--accent-color)]'
                        : 'text-[color:var(--muted-text-color)] hover:text-[color:var(--primary-color)]'
                      }`}
                  >
                    {feature.title}
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
                    // Special layout for "One Flow, One Canvas"
                    <motion.div
                      key={activeTabIndex}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-10 w-full" // Added md:gap-10
                    >
                      {/* Text Content on the Left */}
                      <div className="md:w-1/2 flex flex-col items-center md:items-start text-center md:text-left">
                        <div className="mb-5">
                          {React.cloneElement(features[activeTabIndex].icon as React.ReactElement, { className: "h-10 w-10 text-[color:var(--muted-text-color)]" })}
                        </div>
                        <h3 className="text-2xl md:text-3xl font-semibold mb-4 text-[color:var(--accent-color)] font-newsreader">
                          {features[activeTabIndex].title}
                        </h3>
                        <p className="text-md md:text-lg text-[color:var(--primary-color)]/90 leading-relaxed">
                          {features[activeTabIndex].description}
                        </p>
                      </div>

                      {/* Image on the Right */}
                      <div className="md:w-1/2 flex justify-center items-center mt-6 md:mt-0">
                        <img
                          src="/one_flow_one_canvas.png"
                          alt={features[activeTabIndex].title}
                          className="rounded-lg shadow-xl w-full h-auto object-contain max-h-[300px] md:max-h-[380px]" // Increased max-h slightly
                        />
                      </div>
                    </motion.div>
                  ) : activeTabIndex === 1 ? (
                    // Special layout for "Tag Documents"
                    <motion.div
                      key={activeTabIndex} // Use activeTabIndex for key to ensure re-render on tab change
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-10 w-full"
                    >
                      {/* Text Content on the Left */}
                      <div className="md:w-1/2 flex flex-col items-center md:items-start text-center md:text-left">
                        <div className="mb-5">
                          {React.cloneElement(features[activeTabIndex].icon as React.ReactElement, { className: "h-10 w-10 text-[color:var(--muted-text-color)]" })}
                        </div>
                        <h3 className="text-2xl md:text-3xl font-semibold mb-4 text-[color:var(--accent-color)] font-newsreader">
                          {features[activeTabIndex].title}
                        </h3>
                        <p className="text-md md:text-lg text-[color:var(--primary-color)]/90 leading-relaxed">
                          {features[activeTabIndex].description}
                        </p>
                      </div>

                      {/* Images on the Right, stacked vertically */}
                      <div className="md:w-1/2 flex flex-col items-center justify-center gap-4 md:gap-6 mt-6 md:mt-0">
                        <img
                          src="/tag_docs_2.png" // Assuming image is in public folder
                          alt="Tag documents example 1"
                          className="rounded-lg shadow-xl w-full h-auto object-contain"
                        />
                        <img
                          src="/tag_docs_3.png" // Assuming image is in public folder
                          alt="Tag documents example 2"
                          className="rounded-lg shadow-xl w-full h-auto object-contain"
                        />
                      </div>
                    </motion.div>
                  ) : (
                    // Default centered layout for other tabs
                    <motion.div
                      key={activeTabIndex}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="flex flex-col items-center text-center w-full"
                    >
                      <div className="mb-5">
                        {React.cloneElement(features[activeTabIndex].icon as React.ReactElement, { className: "h-10 w-10 text-[color:var(--muted-text-color)]" })}
                      </div>
                      <h3 className="text-2xl md:text-3xl font-semibold mb-4 text-[color:var(--accent-color)] font-newsreader">
                        {features[activeTabIndex].title}
                      </h3>
                      <p className="text-md md:text-lg text-[color:var(--primary-color)]/90 leading-relaxed max-w-md">
                        {features[activeTabIndex].description}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div> {/* End of Tab Content Card Container */}
          </section>

          {/* Waitlist Section */}
           {/* Added background color to section */}
          <section className="py-20 bg-[color:var(--bg-color)] relative z-10">
            <div className="container mx-auto px-4 text-center">
               {/* Use theme variables */}
              <h2 className="text-3xl md:text-4xl font-bold mb-6 text-[color:var(--accent-color)] font-newsreader">Ready to focus on what matters?</h2>
              <p className="text-[color:var(--primary-color)]/90 max-w-2xl mx-auto mb-8 text-lg">Join the waitlist to be notified when we launch and get early access to Tuon.io</p>
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
                <input
                  type="email"
                  placeholder="Enter your email"
                   // Use theme variables for input styling
                  className="px-4 py-3 rounded-lg flex-grow bg-[color:var(--input-bg)]/40 border border-[color:var(--border-color)]/20 text-[color:var(--accent-color)] placeholder:text-[color:var(--primary-color)]/50 focus:outline-none focus:ring-2 focus:ring-[color:var(--primary-color)]/30"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                 {/* Use theme variables */}
                <Button type="submit" className="bg-[color:var(--primary-color)] text-[color:var(--bg-color)] hover:bg-[color:var(--accent-color)] px-6 py-3 rounded-lg font-medium">
                  Join Waitlist
                </Button>
              </form>
            </div>
          </section>
        </div>

        {/* Footer Section - Added relative z-20 */}
        <footer className="py-12 bg-[color:var(--bg-color)] relative z-20">
          <div className="container mx-auto px-6">
            {/* <div className="flex flex-col md:flex-row justify-between items-center">
              <div className="mb-6 md:mb-0">
                <span className="text-xl font-bold text-[color:var(--accent-color)] font-newsreader">tuon.io</span>
                <p className="text-sm text-[color:var(--primary-color)]/60 mt-2">Focus on what matters most.</p>
              </div>
              <div className="flex flex-col md:flex-row gap-8 text-sm text-[color:var(--primary-color)]/60">
                <a href="#" className="hover:text-[color:var(--accent-color)]">About Us</a>
                <a href="#" className="hover:text-[color:var(--accent-color)]">Privacy Policy</a>
                <a href="#" className="hover:text-[color:var(--accent-color)]">Terms of Service</a>
                <a href="#" className="hover:text-[color:var(--accent-color)]">Contact</a>
              </div>
            </div> */}
             {/* Use theme variables */}
            <div className="mt-8 pt-8 text-center text-sm text-[color:var(--primary-color)]/60">
              © {new Date().getFullYear()} dodatathings.dev. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
} 