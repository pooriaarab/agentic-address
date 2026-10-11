import { expect, test, vi } from "vitest";
import { parseArgs, runCli, UsageError } from "./cli.js";

const args = [
  "verify",
  "--street",
  "1600 Amphitheatre Parkway",
  "--city",
  "Mountain View",
  "--state",
  "CA",
  "--postal",
  "94043",
];

const io = () => ({
  out: vi.fn(),
  err: vi.fn(),
  readFile: vi.fn(() => "street\n1600 Amphitheatre Parkway\n"),
  writeFile: vi.fn(),
  now: () => new Date("2026-10-11T10:00:00Z"),
});

test("parse errors exit 2", async () => {
  for (const argv of [
    ["wrong"],
    ["verify"],
    [...args, "--bad"],
    [...args, "--vendor", "bad"],
    [...args, "--street"],
    ["batch", "--in", "a.csv"],
    ["batch", "--in", "a.csv", "--out", "b.csv", "--city", "Boston"],
  ]) {
    expect(() => parseArgs(argv)).toThrow(UsageError);
    expect(await runCli(argv, io())).toBe(2);
  }
});

test("commands produce output", async () => {
  for (const argv of [
    args,
    ["batch", "--in", "a.csv", "--out", "b.csv"],
    ["costs"],
    ["help"],
    ["version"],
    ["--help"],
    ["--version"],
  ]) {
    const fake = io();
    expect(await runCli(argv, fake)).toBe(0);
    expect(fake.out).toHaveBeenCalled();
  }
});

test("batch writes csv", async () => {
  const fake = io();
  expect(await runCli(["batch", "--in", "a.csv", "--out", "b.csv"], fake)).toBe(
    0,
  );
  expect(fake.writeFile).toHaveBeenCalledOnce();
  const [path, text] = fake.writeFile.mock.calls[0];
  expect(path).toBe("b.csv");
  expect(String(text)).toContain("verified_street");
});

test("vendor failure exits 1", async () => {
  const fake = io();
  expect(
    await runCli(
      [...args, "--vendor", "lob", "--live"],
      { ...fake, fetchFn: undefined },
    ),
  ).toBe(1);
  expect(fake.err).toHaveBeenCalled();
});
