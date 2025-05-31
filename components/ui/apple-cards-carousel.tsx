// @ts-nocheck
"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, forwardRef } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { ImageProps } from "next/image";
import React from "react";

// ------------------------------------
// Types
// ------------------------------------
interface CarouselProps {
  items: JSX.Element[];
  initialScroll?: number;
  scrollToCarousel?: () => void;
}

type CardType = {
  src: string;
  previewImageSrc?: string;
  title: string;
  category: string;
  content: ReactNode;
  caption?: string;
};

// ------------------------------------
// Context for managing close actions
// ------------------------------------
export const CarouselContext = createContext<{
  onCardClose: (index: number) => void;
  currentIndex: number;
  scrollToCarousel?: () => void;
}>({
  // eslint-disable-next-line no-empty-function
  onCardClose: () => {},
  currentIndex: 0,
  scrollToCarousel: undefined,
});

// ------------------------------------
// Carousel Wrapper
// ------------------------------------
export const Carousel = forwardRef<HTMLDivElement, CarouselProps>(({ items, initialScroll = 0, scrollToCarousel }, forwardedRef) => {
  const actualScrollableDivRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  // ----------------------------------
  // Helpers
  // ----------------------------------
  const isMobile = () => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768;
  };

  const checkScrollability = () => {
    if (!actualScrollableDivRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = actualScrollableDivRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth);
  };

  // ----------------------------------
  // Effects
  // ----------------------------------
  useEffect(() => {
    if (actualScrollableDivRef.current) {
      actualScrollableDivRef.current.scrollLeft = initialScroll;
      checkScrollability();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScroll]);

  // ----------------------------------
  // Scroll Handlers
  // ----------------------------------
  const scrollLeft = () => {
    if (actualScrollableDivRef.current) {
      actualScrollableDivRef.current.scrollBy({ left: -300, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (actualScrollableDivRef.current) {
      actualScrollableDivRef.current.scrollBy({ left: 300, behavior: "smooth" });
    }
  };

  const handleCardClose = (index: number) => {
    if (actualScrollableDivRef.current) {
      const cardWidth = isMobile() ? 230 : 384; // md:w-96 in tailwind
      const gap = isMobile() ? 4 : 8;
      const scrollPosition = (cardWidth + gap) * (index + 1);
      actualScrollableDivRef.current.scrollTo({ left: scrollPosition, behavior: "smooth" });
      setCurrentIndex(index);
    }
  };

  // ----------------------------------
  // JSX
  // ----------------------------------
  return (
    <CarouselContext.Provider value={{ onCardClose: handleCardClose, currentIndex, scrollToCarousel }}>
      <div className="relative w-full" ref={forwardedRef}>
        {/* Scrollable Cards Row */}
        <div
          ref={actualScrollableDivRef}
          className="flex w-full overflow-x-scroll overscroll-x-auto scroll-smooth py-10 [scrollbar-width:none] md:py-20"
          onScroll={checkScrollability}
        >
          {/* Right fade */}
          <div className="absolute right-0 z-[1000] h-auto w-[5%] overflow-hidden bg-gradient-to-l" />

          <div
            className={cn(
              "flex flex-row justify-start gap-4 pl-4",
              "mx-auto max-w-7xl" // make carousel centered within container
            )}
          >
            {items.map((item, index) => (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.2 * index, ease: "easeOut" } }}
                key={"card" + index}
                className="rounded-3xl last:pr-[5%] md:last:pr-[33%]"
              >
                {item}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="mr-10 flex justify-end gap-2">
          <button
            className="relative z-40 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 disabled:opacity-50"
            onClick={scrollLeft}
            disabled={!canScrollLeft}
          >
            <ArrowLeft className="h-6 w-6 text-gray-500" />
          </button>
          <button
            className="relative z-40 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 disabled:opacity-50"
            onClick={scrollRight}
            disabled={!canScrollRight}
          >
            <ArrowRight className="h-6 w-6 text-gray-500" />
          </button>
        </div>
      </div>
    </CarouselContext.Provider>
  );
});

Carousel.displayName = 'Carousel';

// ------------------------------------
// Card Component
// ------------------------------------
interface CardProps {
  card: CardType;
  index: number;
  layout?: boolean;
}

export const Card: React.FC<CardProps> = ({ card, index, layout = false }) => {
  const [open, setOpen] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { onCardClose, scrollToCarousel } = useContext(CarouselContext);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // If a zoomed image is open, close only that.
        if (zoomedImage) {
          setZoomedImage(null);
        } else {
          handleClose();
        }
      }
    };

    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, zoomedImage]);

  useOutsideClick(containerRef, () => {
    // Only close the card if no image is zoomed
    if (!zoomedImage) {
      handleClose();
    }
  });

  const handleOpen = () => {
    if (scrollToCarousel) {
      scrollToCarousel();
    }
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    onCardClose(index);
  };

  // Helper to render content with clickable images
  function renderContentWithZoom(content: React.ReactNode) {
    // If content is an array, map recursively
    if (Array.isArray(content)) {
      return content.map((section, i) => (
        <div key={i} className="bg-[color:var(--card-bg)] p-8 md:p-14 rounded-3xl mb-4">
          {renderContentWithZoom(section)}
        </div>
      ));
    }
    // If content is a React element, clone and add onClick to images
    if (React.isValidElement(content)) {
      // If it's an image, add onClick and effects via a wrapper
      if (content.type === 'img') {
        const originalImageProps = content.props;

        return (
          <div
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              setZoomedImage(originalImageProps.src);
            }}
            className="inline-block cursor-zoom-in shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-200 ease-in-out rounded-md overflow-hidden"
          >
            {/* Clone the original image, ensuring it fits inside the wrapper */}
            {React.cloneElement(content, {
              ...originalImageProps,
              className: cn(originalImageProps.className), // Keep original classes
              style: {
                ...(originalImageProps.style || {}), // Keep original styles
                display: 'block',                   // Ensure image is block for layout
                maxWidth: '100%',                   // Image fills wrapper width-wise
                maxHeight: '300px',                  // <-- SET explicit maxHeight ON IMAGE
                objectFit: 'contain',               // Maintain aspect ratio
              },
              onClick: undefined, // onClick is handled by the wrapper
            })}
          </div>
        );
      }
      // Otherwise, recursively process children
      if (content.type === 'p') {
        return React.cloneElement(content, {
          className: cn(content.props.className, "text-left"),
        },
          React.Children.map(content.props.children, renderContentWithZoom)
        );
      }
      // For other elements, just process children
      return React.cloneElement(content, {},
        React.Children.map(content.props.children, renderContentWithZoom)
      );
    }
    // Otherwise, return as is
    return content;
  }

  return (
    <>
      {/* Expanded view */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 h-screen overflow-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 h-full w-full bg-black/80 backdrop-blur-lg"
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              ref={containerRef}
              layoutId={layout ? `card-${card.title}` : undefined}
              className="relative z-[60] mx-auto my-10 h-fit max-w-2xl rounded-3xl bg-[color:var(--editor-bg)] p-4 font-sans md:p-10"
            >
              {/* Close button */}
              <button
                className="sticky top-4 right-0 ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-black dark:bg-white"
                onClick={handleClose}
              >
                <X className="h-6 w-6 text-neutral-100 dark:text-neutral-900" />
              </button>

              {/* Popup content wrapper */}
              <div className="popup-card-content">
                <motion.p
                  layoutId={layout ? `category-${card.title}` : undefined}
                  className="text-base font-medium text-black dark:text-white"
                >
                  {card.category}
                </motion.p>
                <motion.p
                  layoutId={layout ? `title-${card.title}` : undefined}
                  className="text-2xl md:text-3xl font-semibold text-center mb-4 text-[color:var(--accent-color)] font-newsreader w-full"
                >
                  {card.title.split(/<br *\/?>/i).map((line, index, arr) => (
                    <React.Fragment key={index}>
                      {line}
                      {index < arr.length - 1 && <br />}
                    </React.Fragment>
                  ))}
                </motion.p>
                {/* Wrap each content block in a styled div, matching the example */}
                {renderContentWithZoom(card.content)}
              </div>
            </motion.div>
            {/* Zoomed image modal overlay */}
            {zoomedImage && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
                onClick={(e) => {
                  e.stopPropagation(); // Prevent click from propagating to useOutsideClick
                  setZoomedImage(null);
                }}
              >
                <img src={zoomedImage} alt="Zoomed" className="max-w-full max-h-full rounded-xl shadow-2xl" style={{ background: 'white' }} />
                <button
                  className="absolute top-6 right-6 bg-black/70 text-white rounded-full p-2 z-[101] hover:bg-black"
                  onClick={e => { e.stopPropagation(); setZoomedImage(null); }}
                  aria-label="Close image preview"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            )}
          </div>
        )}
      </AnimatePresence>

      {/* Collapsed card */}
      <motion.button
        layoutId={layout ? `card-${card.title}` : undefined}
        onClick={handleOpen}
        className="relative z-10 flex h-80 w-56 flex-col items-start justify-start overflow-hidden rounded-3xl bg-[color:var(--card-bg)]/70 backdrop-blur-lg border border-[color:var(--border-color)]/25 md:h-[30rem] md:w-96 transition-all duration-300 ease-in-out hover:scale-[1.02] hover:border-[color:var(--accent-color)]"
      >
        {/* Image masked to bottom half only */}
        {card.previewImageSrc && (
          <img
            src={card.previewImageSrc}
            alt={card.title || "Card preview"}
            className="absolute inset-0 w-full h-full object-cover rounded-xl pointer-events-none"
            style={{
              maskImage: 'linear-gradient(to bottom, transparent 25%, black 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 25%, black 100%)',
              zIndex: 0,
            }}
          />
        )}
        {/* Card content above mask */}
        <div className="relative z-10 w-full flex flex-col items-center px-3">
          <p className="text-left font-sans text-sm font-medium text-[color:var(--muted-text-color)] md:text-base mb-2 w-full">{card.category}</p>
          <p className="text-2xl md:text-3xl font-semibold text-center mb-1 text-[color:var(--accent-color)] font-newsreader w-full">
            {card.title.split(/<br *\/?>/i).map((line, index, arr) => (
              <React.Fragment key={index}>
                {line}
                {index < arr.length - 1 && <br />}
              </React.Fragment>
            ))}
          </p>
          {card.caption && (
            <p className="text-sm text-[color:var(--muted-text-color)] text-center mt-2 mb-0 w-full">{card.caption}</p>
          )}
        </div>
      </motion.button>
    </>
  );
};

// ------------------------------------
// Blur Image helper (graceful loading)
// ------------------------------------
export const BlurImage: React.FC<ImageProps> = ({ height, width, src, className, alt, ...rest }) => {
  const [isLoading, setLoading] = useState(true);
  return (
    <img
      className={cn(
        "h-full w-full transition duration-300",
        isLoading ? "blur-sm" : "blur-0",
        className
      )}
      onLoad={() => setLoading(false)}
      src={src as string}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      alt={alt ? alt : "Background"}
      {...rest}
    />
  );
};