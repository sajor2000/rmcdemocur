import { beforeEach, describe, expect, it, vi } from "vitest";

const createCompletion = vi.hoisted(() => vi.fn());
const getAzureClient = vi.hoisted(() =>
  vi.fn(() => ({ chat: { completions: { create: createCompletion } } })),
);
vi.mock("@/lib/azure-ai", () => ({ getAzureClient }));

import { describeFigureImage } from "@/lib/vision-caption";

describe("describeFigureImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AZURE_OPENAI_DEPLOYMENT_CHAT = "gpt-4.1";
  });

  it("returns the model's caption text", async () => {
    createCompletion.mockResolvedValue({
      choices: [{ message: { content: "VEF and VIF. A line graph showing vagal fiber activity." } }],
    });

    const result = await describeFigureImage(Buffer.from([1, 2, 3]), "png");

    expect(result).toBe("VEF and VIF. A line graph showing vagal fiber activity.");
  });

  it("sends the image as a base64 data URI with the correct content type", async () => {
    createCompletion.mockResolvedValue({ choices: [{ message: { content: "A caption." } }] });

    await describeFigureImage(Buffer.from([0x89, 0x50, 0x4e, 0x47]), "png");

    const call = createCompletion.mock.calls[0][0];
    const userMessage = call.messages.find((m: { role: string }) => m.role === "user");
    const imagePart = userMessage.content.find((c: { type: string }) => c.type === "image_url");
    expect(imagePart.image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  it("returns null when the model reports NO_CONTENT", async () => {
    createCompletion.mockResolvedValue({ choices: [{ message: { content: "NO_CONTENT" } }] });

    const result = await describeFigureImage(Buffer.from([1]), "jpg");

    expect(result).toBeNull();
  });

  it("returns null when the model returns no content at all", async () => {
    createCompletion.mockResolvedValue({ choices: [{ message: { content: null } }] });

    const result = await describeFigureImage(Buffer.from([1]), "png");

    expect(result).toBeNull();
  });

  it("maps an unknown extension to a generic content type instead of throwing", async () => {
    createCompletion.mockResolvedValue({ choices: [{ message: { content: "A caption." } }] });

    await describeFigureImage(Buffer.from([1]), "emf");

    const call = createCompletion.mock.calls[0][0];
    const userMessage = call.messages.find((m: { role: string }) => m.role === "user");
    const imagePart = userMessage.content.find((c: { type: string }) => c.type === "image_url");
    expect(imagePart.image_url.url).toMatch(/^data:image\/png;base64,/);
  });
});
