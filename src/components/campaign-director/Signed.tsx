import type { ComponentProps } from "react";
import { useSignedUrl } from "@/lib/campaign-director/signedUrl";

export function SignedImg({ src, ...rest }: Omit<ComponentProps<"img">, "src"> & { src: string }) {
  const url = useSignedUrl(src);
  return <img src={url || undefined} {...rest} />;
}

export function SignedVideo({ src, poster, ...rest }: Omit<ComponentProps<"video">, "src" | "poster"> & { src: string; poster?: string }) {
  const url = useSignedUrl(src);
  const posterUrl = useSignedUrl(poster ?? "");
  return <video src={url || undefined} poster={posterUrl || undefined} {...rest} />;
}

export function SignedLink({ href, ...rest }: Omit<ComponentProps<"a">, "href"> & { href: string }) {
  const url = useSignedUrl(href);
  return <a href={url || undefined} {...rest} />;
}
