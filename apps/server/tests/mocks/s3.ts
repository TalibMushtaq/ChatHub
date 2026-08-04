import { vi } from "vitest";

/**
 * Mock S3Service for unit tests.
 *
 * Provides spies for all public methods without making real AWS requests.
 */
export function createMockS3Service() {
  return {
    generatePresignedPutUrl: vi
      .fn()
      .mockResolvedValue("https://s3.mock/presigned-put"),
    generatePresignedGetUrl: vi
      .fn()
      .mockResolvedValue("https://s3.mock/presigned-get"),
    headObject: vi.fn().mockResolvedValue(true),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };
}

export type MockS3Service = ReturnType<typeof createMockS3Service>;

/**
 * Reset all mock S3Service spies.
 */
export function resetMockS3Service(mock: MockS3Service) {
  mock.generatePresignedPutUrl.mockClear();
  mock.generatePresignedGetUrl.mockClear();
  mock.headObject.mockClear();
  mock.deleteObject.mockClear();
}
