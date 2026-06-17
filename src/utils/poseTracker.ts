import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export type PoseComplexity = "lite" | "full" | "heavy";

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

// CDN path for Wasm binaries
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm";

export class PoseTracker {
  private poseLandmarker: PoseLandmarker | null = null;
  private currentComplexity: PoseComplexity = "lite";
  private videoStream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private isTrackerRunning = false;
  private isInitializing = false;

  constructor() {}

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
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
      };

      if (deviceId) {
        videoConstraints.deviceId = { exact: deviceId };
      } else {
        videoConstraints.facingMode = "user"; // default front camera
      }

      const constraints: MediaStreamConstraints = {
        video: videoConstraints,
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoStream = stream;
      videoElement.srcObject = stream;
      
      // Wait for metadata to load and play the video
      await new Promise<void>((resolve) => {
        videoElement.onloadedmetadata = () => {
          videoElement.play().then(() => resolve());
        };
      });

      return stream;
    } catch (error) {
      console.error("Failed to access user camera:", error);
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
    onResults: (results: any) => void,
    onError: (err: any) => void
  ) {
    if (this.isTrackerRunning) return;
    this.isTrackerRunning = true;

    let lastVideoTime = -1;

    const predictLoop = () => {
      if (!this.isTrackerRunning) return;

      try {
        if (this.poseLandmarker && videoElement.readyState >= 2) {
          const currentTime = videoElement.currentTime;
          if (currentTime !== lastVideoTime) {
            lastVideoTime = currentTime;
            const startTimeMs = performance.now();
            const results = this.poseLandmarker.detectForVideo(videoElement, startTimeMs);
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
}

export const poseTracker = new PoseTracker();
export default poseTracker;
