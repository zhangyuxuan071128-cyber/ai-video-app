import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppStoreProvider, useAppStore, type AppStoreValue } from "./AppStore";

function wrapper({ children }: { children: ReactNode }) {
  return <AppStoreProvider>{children}</AppStoreProvider>;
}

async function loginAsCreator(result: { result: { current: AppStoreValue } }) {
  await act(async () => {
    const login = await result.result.current.login({ username: "creator", password: "123456" });
    expect(login.ok).toBe(true);
  });
}

describe("AppStore product flows", () => {
  beforeEach(() => {
    const createMemoryStorage = (): Storage => {
      const values = new Map<string, string>();
      return {
        get length() { return values.size; },
        clear: () => values.clear(),
        getItem: (key) => values.get(key) ?? null,
        key: (index) => [...values.keys()][index] ?? null,
        removeItem: (key) => { values.delete(key); },
        setItem: (key, value) => { values.set(key, value); },
      };
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
  });

  it("reserves paid credits for a queued task and releases them on cancel", async () => {
    const result = renderHook(() => useAppStore(), { wrapper });
    await loginAsCreator(result);
    const creditsBefore = result.result.current.availablePaidCredits;

    let taskId = "";
    act(() => {
      const created = result.result.current.createTask({
        platformId: "plt_deepseek",
        title: "测试批量剧集",
        featureKey: "comic_drama",
        creditSource: "paid",
        input: {
          mode: "comic_drama",
          sourceType: "prompt",
          prompt: "一个完整且具备授权的原创科幻短剧测试提示。",
          batchCount: 3,
          aspectRatio: "9:16",
          resolution: "1080p",
          durationSeconds: 30,
          language: "zh-CN",
        },
      });
      expect(created.ok).toBe(true);
      expect(created.data?.status).toBe("pending");
      taskId = created.data?.id ?? "";
    });

    expect(result.result.current.availablePaidCredits).toBeLessThan(creditsBefore);

    act(() => {
      const cancelled = result.result.current.cancelTask(taskId);
      expect(cancelled.ok).toBe(true);
      expect(cancelled.data?.status).toBe("cancelled");
    });
    expect(result.result.current.availablePaidCredits).toBe(creditsBefore);
  });

  it("redeems a recharge code once and rejects a second redemption", async () => {
    const result = renderHook(() => useAppStore(), { wrapper });
    await loginAsCreator(result);

    await act(async () => {
      const first = await result.result.current.redeemRechargeCode("ARCANE-50-DEMO");
      expect(first.ok).toBe(true);
      const second = await result.result.current.redeemRechargeCode("ARCANE-50-DEMO");
      expect(second.ok).toBe(false);
      expect(second.code).toBe("CODE_UNAVAILABLE");
    });
  });

  it("stores only a masked hint and fingerprint for an external API credential", async () => {
    const result = renderHook(() => useAppStore(), { wrapper });
    await loginAsCreator(result);

    let connected: Awaited<ReturnType<typeof result.result.current.connectPlatform>> | undefined;
    await act(async () => {
      connected = await result.result.current.connectPlatform({
        platformId: "plt_deepseek",
        appName: "QA 连接",
        apiKey: "sk-local-qa-secret-9876",
        dailyMaxSelfQuota: 20,
      });
    });

    expect(connected?.ok).toBe(true);
    expect(connected?.data?.statusMessage).toContain("未调用真实平台");
    expect(connected?.data?.apiKeyHint).not.toContain("local-qa-secret");
    expect(connected?.data?.apiKeyHint).toContain("9876");
    expect(connected?.data).not.toHaveProperty("apiKey");
  });
});
