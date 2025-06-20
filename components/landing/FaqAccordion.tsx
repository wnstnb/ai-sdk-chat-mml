import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const items = [
  {
    id: "0",
    title: "What is Tuon.io?",
    content: "Tuon.io is a platform for creating and managing your notes and documents. The term 'tuon' (pronounced TOO-on) is Tagalog for 'focus'. I got tired of jumping between tools and apps to keep notes and documents, so I built this. I wanted it to be light enough for me to replace Apple Notes but have capabilities that some platforms just don't get right.",
  },
  {
    id: "1",
    title: "Is there a free trial?",
    content: "Yes, there is a 7 day free trial. All features are available during the trial.",
  },
  {
    id: "2",
    title: "Is there version control for notes and documents?",
    content: "Yes, there is version control for notes and documents. You can revert to any previous version of a note or document. This is limited to the last 15 autosaves and 5 manual saves.",
  },
  {
    id: "3",
    title: "What models are currently available for use?",
    content: "Currently: GPT-4o, GPT-4.1, o4-mini, o3, Claude 3.5 Sonnet, and Claude 3.7 Sonnet. We have tested an assortment of models and have narrowed it down to models where tool usage with the app and interaction with the editor has been fairly consistent. This list may change going forward. Gemini 2.5 Flash is the default model, but you can change this in preferences.",
  },
  {
    id: "4",
    title: "Can images be uploaded to the canvas?",
    content: "Not yet. This functionality is currently being worked on. ",
  },
  {
    id: "5",
    title: "Can I export content from my notes to another platform?",
    content: "Yes you can. All documents are markdown, and there is a copy to clipboard button for each document in the title bar. Exporting to PDF is on the roadmap.",
  },
  {
    id: "6",
    title: "Does the AI have web search capability?",
    content: "Yes, the AI has web search capability. It's powered by Exa.ai, and it can search the web for information and use that information to answer your questions.",
  },
  {
    id: "7",
    title: "Do all notes need to be in a folder?",
    content: "No, notes don't need to be in a folder. Organize your notes however works best for you, and let the AI help you find what you need instantly.",
  },
  {
    id: "8",
    title: "How do I cancel?",
    content: "When you log into the app, click on the preferences icon and navigate to Manage Plan. This will bring you to your dashboard where you can cancel.",
  },
  {
    id: "9",
    title: "Who do I contact if there are any issues in the app?",
    content: "Me! I'm always happy to help. You can contact me at support@dodatathings[dot]dev",
  },
];

export default function FaqAccordion() {
  return (
    <Accordion
      type="single"
      collapsible
      className="w-full bg-[color:var(--card-bg)]/70 backdrop-blur-lg rounded-xl shadow-2xl border border-[color:var(--border-color)]/25 p-3 md:p-4"
    >
      {items.map((item, index) => (
        <AccordionItem
          value={item.id}
          key={item.id}
          className={`py-1 ${index === items.length - 1 ? '' : 'border-b border-[color:var(--border-color)]/20'}`}
        >
          <AccordionTrigger className="py-3 px-2 text-left text-base font-semibold leading-6 hover:no-underline">
            {item.title}
          </AccordionTrigger>
          <AccordionContent className="pb-2 px-2 text-base text-[color:var(--primary-color)]/90">
            {item.content}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
