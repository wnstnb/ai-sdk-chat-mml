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
    hidden: { opacity: 0, filter: 'blur(8px)' },
    visible: { opacity: 1, filter: 'blur(0px)' },
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Consider a more robust notification system than alert
    alert(`Thank you for your interest! We'll notify ${email} when we launch.`);
    setEmail("");
  };

  // Intersection Observer Logic
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          } else {
            entry.target.classList.remove('is-visible');
          }
        });
      },
      {
        root: null, // Use the viewport as the root
        rootMargin: '0px',
        threshold: 0.3, // Trigger when 30% of the element is visible
      }
    );

    // Select all feature cards and observe them
    const cards = document.querySelectorAll('.feature-card');
    cards.forEach((card) => observer.observe(card));

    // Cleanup function to unobserve targets when component unmounts
    return () => {
      cards.forEach((card) => observer.unobserve(card));
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    // Keep the parallax background on the main container
    <main className="parallax-bg min-h-screen text-[color:var(--text-color)] ">
      {/* Content wrapper with relative positioning and z-index */}
      <div className="relative z-10">
        {/* Header Section */}
        <header className="container mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center">
            {/* Use theme variable for logo color */}
            <span className="text-2xl font-bold text-[color:var(--accent-color)] tracking-tight">tuon.io</span>
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

        {/* Main Content Area */}
        <div className="flex-grow"> {/* Use div instead of main as main is already the parent */}
          {/* Hero Section */}
          <section className="container mx-auto px-6 py-32 md:py-40 flex items-center justify-center text-center min-h-[calc(100vh-100px)]"> {/* Adjusted padding/height */}
             {/* Add semi-transparent overlay for readability */}
             <div className="absolute inset-0 bg-black/50 z-0"></div> 
             <div className="max-w-4xl mx-auto relative z-10"> {/* Ensure content is above overlay */}
              {/* Use theme variable for heading and wrap with motion */}
              <motion.h1
                className="text-5xl md:text-6xl lg:text-7xl font-bold leading-tight text-[color:var(--accent-color)] mb-8"
                variants={headingVariants}
                initial="hidden"
                animate="visible"
                transition={{ duration: 1.75, ease: "easeOut" }} // Adjust timing as needed
              >
                Focus on creation, <br />not distraction
              </motion.h1>
              {/* Use theme variable for paragraph text, adjust opacity/variable if needed */}
              <p className="text-lg md:text-xl text-[color:var(--primary-color)]/90 mb-12 max-w-2xl leading-relaxed mx-auto">
                Tired of complex tools that get in your way? Us too. We built something different—minimal, intelligent, and designed to let you focus on what matters.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {/* Use theme variables for button colors/hover */}
                {/* <Button className="bg-[color:var(--primary-color)] text-[color:var(--bg-color)] hover:bg-[color:var(--accent-color)] px-8 py-6 text-base">
                  Try the Demo
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button variant="ghost" className="border border-[color:var(--primary-color)]/20 text-[color:var(--primary-color)] hover:bg-[color:var(--hover-bg)]/20 hover:text-[color:var(--accent-color)] px-8 py-6 text-base">
                  Explore Features
                </Button> */}
              </div>
            </div>
          </section>

          {/* Features Section */}
          {/* Added background color to section for content visibility against parallax */}
          <section id="features" className="py-20 bg-[color:var(--bg-color)]">
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
                      <h3 className="text-xl font-semibold mb-3 text-[color:var(--accent-color)]">{feature.title}</h3>
                      <p className="text-[color:var(--primary-color)]/90">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Waitlist Section */}
           {/* Added background color to section */}
          <section className="py-20 bg-[color:var(--bg-color)]">
            <div className="container mx-auto px-4 text-center">
               {/* Use theme variables */}
              <h2 className="text-3xl md:text-4xl font-bold mb-6 text-[color:var(--accent-color)]">Ready to focus on what matters?</h2>
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

        {/* Footer Section */}
         {/* Added background color to section */}
        <footer className="py-12 border-t border-[color:var(--border-color)]/20 bg-[color:var(--bg-color)]">
          <div className="container mx-auto px-6">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <div className="mb-6 md:mb-0">
                 {/* Use theme variable */}
                <span className="text-xl font-bold text-[color:var(--accent-color)]">tuon.io</span>
                <p className="text-sm text-[color:var(--primary-color)]/60 mt-2">Focus on what matters most.</p>
              </div>
               {/* Use theme variables */}
              <div className="flex flex-col md:flex-row gap-8 text-sm text-[color:var(--primary-color)]/60">
                <a href="#" className="hover:text-[color:var(--accent-color)]">About Us</a>
                <a href="#" className="hover:text-[color:var(--accent-color)]">Privacy Policy</a>
                <a href="#" className="hover:text-[color:var(--accent-color)]">Terms of Service</a>
                <a href="#" className="hover:text-[color:var(--accent-color)]">Contact</a>
              </div>
            </div>
             {/* Use theme variables */}
            <div className="mt-8 pt-8 border-t border-[color:var(--border-color)]/20 text-center text-sm text-[color:var(--primary-color)]/60">
              © {new Date().getFullYear()} Tuon.io. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
} 