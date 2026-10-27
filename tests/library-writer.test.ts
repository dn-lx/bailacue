import { expect, it, vi } from "vitest";
import { createLibraryWriter } from "../src/services/libraryWriter";
it("waits for durable saves, serializes newer changes and preserves state while a write is pending", async () => {
  let release: () => void = () => {};
  const first = new Promise<void>((r) => {
    release = r;
  });
  const persist = vi
    .fn()
    .mockImplementationOnce(() => first)
    .mockResolvedValue(undefined);
  const writer = createLibraryWriter(persist, vi.fn(), vi.fn());
  const pending = writer.commit((l) => ({ ...l, deviceLock: true }));
  writer.update((l) => ({
    ...l,
    preferences: { ...l.preferences, weeklyMinutes: 90 },
  }));
  expect(writer.get().deviceLock).toBe(true);
  expect(writer.get().preferences.weeklyMinutes).toBe(90);
  let completed = false;
  void pending.then(() => {
    completed = true;
  });
  await Promise.resolve();
  expect(completed).toBe(false);
  release();
  await pending;
  await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
  expect(persist.mock.calls[1][0]).toMatchObject({
    deviceLock: true,
    preferences: { weeklyMinutes: 90 },
  });
});
it("rejects a failed commit before cleanup and lets a later retry save", async () => {
  const failed = vi.fn();
  const persist = vi
    .fn()
    .mockRejectedValueOnce(new Error("Disk full"))
    .mockResolvedValue(undefined);
  const cleanup = vi.fn();
  const writer = createLibraryWriter(persist, vi.fn(), failed);
  await expect(
    writer.commit((l) => ({ ...l, deviceLock: true })).then(cleanup),
  ).rejects.toThrow("Disk full");
  expect(cleanup).not.toHaveBeenCalled();
  expect(failed).toHaveBeenCalledOnce();
  await writer.commit((l) => ({ ...l, deviceLock: false }));
  expect(writer.get().deviceLock).toBe(false);
  await writer.close();
  await expect(writer.commit((l) => l)).rejects.toThrow("closing");
});
