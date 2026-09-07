import { describe, expect, it } from "vitest";
import { derivePortalUrl } from "./portalUrls";

describe("portal URL derivation", () => {
  it("maps a Cloud Studio member hostname to the independent admin port", () => {
    expect(
      derivePortalUrl(3001, {
        protocol: "https:",
        hostname: "space-id--3000.ap-shanghai2.cloudstudio.club",
        port: "",
        origin: "https://space-id--3000.ap-shanghai2.cloudstudio.club",
      }),
    ).toBe("https://space-id--3001.ap-shanghai2.cloudstudio.club");
  });

  it("maps localhost to the requested portal port", () => {
    expect(
      derivePortalUrl(3000, {
        protocol: "http:",
        hostname: "localhost",
        port: "3001",
        origin: "http://localhost:3001",
      }),
    ).toBe("http://localhost:3000");
  });

  it("prefers an explicit custom-domain override", () => {
    expect(
      derivePortalUrl(
        3001,
        {
          protocol: "https:",
          hostname: "member.example.com",
          port: "",
          origin: "https://member.example.com",
        },
        "https://ops.example.com/",
      ),
    ).toBe("https://ops.example.com");
  });

  it("does not guess an unrelated production hostname", () => {
    expect(
      derivePortalUrl(3001, {
        protocol: "https:",
        hostname: "member.example.com",
        port: "",
        origin: "https://member.example.com",
      }),
    ).toBeNull();
  });
});
