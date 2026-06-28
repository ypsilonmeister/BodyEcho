import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";

export type PoseComplexity = "lite" | "full" | "heavy";
export type PoseLandmarks = PoseLandmarkerResult["landmarks"];

export interface PoseTrackerOptions {
  complexity: PoseComplexity;
  minPoseDetectionConfidence: number;
  minPosePresenceConfidence: number;
  minTrackingConfidence: number;
}

// MediaPipe Model paths
const MODEL_PATHS: Record<PoseComplexity, string> = {
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
  heavy: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
};

// Keep the CDN Wasm version aligned with package.json/package-lock.json.
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

export class PoseTracker {
  private poseLandmarker: PoseLandmarker | null = null;
  private currentComplexity: PoseComplexity = "lite";
  private videoStream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private isTrackerRunning = false;
  private isInitializing = false;
  private lastDetectionDuration = 25; // ms (smooth moving average)
  private lastDetectionTime = 0; // ms

  /**
   * Set up MediaPipe PoseLandmarker
   */
  public async initialize(complexity: PoseComplexity = "lite", force = false): Promise<void> {
    if (this.isInitializing) return;
    if (this.poseLandmarker && this.currentComplexity === complexity && !force) return;

    this.isInitializing = true;
    this.currentComplexity = complexity;

    try {
      if (this.poseLandmarker) {
        await this.poseLandmarker.close();
        this.poseLandmarker = null;
      }

      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      
      this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_PATHS[complexity],
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      console.log(`MediaPipe PoseLandmarker loaded successfully with model: ${complexity}`);
    } catch (error) {
      console.error("Failed to initialize MediaPipe PoseLandmarker:", error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Request camera permission and start the camera stream.
   * Attach it to the provided hidden video element.
   */
  public async startCamera(videoElement: HTMLVideoElement, deviceId?: string): Promise<MediaStream> {
    this.stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia(this.createCameraConstraints(deviceId));
      this.videoStream = stream;
      await this.attachStream(videoElement, stream);

      return stream;
    } catch (error) {
      console.error("Failed to access user camera:", error);
      this.stopCamera();
      throw error;
    }
  }

  /**
   * Switch cameras without tearing down the currently working stream until the
   * replacement stream is confirmed playable.
   */
  public async switchCamera(videoElement: HTMLVideoElement, deviceId: string): Promise<MediaStream> {
    const previousStream = this.videoStream;

    try {
      const stream = await navigator.mediaDevices.getUserMedia(this.createCameraConstraints(deviceId));
      await this.attachStream(videoElement, stream);

      previousStream?.getTracks().forEach((track) => track.stop());
      this.videoStream = stream;
      return stream;
    } catch (error) {
      console.error("Failed to switch user camera:", error);
      if (previousStream) {
        videoElement.srcObject = previousStream;
      }
      throw error;
    }
  }

  /**
   * Stop camera video streams
   */
  public stopCamera() {
    if (this.videoStream) {
      this.videoStream.getTracks().forEach((track) => track.stop());
      this.videoStream = null;
    }
  }

  /**
   * Start tracking pose on the camera video
   */
  public startTracking(
    videoElement: HTMLVideoElement,
    onResults: (results: PoseLandmarkerResult) => void,
    onError: (err: unknown) => void
  ) {
    if (this.isTrackerRunning) return;
    this.isTrackerRunning = true;

    let lastVideoTime = -1;
    this.lastDetectionTime = 0;
    this.lastDetectionDuration = 25; // Reset performance tracking on start

    const predictLoop = () => {
      if (!this.isTrackerRunning) return;

      try {
        if (this.poseLandmarker && videoElement.readyState >= 2) {
          const currentTime = videoElement.currentTime;
          const now = performance.now();
          
          // Calculate dynamic interval based on average detection time
          // Target CPU usage is ~40% (interval = duration / 0.40)
          // Clamp interval between 33ms (30 FPS) and 120ms (8.3 FPS)
          const targetInterval = this.lastDetectionDuration / 0.40;
          const minInterval = Math.max(33, Math.min(120, targetInterval));

          if (currentTime !== lastVideoTime && now - this.lastDetectionTime >= minInterval) {
            lastVideoTime = currentTime;
            this.lastDetectionTime = now;

            const startTimeMs = performance.now();
            const results = this.poseLandmarker.detectForVideo(videoElement, startTimeMs);
            const duration = performance.now() - startTimeMs;
            
            // Exponential moving average to smooth out duration spikes (10% weight to new frame)
            this.lastDetectionDuration = this.lastDetectionDuration * 0.9 + duration * 0.1;

            onResults(results);
          }
        }
      } catch (err) {
        console.error("Error during pose tracking loop:", err);
        onError(err);
      }

      this.animationFrameId = requestAnimationFrame(predictLoop);
    };

    predictLoop();
  }

  /**
   * Stop tracking pose and cancel loop
   */
  public stopTracking() {
    this.isTrackerRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Shutdown complete tracker
   */
  public async shutdown() {
    this.stopTracking();
    this.stopCamera();
    if (this.poseLandmarker) {
      await this.poseLandmarker.close();
      this.poseLandmarker = null;
    }
  }

  /**
   * Enumerate available video inputs (cameras)
   */
  public async getCameraDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === "videoinput");
    } catch (error) {
      console.error("Failed to enumerate camera devices:", error);
      return [];
    }
  }

  public getComplexity(): PoseComplexity {
    return this.currentComplexity;
  }

  private createCameraConstraints(deviceId?: string): MediaStreamConstraints {
    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
    };

    if (deviceId) {
      videoConstraints.deviceId = { exact: deviceId };
    } else {
      videoConstraints.facingMode = "user"; // default front camera
    }

    return {
      video: videoConstraints,
      audio: false,
    };
  }

  private async attachStream(videoElement: HTMLVideoElement, stream: MediaStream): Promise<void> {
    videoElement.srcObject = stream;

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        videoElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
        videoElement.removeEventListener("error", handleError);
      };

      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };

      const handleError = () => {
        settle(() => reject(new Error("Video element failed to load camera metadata.")));
      };

      const handleLoadedMetadata = () => {
        videoElement.play().then(
          () => settle(resolve),
          (error: unknown) => settle(() => reject(error))
        );
      };

      videoElement.addEventListener("loadedmetadata", handleLoadedMetadata);
      videoElement.addEventListener("error", handleError);

      if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
        handleLoadedMetadata();
      }
    });
  }
}

export const poseTracker = new PoseTracker();
export default poseTracker;
