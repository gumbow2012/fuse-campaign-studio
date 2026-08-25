import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const FAQ = [
  {
    q: "What am I actually paying for?",
    a: "Access to the FUSE template marketplace. You pick a campaign, upload your brand, and generate — no prompting required. Credits are the fuel each campaign run uses.",
  },
  {
    q: "How often are new campaigns added?",
    a: "New campaigns are added daily, and every one is included with any paid membership.",
  },
  {
    q: "What happens if I run out of credits?",
    a: "You can buy a one-time top-up at any time without changing your plan, or move up a tier for more monthly capacity.",
  },
  {
    q: "Do unused credits roll over?",
    a: "Monthly plan credits refresh at the start of each billing cycle. One-time top-up credits stay in your balance.",
  },
  {
    q: "Can I change or cancel my plan?",
    a: "Yes. You can change or cancel from your account at any time; access continues until the end of the current cycle.",
  },
];

export default function MembershipFaq() {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 md:p-7">
      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">FAQ</p>
      <Accordion type="single" collapsible className="mt-3">
        {FAQ.map((item) => (
          <AccordionItem key={item.q} value={item.q} className="border-white/10">
            <AccordionTrigger className="text-left text-sm text-white hover:no-underline">{item.q}</AccordionTrigger>
            <AccordionContent className="text-sm leading-6 text-slate-300">{item.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
