'use client'; // Add this line because we're using useState

import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, BrainCircuit, Clock, Layers, Zap } from "lucide-react";
import { Button } from "@/components/ui/button"; // Correct import path
import { motion } from "framer-motion"; // Import motion

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

  const features: Feature[] = [
    {
      icon: <Layers className="h-8 w-8 text-[color:var(--muted-text-color)]" />, // Use CSS variable
      title: "Centralized Content Hub",
      description: "Brings all your AI interactions, ideas, and research together in one easily accessible place."
    },
    {
      icon: <Clock className="h-8 w-8 text-[color:var(--muted-text-color)]" />, // Use CSS variable
      title: "Time-Saving Workflow",
      description: "Saves you time by eliminating the need to switch between multiple apps and platforms."
    },
    {
      icon: <Zap className="h-8 w-8 text-[color:var(--muted-text-color)]" />, // Use CSS variable
      title: "Smart Organization",
      description: "Keeps your content organized and searchable so you can always find what you need."
    },
    {
      icon: <BrainCircuit className="h-8 w-8 text-[color:var(--muted-text-color)]" />, // Use CSS variable
      title: "Contextual AI",
      description: "Allows you to use AI exactly when and how you need it, without unnecessary distractions."
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

  // Intersection Observer Logic - RESTORED
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Check if the entry's target is the hero section
          if (entry.target === heroRef.current) {
            setIsHeroVisible(entry.isIntersecting);
          }
          // Existing logic for adding/removing class (can keep or remove if only using state)
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          } else {
            entry.target.classList.remove('is-visible');
          }
        });
      },
      {
        root: null,
        rootMargin: '0px',
        threshold: 0.3,
      }
    );

    // Select all feature cards
    const cards = document.querySelectorAll('.feature-card');
    // Get the hero section element from the ref
    const heroSectionElement = heroRef.current;

    // Observe both feature cards and hero section
    cards.forEach((card) => observer.observe(card));
    if (heroSectionElement) observer.observe(heroSectionElement);

    // Cleanup function
    return () => {
      cards.forEach((card) => observer.unobserve(card));
      if (heroSectionElement) observer.unobserve(heroSectionElement);
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
            <span className="text-2xl font-bold text-[color:var(--accent-color)] tracking-tight font-newsreader">tuon.io</span>
          </div>
          <nav className="hidden md:flex items-center space-x-8">
            {/* Use theme variables for nav links */}
            <a href="#features" className="text-sm font-medium text-[color:var(--primary-color)]/80 hover:text-[color:var(--accent-color)] transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-[color:var(--primary-color)]/80 hover:text-[color:var(--accent-color)] transition-colors">How It Works</a>
            {/* Use theme variables for button colors/hover */}
            <Button variant="ghost" className="text-sm text-[color:var(--primary-color)] hover:text-[color:var(--accent-color)] hover:bg-[color:var(--hover-bg)]/20">Sign In</Button>
            <Button className="text-sm bg-[color:var(--primary-color)] text-[color:var(--bg-color)] hover:bg-[color:var(--accent-color)]">Get Started</Button>
          </nav>
        </header>

        {/* Main Content Area - Added ref and overflow */}
        <div ref={scrollContainerRef} className="flex-grow overflow-y-auto"> 
          {/* Hero Section */}
          <div className="card-snap-wrapper min-h-screen flex items-center justify-center px-4">
            <section 
              ref={heroRef} // Add the ref here
              className="hero-section container mx-auto py-32 md:py-40 flex items-center justify-center text-center min-h-[calc(100vh-100px)] w-full">
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
                  Focus on creation, <br />not distraction
                </motion.h1>
                <motion.p 
                  className="text-lg md:text-xl text-[color:var(--primary-color)]/90 mb-12 max-w-2xl leading-relaxed mx-auto"
                  variants={contentVariants}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                >
                  Tired of complex tools that get in your way? Us too. We built something different—minimal, intelligent, and designed to let you focus on what matters.
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

          {/* Features Section */}
          {/* Added background color to section for content visibility against parallax */}
          <section id="features" className="py-20">
            <div className="container mx-auto px-4">
              <div className="text-center max-w-3xl mx-auto mb-16">
                {/* Use theme variables */}
                {/* <h2 className="text-3xl md:text-4xl font-bold mb-6 text-[color:var(--accent-color)]">Everything you need to create with focus</h2>
                <p className="text-[color:var(--primary-color)]/90">Our platform brings together all the tools you need to create, organize, and enhance your content with AI assistance.</p> */}
              </div>
              {/* Remove centering/max-width from here, apply in wrapper */}
              <div className="flex flex-col">
                {features.map((feature, index) => (
                  // Add a wrapper div for scroll snapping
                  <div key={index} className="card-snap-wrapper min-h-screen flex items-center justify-center px-4">
                    {/* Card content - apply max-width here */}
                    <div
                      // Add feature-card class for IntersectionObserver & max-width for content
                      className="feature-card w-full max-w-3xl bg-[color:var(--card-bg)]/40 backdrop-blur-sm p-8 rounded-lg border border-[color:var(--border-color)]/20"
                    >
                      <div className="mb-5 text-[color:var(--primary-color)]">{feature.icon}</div>
                      <h3 className="text-xl font-semibold mb-3 text-[color:var(--accent-color)] font-newsreader">{feature.title}</h3>
                      <p className="text-[color:var(--primary-color)]/90">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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