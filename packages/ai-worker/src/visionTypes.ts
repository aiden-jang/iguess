export interface VisionProvider {
  readonly name: string;
  // Best guess first. The runners-up are the fun part.
  guess(
    pngBase64: string,
    hint?: string,
    signal?: AbortSignal,
  ): Promise<string[]>;
}
