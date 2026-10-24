import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http";
import { secureUploadLimitMb, secureUploadProblem, secureUploadRefusal } from "@/lib/secureUpload";

const MB = 1024 * 1024;
const file = (name: string, mb: number) => ({ name, size: mb * MB }) as File;

describe("chat upload rules (backend contract 23 Oct 2026)", () => {
  it("allows 50 MB files and 200 MB .mp4/.mov, .webm stays at 50", () => {
    expect(secureUploadLimitMb("a.pdf")).toBe(50);
    expect(secureUploadLimitMb("v.MOV")).toBe(200);
    expect(secureUploadLimitMb("v.webm")).toBe(50);
  });

  it.each([
    ["a.pdf", 49, null],
    ["a.pdf", 51, { kind: "size", mb: 50 }],
    ["v.mp4", 199, null],
    ["v.mp4", 201, { kind: "size", mb: 200 }],
    ["p.HEIC", 5, null],
    ["x.gif", 1, { kind: "type" }],
    ["x.exe", 1, { kind: "type" }],
    ["noext", 1, { kind: "type" }],
  ])("%s at %d MB", (name, mb, want) => {
    expect(secureUploadProblem(file(name as string, mb as number))).toEqual(want);
  });

  it("reads the backend's refusals", () => {
    const quota = new ApiError(413, "m", undefined, { data: { detail: { message: "m", quota_bytes: 1073741824, used_bytes: 1000000000 } } });
    expect(secureUploadRefusal(quota, "a.pdf")).toEqual({ kind: "quota", usedBytes: 1000000000, quotaBytes: 1073741824 });
    expect(secureUploadRefusal(new ApiError(413, "Fayl hajmi ruxsat etilgan limitdan oshdi"), "v.mov")).toEqual({ kind: "size", mb: 200 });
    expect(secureUploadRefusal(new ApiError(415, "x"), "a")).toEqual({ kind: "type" });
    expect(secureUploadRefusal(new ApiError(422, "x"), "a.zip")).toEqual({ kind: "broken" });
    expect(secureUploadRefusal(new ApiError(500, "x"), "a")).toBeNull();
  });
});
