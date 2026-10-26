import { assertEquals } from "jsr:@std/assert@1";
import { normalizeInstagramUrl } from "./url.ts";

Deno.test("accepts reel/post/tv links and normalizes them", () => {
  assertEquals(normalizeInstagramUrl("https://www.instagram.com/reel/DAbc_12-x/?igsh=abc"), "https://www.instagram.com/reel/DAbc_12-x/");
  assertEquals(normalizeInstagramUrl("https://instagram.com/p/C1/"), "https://www.instagram.com/p/C1/");
  assertEquals(normalizeInstagramUrl(" https://www.instagram.com/someuser/reel/C9x "), "https://www.instagram.com/someuser/reel/C9x/");
});

Deno.test("rejects non-Instagram and non-post URLs", () => {
  assertEquals(normalizeInstagramUrl("http://www.instagram.com/reel/abc/"), null);
  assertEquals(normalizeInstagramUrl("https://evil.com/reel/abc/"), null);
  assertEquals(normalizeInstagramUrl("https://instagram.com.evil.com/reel/abc/"), null);
  assertEquals(normalizeInstagramUrl("https://www.instagram.com/someuser/"), null);
  assertEquals(normalizeInstagramUrl("not a url"), null);
});
