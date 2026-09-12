import { PRODUCT_FIDELITY_LINES } from "@/content/productFidelity";

export default function ProductFidelityMessage() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {PRODUCT_FIDELITY_LINES.map((line) => (
        <li
          key={line}
          className="rounded-[18px] border border-border/70 bg-card p-4 text-base text-foreground"
        >
          {line}
        </li>
      ))}
    </ul>
  );
}
