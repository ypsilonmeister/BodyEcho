import { useState, useEffect, useRef } from "react";
import { 
  Camera, 
  AlertCircle, 
  HelpCircle, 
  Sparkles, 
  RefreshCw 
} from "lucide-react";
import BodyCanvas from "./components/BodyCanvas";
import ControlPanel from "./components/ControlPanel";
import { poseTracker } from "./utils/poseTracker";
import type { PoseComplexity } from "./utils/poseTracker";
import { audioSynth } from "./utils/audioSynth";

function App() {
  // App settings & tracking status states
  const [theme, setTheme] = useState<string>("cyberpunk");
  const [showTrails, setShowTrails] = useState<boolean>(true);
  const [autoCalibMode, setAutoCalibMode] = useState<"full" | "upper">("full");
  const [complexity, setComplexity] = useState<PoseComplexity>("lite");
  const [cameraBackground, setCameraBackground] = useState<"calibration" | "always" | "never">("calibration");
  const [gameMode, setGameMode] = useState<boolean>(false);
  const [gameType, setGameType] = useState<"pose" | "trace" | "kanji">("pose");
  const [traceHand, setTraceHand] = useState<"left" | "right">("right");
  const [tracePathType, setTracePathType] = useState<"horizontal" | "vertical" | "sine" | "circle">("horizontal");
  const [traceSpeed, setTraceSpeed] = useState<"slow" | "medium" | "fast">("medium");
  const [stretchHighlights, setStretchHighlights] = useState<boolean>(true);

  // Kanji writing specific states
  const [kanjiHand, setKanjiHand] = useState<"left" | "right">("right");
  const [kanjiChar, setKanjiChar] = useState<string>("雨");
  const [kanjiBrushStyle, setKanjiBrushStyle] = useState<"neon" | "flame" | "rainbow">("neon");
  const [kanjiTriggerGesture, setKanjiTriggerGesture] = useState<"always" | "fist" | "index">("always");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  
  // Sound controls
  const [volume, setVolume] = useState<number>(0.4);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Connection & lifecycle states
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
  const [cameraDenied, setCameraDenied] = useState<boolean>(false);
  const [modelError, setModelError] = useState<string | null>(null);
  
  // Detection results
  const [landmarks, setLandmarks] = useState<any[] | null>(null);
  const [calibrated, setCalibrated] = useState<boolean>(false);
  
  // UI Panels toggles
  const [panelOpen, setPanelOpen] = useState<boolean>(false);
  const [uiVisible, setUiVisible] = useState<boolean>(true);
  const [flashActive, setFlashActive] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const prevDeviceIdRef = useRef<string>("");

  // Sync settings with sub-utilities
  useEffect(() => {
    document.body.className = `theme-${theme}`;
  }, [theme]);

  useEffect(() => {
    audioSynth.setVolume(volume);
    audioSynth.setMute(isMuted);
  }, [volume, isMuted]);

  // Automatically close configuration panel when starting gameplay
  useEffect(() => {
    if (gameMode) {
      setPanelOpen(false);
    }
  }, [gameMode]);

  // Handle auto-hiding floating gear button when mouse is idle (minimalist mode)
  useEffect(() => {
    const handleMouseMove = () => {
      setUiVisible(true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      
      // Auto hide control button after 4 seconds of inactivity
      idleTimerRef.current = window.setTimeout(() => {
        setUiVisible(false);
      }, 4000);
    };

    window.addEventListener("mousemove", handleMouseMove);
    handleMouseMove(); // Start timer

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  // Hot-reload tracking models when accuracy complexity changes
  useEffect(() => {
    if (isCameraActive) {
      const reloadModel = async () => {
        setIsModelLoading(true);
        try {
          // Temporarily pause tracker loop
          poseTracker.stopTracking();
          await poseTracker.initialize(complexity, true);
          
          if (videoRef.current) {
            poseTracker.startTracking(
              videoRef.current,
              (results) => {
                setLandmarks(results.landmarks);
              },
              (err) => {
                console.error(err);
                setModelError("Tracking loop failure.");
              }
            );
          }
        } catch (err) {
          console.error(err);
          setModelError("Failed to change model complexity.");
        } finally {
          setIsModelLoading(false);
        }
      };

      reloadModel();
    }
  }, [complexity, isCameraActive]);

  // Hot-reload camera stream when selected camera device ID changes (excluding initial selection)
  useEffect(() => {
    if (isCameraActive && selectedDeviceId) {
      if (prevDeviceIdRef.current === selectedDeviceId) return;
      prevDeviceIdRef.current = selectedDeviceId;

      const reloadCamera = async () => {
        setIsModelLoading(true);
        try {
          poseTracker.stopTracking();
          if (videoRef.current) {
            await poseTracker.startCamera(videoRef.current, selectedDeviceId);
            poseTracker.startTracking(
              videoRef.current,
              (results) => {
                setLandmarks(results.landmarks);
              },
              (err) => {
                console.error(err);
                setModelError("Tracking loop error.");
              }
            );
          }
        } catch (err) {
          console.error(err);
          setModelError("Failed to switch camera device.");
        } finally {
          setIsModelLoading(false);
        }
      };

      reloadCamera();
    }
  }, [selectedDeviceId, isCameraActive]);

  // Handle cleanup on unmount
  useEffect(() => {
    return () => {
      poseTracker.shutdown();
    };
  }, []);

  /**
   * Start application: request camera access, resolve Wasm files, and run loop
   */
  const handleStartApp = async () => {
    setIsModelLoading(true);
    setCameraDenied(false);
    setModelError(null);

    // Initial audio cue activation
    audioSynth.playCalibrationStart();

    try {
      // 1. Initialize MediaPipe Wasm assets
      await poseTracker.initialize(complexity);

      // 2. Request camera permissions
      if (videoRef.current) {
        const stream = await poseTracker.startCamera(videoRef.current);
        setIsCameraActive(true);

        // Fetch and list available cameras
        const cameraDevices = await poseTracker.getCameraDevices();
        setDevices(cameraDevices);

        // Match the current streaming device ID to drop selection menu state cleanly
        const activeTrack = stream.getVideoTracks()[0];
        if (activeTrack) {
          const settings = activeTrack.getSettings();
          if (settings.deviceId) {
            setSelectedDeviceId(settings.deviceId);
            prevDeviceIdRef.current = settings.deviceId;
          } else if (cameraDevices.length > 0) {
            setSelectedDeviceId(cameraDevices[0].deviceId);
            prevDeviceIdRef.current = cameraDevices[0].deviceId;
          }
        }

        // 3. Start running prediction animations
        poseTracker.startTracking(
          videoRef.current,
          (results) => {
            setLandmarks(results.landmarks);
          },
          (err) => {
            console.error(err);
            setModelError("Pose tracking loop error occurred.");
          }
        );
      }
    } catch (err: any) {
      console.error("Initialization error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraDenied(true);
      } else {
        setModelError(err.message || "Failed to initialize skeleton tracking.");
      }
    } finally {
      setIsModelLoading(false);
    }
  };

  /**
   * Gesture reset callback (invoked by BodyCanvas)
   */
  const handleResetTriggered = () => {
    setFlashActive(true);
    setLandmarks(null);
    setCalibrated(false);
    setTimeout(() => {
      setFlashActive(false);
    }, 500);
  };

  // Human-readable status indicator message
  const getStatusText = () => {
    if (!isCameraActive) return "STANDBY";
    if (isModelLoading) return "LOADING ASSETS";
    if (!landmarks || landmarks.length === 0) return "OUT OF FRAME";
    if (!calibrated) return "CALIBRATING";
    return "ACTIVE";
  };

  return (
    <div className="app-container">
      {/* Reset Flash visual effect */}
      <div className={`canvas-flash-effect ${flashActive ? "flash-active" : ""}`} />

      {/* Hidden camera stream source */}
      <video
        ref={videoRef}
        className="hidden-video"
        playsInline
        muted
      />

      {/* Splash overlay displayed on startup / permissions block */}
      {!isCameraActive && (
        <div className="loading-overlay">
          <div className="loading-box">
            <h1 style={{ 
              fontWeight: 700, 
              letterSpacing: "1px", 
              background: "linear-gradient(135deg, #00f0ff, #ff007f)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "#00f0ff"
            }}>
              BODY IMAGE MIRROR
            </h1>
            <p>
              身体感覚（固有受容覚）の認識や力加減に難しさを抱えるお子様のための、
              不要なノイズを排除したAR骨格デジタルミラー。
            </p>

            {isModelLoading ? (
              <div>
                <div className="spinner" />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-right)" }}>
                  LOADING TRACKER WASM...
                </div>
              </div>
            ) : cameraDenied ? (
              <div style={{ color: "#ff4444", marginBottom: 24 }}>
                <AlertCircle size={32} style={{ margin: "0 auto 12px auto" }} />
                <h3 style={{ margin: "0 0 6px 0" }}>Camera Access Denied</h3>
                <p style={{ fontSize: 13, margin: 0 }}>
                  Please enable camera permission in your browser settings to run the skeleton tracking model.
                </p>
                <button 
                  onClick={handleStartApp}
                  className="btn-primary" 
                  style={{ marginTop: 20, background: "#ff4444", color: "#fff", boxShadow: "0 4px 12px rgba(255, 68, 68, 0.3)" }}
                >
                  <RefreshCw size={18} /> Retry Access
                </button>
              </div>
            ) : modelError ? (
              <div style={{ color: "#ffb700", marginBottom: 24 }}>
                <AlertCircle size={32} style={{ margin: "0 auto 12px auto" }} />
                <h3 style={{ margin: "0 0 6px 0" }}>Setup Error</h3>
                <p style={{ fontSize: 13, margin: 0 }}>{modelError}</p>
                <button 
                  onClick={handleStartApp}
                  className="btn-primary" 
                  style={{ marginTop: 20 }}
                >
                  <RefreshCw size={18} /> Retry Launch
                </button>
              </div>
            ) : (
              <button onClick={handleStartApp} className="btn-primary">
                <Camera size={18} /> START DIGITAL MIRROR
              </button>
            )}

            <div style={{ 
              marginTop: 32, 
              fontSize: 11, 
              color: "var(--text-secondary)", 
              borderTop: "1px solid var(--glass-border)", 
              paddingTop: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6
            }}>
              <HelpCircle size={14} />
              <span>Camera feed is processed locally and never sent over the web.</span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Status Indicator on top left */}
      {isCameraActive && (
        <div className="status-indicator" style={{
          opacity: uiVisible || panelOpen ? 1 : 0.05,
          transition: "opacity 0.4s"
        }}>
          <div className={`status-dot ${
            calibrated ? "active" : 
            landmarks && landmarks.length > 0 ? "calibrating" : ""
          }`} />
          <span className="status-text">{getStatusText()}</span>
        </div>
      )}

      {/* Floating interactive drawing canvas */}
      {isCameraActive && (
        <BodyCanvas
          landmarks={landmarks}
          calibrated={calibrated}
          setCalibrated={setCalibrated}
          showTrails={showTrails}
          theme={theme}
          autoCalibMode={autoCalibMode}
          onResetTriggered={handleResetTriggered}
          videoElement={videoRef.current}
          cameraBackground={cameraBackground}
          gameMode={gameMode}
          setGameMode={setGameMode}
          gameType={gameType}
          setGameType={setGameType}
          traceHand={traceHand}
          tracePathType={tracePathType}
          traceSpeed={traceSpeed}
          stretchHighlights={stretchHighlights}
          kanjiHand={kanjiHand}
          kanjiChar={kanjiChar}
          setKanjiChar={setKanjiChar}
          kanjiBrushStyle={kanjiBrushStyle}
          kanjiTriggerGesture={kanjiTriggerGesture}
        />
      )}

      {/* Settings control side drawer panel */}
      {isCameraActive && (
        <ControlPanel
          isOpen={panelOpen}
          setIsOpen={setPanelOpen}
          theme={theme}
          setTheme={setTheme}
          showTrails={showTrails}
          setShowTrails={setShowTrails}
          autoCalibMode={autoCalibMode}
          setAutoCalibMode={setAutoCalibMode}
          complexity={complexity}
          setComplexity={setComplexity}
          volume={volume}
          setVolume={setVolume}
          isMuted={isMuted}
          setIsMuted={setIsMuted}
          isModelLoading={isModelLoading}
          isVisible={uiVisible}
          cameraBackground={cameraBackground}
          setCameraBackground={setCameraBackground}
          gameMode={gameMode}
          setGameMode={setGameMode}
          gameType={gameType}
          setGameType={setGameType}
          traceHand={traceHand}
          setTraceHand={setTraceHand}
          tracePathType={tracePathType}
          setTracePathType={setTracePathType}
          traceSpeed={traceSpeed}
          setTraceSpeed={setTraceSpeed}
          stretchHighlights={stretchHighlights}
          setStretchHighlights={setStretchHighlights}
          devices={devices}
          selectedDeviceId={selectedDeviceId}
          setSelectedDeviceId={setSelectedDeviceId}
          kanjiHand={kanjiHand}
          setKanjiHand={setKanjiHand}
          kanjiChar={kanjiChar}
          setKanjiChar={setKanjiChar}
          kanjiBrushStyle={kanjiBrushStyle}
          setKanjiBrushStyle={setKanjiBrushStyle}
          kanjiTriggerGesture={kanjiTriggerGesture}
          setKanjiTriggerGesture={setKanjiTriggerGesture}
        />
      )}

      {/* On-screen child-friendly instructions banner */}
      {isCameraActive && (
        <div className="calib-instructions" style={{
          opacity: calibrated ? (uiVisible ? 0.8 : 0) : 1, // hidden when calibrated unless mouse active
          pointerEvents: "none",
        }}>
          {!calibrated ? (
            <>
              <h3><Sparkles size={14} style={{ marginRight: 6, display: "inline", verticalAlign: "middle" }} /> Calibration</h3>
              <p>
                {autoCalibMode === "full" 
                  ? "鏡のなかに全身（あたまから足首まで）を3秒間いれてね！" 
                  : "鏡のなかに上半身（あたまからお腹まで）をいれてね！"}
              </p>
            </>
          ) : (
            <>
              <h3>{gameMode && gameType === "kanji" ? "AR漢字かきかたモード" : "Mirror Active"}</h3>
              <p>
                {gameMode && gameType === "kanji" 
                  ? "空中に大きな字を描いてみよう！" 
                  : "体を動かして、ラインがどう動くか見てみよう！"}
              </p>
              <div className="y-pose-indicator">
                {gameMode && gameType === "kanji"
                  ? "「できた！」ボタンに手をあわせるとクリア！ 👏（両手をたたくと消せるよ）"
                  : "やり直すときは、両手をあたまの上にバンザイしてね（Yのポーズ）"}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
