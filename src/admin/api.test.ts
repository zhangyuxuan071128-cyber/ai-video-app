import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ login: vi.fn() }));

vi.mock("../control-plane/client", () => ({
  login: client.login,
  default: {},
  client: {},
  controlPlaneClient: {},
}));

import { controlApi } from "./api";

describe("admin control API boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("always identifies login as the admin portal", async () => {
    client.login.mockResolvedValue({
      data: {
        member: {
          id: "admin-1",
          username: "root.operator",
          nickname: "值班管理员",
          role: "super_admin",
          mustRotatePassword: false,
        },
        mustRotatePassword: false,
        portal: "admin",
      },
    });

    await expect(controlApi.login({ username: "root.operator", password: "secret" })).resolves.toMatchObject({
      role: "super_admin",
      username: "root.operator",
    });
    expect(client.login).toHaveBeenCalledWith({ username: "root.operator", password: "secret", portal: "admin" });
  });
});
