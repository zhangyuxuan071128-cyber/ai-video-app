import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CreateStudio,
  createDraftStorageKey,
  optimizePromptLocally,
  readCreateDraft,
  removeCreateDraft,
  writeCreateDraft,
} from "./CreateStudio";

const testContext = vi.hoisted(() => ({
  currentUser: { id: "usr_alpha" },
  notify: vi.fn(),
  store: {
    state: {
      platforms: [{
        id: "plt_deepseek",
        name: "DeepSeek",
        specialty: "剧本与推理",
        accent: "#7c83ff",
        iconGlyph: "D",
        isEnabled: true,
        supportedFeatures: ["comic_drama", "commerce_video"],
      }],
    },
    currentUser: null as { id: string } | null,
    availablePaidCredits: 30,
    reservedPaidCredits: 0,
    userConnections: [],
    acceptCompliance: vi.fn(),
    createTask: vi.fn(),
    addMaterial: vi.fn(),
    getFeatureAccess: vi.fn(() => ({ ok: true, message: "本地演示通道可用" })),
  },
}));

vi.mock("../../state/AppStore", () => ({
  useAppStore: () => testContext.store,
}));

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

function renderStudio() {
  return render(<CreateStudio onNavigate={vi.fn()} notify={testContext.notify} />);
}

describe("CreateStudio V5 additions", () => {
  beforeEach(() => {
    testContext.store.currentUser = testContext.currentUser;
    testContext.notify.mockReset();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: memoryStorage(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("presents the six-stage chain as an explanatory map, not an executing job", () => {
    renderStudio();

    expect(screen.getByRole("heading", { name: "六阶段导演链路" })).toBeInTheDocument();
    for (const stage of ["Brief", "角色", "分镜", "画面", "配音", "合成"]) {
      expect(screen.getByText(stage)).toBeInTheDocument();
    }
    expect(screen.getByText(/不代表后台已开始执行/)).toBeInTheDocument();
  });

  it("disables empty optimization and expands an entered prompt with local rules", () => {
    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: "继续配置" }));

    const optimize = screen.getByRole("button", { name: "本地优化提示" });
    expect(optimize).toBeDisabled();
    expect(screen.getByText(/空内容没有可优化的主体信息/)).toBeInTheDocument();

    const prompt = screen.getByPlaceholderText(/^例：晨雾中的高山松茸采摘/);
    fireEvent.change(prompt, { target: { value: "雨夜里，一位年轻导演寻找遗失的胶片。" } });
    expect(optimize).toBeEnabled();
    fireEvent.click(optimize);

    const optimized = (prompt as HTMLTextAreaElement).value;
    expect(optimized).toContain("【主体】");
    expect(optimized).toContain("【环境】");
    expect(optimized).toContain("【镜头】");
    expect(optimized).toContain("【风格】");
    expect(optimized).toContain("【技术参数】9:16，1080p，约 25 秒，普通话");
    expect(testContext.notify).toHaveBeenCalledWith("success", expect.stringMatching(/本地规则.*未调用 AI/));
  });

  it("auto-saves every 30 seconds per user and supports restore and clear on re-entry", () => {
    vi.useFakeTimers();
    const first = renderStudio();
    fireEvent.click(screen.getByRole("button", { name: "继续配置" }));
    fireEvent.change(screen.getByLabelText(/任务名称/), { target: { value: "雨夜胶片" } });
    fireEvent.change(screen.getByPlaceholderText(/^例：晨雾中的高山松茸采摘/), { target: { value: "雨夜里，一位年轻导演寻找遗失的胶片。" } });

    expect(window.localStorage.getItem(createDraftStorageKey("usr_alpha"))).toBeNull();
    act(() => { vi.advanceTimersByTime(30_000); });

    const saved = readCreateDraft("usr_alpha");
    expect(saved?.form.title).toBe("雨夜胶片");
    expect(saved?.step).toBe(2);
    expect(readCreateDraft("usr_beta")).toBeNull();
    first.unmount();

    renderStudio();
    expect(screen.getByText(/发现.*保存的草稿/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "恢复草稿" }));
    expect(screen.getByLabelText(/任务名称/)).toHaveValue("雨夜胶片");
    expect(screen.getByPlaceholderText(/^例：晨雾中的高山松茸采摘/)).toHaveValue("雨夜里，一位年轻导演寻找遗失的胶片。");
  });

  it("clears a detected draft and tolerates unavailable browser storage", () => {
    const seed = {
      version: 1,
      userId: "usr_alpha",
      savedAt: "2026-09-08T12:00:00.000Z",
      step: 2,
      form: {
        mode: "commerce",
        sourceType: "prompt",
        title: "待清理草稿",
        sourceUrl: "",
        prompt: "一段足够完整的待清理创作提示。",
        dialogue: "",
        batchCount: 1,
        aspectRatio: "9:16",
        resolution: "1080p",
        durationSeconds: 25,
        language: "普通话",
        voiceName: "清越女声",
        platformId: "plt_deepseek",
        creditSource: "paid",
        copyrightConfirmed: false,
        voiceConfirmed: false,
      },
    } as Parameters<typeof writeCreateDraft>[0];
    expect(writeCreateDraft(seed)).toBe(true);

    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: "清除草稿" }));
    expect(window.localStorage.getItem(createDraftStorageKey("usr_alpha"))).toBeNull();
    expect(screen.getByText("已清除浏览器中的创作草稿")).toBeInTheDocument();

    const throwingStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    } as unknown as Storage;
    expect(readCreateDraft("usr_alpha", throwingStorage)).toBeNull();
    expect(writeCreateDraft(seed, throwingStorage)).toBe(false);
    expect(removeCreateDraft("usr_alpha", throwingStorage)).toBe(false);
  });
});

describe("optimizePromptLocally", () => {
  it("is empty-safe and idempotent for an already structured prompt", () => {
    const specs = { aspectRatio: "9:16" as const, resolution: "1080p" as const, durationSeconds: 30, language: "普通话" };
    expect(optimizePromptLocally("   ", specs)).toBe("");
    const optimized = optimizePromptLocally("山间咖啡馆开门营业", specs);
    expect(optimizePromptLocally(optimized, specs)).toBe(optimized);
  });
});
