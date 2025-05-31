import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ChevronRight } from "lucide-react";

export default function FaqAccordion() {
  return (
    <Accordion
      type="single"
      collapsible
      className="w-full rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900"
    >
      <AccordionItem
        value="item-1"
        className="group rounded-lg border bg-card px-6 data-[state=open]:mb-2 dark:bg-zinc-950"
      >
        <AccordionTrigger className="py-4 text-base hover:no-underline">
          <div className="flex items-center text-[color:var(--primary-color)]">
            <ChevronRight className="mr-4 h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            What is Tuon?
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-4 pl-12 text-sm text-[color:var(--muted-text-color)]">
          Tuon is a platform that helps you streamline your creative workflows with AI.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem
        value="item-2"
        className="group mb-2 rounded-lg border bg-card px-6 data-[state=open]:mb-2 dark:bg-zinc-950"
      >
        <AccordionTrigger className="py-4 text-base hover:no-underline">
          <div className="flex items-center text-[color:var(--primary-color)]">
            <ChevronRight className="mr-4 h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            How can I get started?
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-4 pl-12 text-sm text-[color:var(--muted-text-color)]">
          Sign up for an account and explore the features.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem
        value="item-3"
        className="group rounded-lg border bg-card px-6 data-[state=open]:mb-2 dark:bg-zinc-950"
      >
        <AccordionTrigger className="py-4 text-base hover:no-underline">
          <div className="flex items-center text-[color:var(--primary-color)]">
            <ChevronRight className="mr-4 h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            Is there a free trial?
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-4 pl-12 text-sm text-[color:var(--muted-text-color)]">
          Yes, Tuon offers a free trial for new users.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem
        value="item-4"
        className="group rounded-lg border bg-card px-6 data-[state=open]:mb-2 dark:bg-zinc-950"
      >
        <AccordionTrigger className="py-4 text-base hover:no-underline">
          <div className="flex items-center text-[color:var(--primary-color)]">
            <ChevronRight className="mr-4 h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            Where can I find more help?
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-4 pl-12 text-sm text-[color:var(--muted-text-color)]">
          Check out our documentation or contact support.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
