import { describe, expect, it } from "vitest";

import { parseYouTubeUrl, youtubeEmbedUrl, youtubeThumbnailUrl } from "./youtube";

const ID = "dQw4w9WgXcQ";

describe("parseYouTubeUrl", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}&t=30s`,
    `http://www.youtube.com/watch?feature=share&v=${ID}`,
    `HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=AbCdEf123`,
    `youtu.be/${ID}/`,
    `  https://youtu.be/${ID}  `,
  ])("accepts the video URL %s", (input) => {
    expect(parseYouTubeUrl(input)).toEqual({
      videoId: ID,
      isShort: false,
      url: `https://www.youtube.com/watch?v=${ID}`,
    });
  });

  it.each([
    `https://www.youtube.com/shorts/${ID}`,
    `https://youtube.com/shorts/${ID}?si=xyz`,
    `https://m.youtube.com/shorts/${ID}/`,
    `youtube.com/shorts/${ID}`,
  ])("accepts the Short %s", (input) => {
    expect(parseYouTubeUrl(input)).toEqual({
      videoId: ID,
      isShort: true,
      url: `https://www.youtube.com/shorts/${ID}`,
    });
  });

  it.each([
    "",
    "   ",
    "not a url",
    `https://www.youtube.com/watch?v=${ID.slice(0, 10)}`,
    `https://www.youtube.com/watch?v=${ID}x`,
    `https://www.youtube.com/watch?v=dQw4w9WgXc!`,
    "https://www.youtube.com/watch",
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/shorts/${ID}/extra`,
    `https://youtu.be/${ID}/extra`,
    `https://youtube.com.evil.test/watch?v=${ID}`,
    `https://evil.test/youtu.be/${ID}`,
    `https://vimeo.com/123456`,
    `javascript:alert(1)//youtu.be/${ID}`,
    `ftp://youtu.be/${ID}`,
    `https://user:pass@youtu.be/${ID}`,
    `https://youtu.be:8443/${ID}`,
  ])("rejects %j", (input) => {
    expect(parseYouTubeUrl(input)).toBeNull();
  });
});

describe("YouTube URLs", () => {
  it("builds a thumbnail URL", () => {
    expect(youtubeThumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });

  it("builds a privacy-enhanced, muted, looping embed URL", () => {
    const url = new URL(youtubeEmbedUrl(ID));
    expect(url.origin).toBe("https://www.youtube-nocookie.com");
    expect(url.pathname).toBe(`/embed/${ID}`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      autoplay: "1",
      mute: "1",
      loop: "1",
      playlist: ID,
      playsinline: "1",
      rel: "0",
    });
  });
});
