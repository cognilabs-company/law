// TypeScript's DOM lib does not yet include the experimental video-track
// processor/generator APIs used by the background effects worker.
type MediaStreamVideoTrack = MediaStreamTrack;

interface MediaStreamTrackProcessor {
  readonly readable: ReadableStream<VideoFrame>;
}

declare const MediaStreamTrackProcessor: {
  new (init: { track: MediaStreamVideoTrack; maxBufferSize?: number }): MediaStreamTrackProcessor;
};

interface MediaStreamTrackGenerator extends MediaStreamTrack {
  readonly writable: WritableStream<VideoFrame>;
}

declare const MediaStreamTrackGenerator: {
  new (init: { kind: "audio" | "video" }): MediaStreamTrackGenerator;
};
