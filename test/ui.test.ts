import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSpinner, printBanner, symbols, type BannerInfo } from "../src/ui.js";

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const strip = (s: string) => s.replace(ANSI_RE, "");

describe("symbols", () => {
  it("contains expected symbol characters", () => {
    expect(strip(symbols.success)).toBe("✓");
    expect(strip(symbols.error)).toBe("✗");
    expect(strip(symbols.info)).toBe("●");
    expect(strip(symbols.warn)).toBe("!");
    expect(strip(symbols.debug)).toBe("·");
  });
});

describe("createSpinner", () => {
  let writeSpy: ReturnType<typeof vi.spyOn<typeof process.stdout, "write">>;
  let writeErrSpy: ReturnType<typeof vi.spyOn<typeof process.stderr, "write">>;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    writeErrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    originalIsTTY = process.stdout.isTTY;
  });

  afterEach(() => {
    process.stdout.isTTY = originalIsTTY as boolean;
    vi.restoreAllMocks();
  });

  it("returns an object with update, succeed, fail, stop methods", () => {
    process.stdout.isTTY = false;
    const spinner = createSpinner("test");
    expect(typeof spinner.update).toBe("function");
    expect(typeof spinner.succeed).toBe("function");
    expect(typeof spinner.fail).toBe("function");
    expect(typeof spinner.stop).toBe("function");
  });

  describe("non-TTY fallback", () => {
    beforeEach(() => {
      process.stdout.isTTY = false;
    });

    it("prints initial text on creation", () => {
      createSpinner("Loading...");
      const output = strip(String(writeSpy.mock.calls[0]?.[0] ?? ""));
      expect(output).toContain("Loading...");
    });

    it("succeed writes success symbol and text", () => {
      const spinner = createSpinner("test");
      writeSpy.mockClear();
      spinner.succeed("Done!");
      const output = strip(String(writeSpy.mock.calls[0]?.[0] ?? ""));
      expect(output).toContain("✓");
      expect(output).toContain("Done!");
    });

    it("fail writes error symbol and text to stderr", () => {
      const spinner = createSpinner("test");
      spinner.fail("Failed!");
      const output = strip(String(writeErrSpy.mock.calls[0]?.[0] ?? ""));
      expect(output).toContain("✗");
      expect(output).toContain("Failed!");
    });
  });

  describe("TTY mode", () => {
    beforeEach(() => {
      process.stdout.isTTY = true;
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("succeed clears interval and writes success text", () => {
      const spinner = createSpinner("Loading...");
      writeSpy.mockClear();
      spinner.succeed("All done!");
      const output = strip(
        writeSpy.mock.calls.map((c) => String(c[0])).join(""),
      );
      expect(output).toContain("✓");
      expect(output).toContain("All done!");
    });

    it("fail clears interval and writes error text to stderr", () => {
      const spinner = createSpinner("Loading...");
      spinner.fail("Oops!");
      const output = strip(
        writeErrSpy.mock.calls.map((c) => String(c[0])).join(""),
      );
      expect(output).toContain("✗");
      expect(output).toContain("Oops!");
    });

    it("stop clears without writing a final message", () => {
      const spinner = createSpinner("Loading...");
      writeSpy.mockClear();
      spinner.stop();
      const output = writeSpy.mock.calls.map((c) => strip(String(c[0]))).join("");
      expect(output).not.toContain("✓");
      expect(output).not.toContain("✗");
    });
  });
});

describe("printBanner", () => {
  let logSpy: ReturnType<typeof vi.spyOn<typeof console, "log">>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const info: BannerInfo = {
    port: 8080,
    proxy: "openai",
    providerName: "OpenAI",
    routes: ["GET /v1/models", "POST /v1/chat/completions"],
    cwd: "/Users/test/project",
    autoPatch: false,
  };

  it("prints provider, routes, and directory", () => {
    printBanner(info);
    const output = logSpy.mock.calls.map((c) => strip(String(c[0] ?? ""))).join("\n");
    expect(output).toContain("OpenAI");
    expect(output).toContain("--proxy openai");
    expect(output).toContain("GET /v1/models");
    expect(output).toContain("POST /v1/chat/completions");
    expect(output).toContain("/Users/test/project");
  });

  it("does not show auto-patch when disabled", () => {
    printBanner(info);
    const output = logSpy.mock.calls.map((c) => strip(String(c[0] ?? ""))).join("\n");
    expect(output).not.toContain("Auto-patch");
  });

  it("shows auto-patch when enabled", () => {
    printBanner({ ...info, autoPatch: true });
    const output = logSpy.mock.calls.map((c) => strip(String(c[0] ?? ""))).join("\n");
    expect(output).toContain("Auto-patch");
    expect(output).toContain("enabled");
  });
});
