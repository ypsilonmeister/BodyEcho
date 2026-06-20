import React from "react";
import { 
  Settings, 
  X, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  Accessibility, 
  Cpu, 
  Info,
  Camera
} from "lucide-react";
import type { PoseComplexity } from "../utils/poseTracker";
import { kanjiList, KANJI_CATEGORIES } from "./games/useKanjiWritingGame";

interface ControlPanelProps {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  theme: string;
  setTheme: (val: string) => void;
  showTrails: boolean;
  setShowTrails: (val: boolean) => void;
  autoCalibMode: "full" | "upper";
  setAutoCalibMode: (val: "full" | "upper") => void;
  complexity: PoseComplexity;
  setComplexity: (val: PoseComplexity) => void;
  volume: number;
  setVolume: (val: number) => void;
  isMuted: boolean;
  setIsMuted: (val: boolean) => void;
  isModelLoading: boolean;
  isVisible: boolean; // For auto-hiding when mouse is idle
  cameraBackground: "calibration" | "always" | "never";
  setCameraBackground: (val: "calibration" | "always" | "never") => void;
  gameMode: boolean;
  setGameMode: (val: boolean) => void;
  gameType: "pose" | "trace" | "kanji" | "balloon";
  setGameType: (val: "pose" | "trace" | "kanji" | "balloon") => void;
  traceHand: "left" | "right";
  setTraceHand: (val: "left" | "right") => void;
  tracePathType: "horizontal" | "vertical" | "sine" | "circle";
  setTracePathType: (val: "horizontal" | "vertical" | "sine" | "circle") => void;
  traceSpeed: "slow" | "medium" | "fast";
  setTraceSpeed: (val: "slow" | "medium" | "fast") => void;
  stretchHighlights: boolean;
  setStretchHighlights: (val: boolean) => void;
  devices: MediaDeviceInfo[];
  selectedDeviceId: string;
  setSelectedDeviceId: (val: string) => void;
  kanjiHand: "left" | "right";
  setKanjiHand: (val: "left" | "right") => void;
  kanjiChar: string;
  setKanjiChar: (val: string) => void;
  kanjiBrushStyle: "neon" | "flame" | "rainbow";
  setKanjiBrushStyle: (val: "neon" | "flame" | "rainbow") => void;
  kanjiTriggerGesture: "always" | "area";
  setKanjiTriggerGesture: (val: "always" | "area") => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isOpen,
  setIsOpen,
  theme,
  setTheme,
  showTrails,
  setShowTrails,
  autoCalibMode,
  setAutoCalibMode,
  complexity,
  setComplexity,
  volume,
  setVolume,
  isMuted,
  setIsMuted,
  isModelLoading,
  isVisible,
  cameraBackground,
  setCameraBackground,
  gameMode,
  setGameMode,
  gameType,
  setGameType,
  traceHand,
  setTraceHand,
  tracePathType,
  setTracePathType,
  traceSpeed,
  setTraceSpeed,
  stretchHighlights,
  setStretchHighlights,
  devices,
  selectedDeviceId,
  setSelectedDeviceId,
  kanjiHand,
  setKanjiHand,
  kanjiChar,
  setKanjiChar,
  kanjiBrushStyle,
  setKanjiBrushStyle,
  kanjiTriggerGesture,
  setKanjiTriggerGesture,
}) => {
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <>
      {/* Floating Gear Trigger Button */}
      <button
        id="control-trigger"
        className={`settings-trigger ${isOpen ? "panel-open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          opacity: (isVisible || isOpen) && !gameMode ? undefined : 0,
          pointerEvents: (isVisible || isOpen) && !gameMode ? "auto" : "none",
        }}
        title="Settings"
      >
        {isOpen ? <X size={20} /> : <Settings size={20} />}
      </button>

      {/* Glassmorphic Side Panel */}
      <div className={`control-panel ${isOpen ? "open" : ""}`}>
        <h2>CONFIGURATION</h2>

        {/* Model Complexity Selection */}
        <div className="settings-group">
          <label><Cpu size={14} style={{ marginRight: 6, verticalAlign: "middle" }} /> せいど (Pose Accuracy)</label>
          <select
            value={complexity}
            onChange={(e) => setComplexity(e.target.value as PoseComplexity)}
            disabled={isModelLoading}
            className="control-select"
          >
            <option value="lite">Lite (Fastest / Mobile)</option>
            <option value="full">Full (Balanced / Recommended)</option>
            <option value="heavy">Heavy (High Accuracy / PC)</option>
          </select>
          {isModelLoading && (
            <div style={{ fontSize: 11, color: "var(--color-right)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
              Loading model assets...
            </div>
          )}
        </div>

        {/* Theme Settings */}
        <div className="settings-group">
          <label><Sparkles size={14} style={{ marginRight: 6, verticalAlign: "middle" }} /> テーマ (Visual Theme)</label>
          <div className="theme-selector">
            <button
              onClick={() => setTheme("cyberpunk")}
              className={`theme-btn ${theme === "cyberpunk" ? "active" : ""}`}
            >
              Neon
            </button>
            <button
              onClick={() => setTheme("aurora")}
              className={`theme-btn ${theme === "aurora" ? "active" : ""}`}
            >
              Aurora
            </button>
            <button
              onClick={() => setTheme("gold")}
              className={`theme-btn ${theme === "gold" ? "active" : ""}`}
            >
              Amber
            </button>
            <button
              onClick={() => setTheme("monochrome")}
              className={`theme-btn ${theme === "monochrome" ? "active" : ""}`}
            >
              Minimal
            </button>
          </div>
        </div>

        {/* Movement Trails Toggle */}
        <div className="settings-group">
          <div className="toggle-container" onClick={() => setShowTrails(!showTrails)}>
            <span className="toggle-label">うごきのこん跡 (Movement Trails)</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={showTrails}
                onChange={() => {}} // Handled by container click
              />
              <span className="slider-round"></span>
            </label>
          </div>
        </div>

        {/* Game Mode Toggle */}
        <div className="settings-group">
          <div className="toggle-container" onClick={() => setGameMode(!gameMode)}>
            <span className="toggle-label">ゲームモード (Game Mode)</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={gameMode}
                onChange={() => {}}
              />
              <span className="slider-round"></span>
            </label>
          </div>
        </div>

        {/* Game Type Selection */}
        {gameMode && (
          <div className="settings-group" style={{ paddingLeft: 12, borderLeft: "2px solid var(--color-right)" }}>
            <label>Game Type / ゲームの選択</label>
            <select
              value={gameType}
              onChange={(e) => setGameType(e.target.value as "pose" | "trace" | "kanji" | "balloon")}
              className="control-select"
            >
              <option value="pose">ポーズ合わせ (Pose Matching)</option>
              <option value="trace">イライラ棒 (Slow Trace)</option>
              <option value="kanji">AR漢字かきかた (AR Kanji Writing)</option>
              <option value="balloon">風船わり (Balloon Pop)</option>
            </select>
          </div>
        )}

        {/* Slow Trace Specific Settings */}
        {gameMode && gameType === "trace" && (
          <div className="settings-group" style={{ paddingLeft: 12, borderLeft: "2px solid var(--color-right)", display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label>Tracked Wrist / なぞる手</label>
              <select
                value={traceHand}
                onChange={(e) => setTraceHand(e.target.value as "left" | "right")}
                className="control-select"
              >
                <option value="right">右手 (Right Wrist)</option>
                <option value="left">左手 (Left Wrist)</option>
              </select>
            </div>
            
            <div>
              <label>Course Path / コースの形状</label>
              <select
                value={tracePathType}
                onChange={(e) => setTracePathType(e.target.value as "horizontal" | "vertical" | "sine" | "circle")}
                className="control-select"
              >
                <option value="horizontal">直線：よこ (Horizontal)</option>
                <option value="vertical">直線：たて (Vertical)</option>
                <option value="sine">なみの線 (Sine Wave)</option>
                <option value="circle">まるい線 (Circle Arc)</option>
              </select>
            </div>

            <div>
              <label>Trace Speed / スピード</label>
              <select
                value={traceSpeed}
                onChange={(e) => setTraceSpeed(e.target.value as "slow" | "medium" | "fast")}
                className="control-select"
              >
                <option value="slow">ゆっくり (Slow)</option>
                <option value="medium">ふつう (Medium)</option>
                <option value="fast">はやめ (Fast)</option>
              </select>
            </div>
          </div>
        )}

        {/* Kanji Specific Settings */}
        {gameMode && gameType === "kanji" && (() => {
          const kanjiByCategory = kanjiList.reduce((acc, item) => {
            if (!acc[item.category]) acc[item.category] = [];
            acc[item.category].push(item);
            return acc;
          }, {} as Record<string, typeof kanjiList>);

          return (
            <div className="settings-group" style={{ paddingLeft: 12, borderLeft: "2px solid var(--color-right)", display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label>かんじのせんたく / Select Kanji</label>
                <select
                  value={kanjiChar}
                  onChange={(e) => setKanjiChar(e.target.value)}
                  className="control-select"
                >
                  {Object.entries(kanjiByCategory).map(([cat, list]) => (
                    <optgroup key={cat} label={KANJI_CATEGORIES[cat]}>
                      {list.map(k => (
                        <option key={k.char} value={k.char}>
                          {k.char} ({k.reading} - {k.meaning})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label>Tracked Hand / なぞる手</label>
                <select
                  value={kanjiHand}
                  onChange={(e) => setKanjiHand(e.target.value as "left" | "right")}
                  className="control-select"
                >
                  <option value="right">右手 (Right Hand)</option>
                  <option value="left">左手 (Left Hand)</option>
                </select>
              </div>

              <div>
                <label>Drawing Trigger / 描画のじょうけん</label>
                <select
                  value={kanjiTriggerGesture}
                  onChange={(e) => setKanjiTriggerGesture(e.target.value as "always" | "area")}
                  className="control-select"
                >
                  <option value="area">お手本の線の上で描画 (Draw On Strokes)</option>
                  <option value="always">常に描画 (Always Draw)</option>
                </select>
              </div>

              <div>
                <label>Brush Style / ふでのエフェクト</label>
                <select
                  value={kanjiBrushStyle}
                  onChange={(e) => setKanjiBrushStyle(e.target.value as "neon" | "flame" | "rainbow")}
                  className="control-select"
                >
                  <option value="neon">ネオン (Neon Trace)</option>
                  <option value="flame">ほのおの粒子 (Flame Particle)</option>
                  <option value="rainbow">にじいろグロウ (Rainbow Glow)</option>
                </select>
              </div>
            </div>
          );
        })()}

        {/* Stretch Highlights Toggle */}
        <div className="settings-group">
          <div className="toggle-container" onClick={() => setStretchHighlights(!stretchHighlights)}>
            <span className="toggle-label">のばすと光る (Extension Highlights)</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={stretchHighlights}
                onChange={() => {}}
              />
              <span className="slider-round"></span>
            </label>
          </div>
        </div>

        {/* Auto-calibration Mode Toggle */}
        <div className="settings-group">
          <label><Accessibility size={14} style={{ marginRight: 6, verticalAlign: "middle" }} /> よみとりモード (Calibration Mode)</label>
          <select
            value={autoCalibMode}
            onChange={(e) => setAutoCalibMode(e.target.value as "full" | "upper")}
            className="control-select"
          >
            <option value="full">Full Standing (Feet visible)</option>
            <option value="upper">Upper Body (Sitting/Desk)</option>
          </select>
        </div>

        {/* Camera Feed Mode selector */}
        <div className="settings-group">
          <label><Camera size={14} style={{ marginRight: 6, verticalAlign: "middle" }} /> カメラのはいけい (Camera Background)</label>
          <select
            value={cameraBackground}
            onChange={(e) => setCameraBackground(e.target.value as "calibration" | "always" | "never")}
            className="control-select"
          >
            <option value="calibration">During Calibration (Default)</option>
            <option value="always">Always Visible</option>
            <option value="never">Never (Pure Abstract)</option>
          </select>
        </div>

        {/* Camera Device Switcher selector */}
        {devices.length > 0 && (
          <div className="settings-group">
            <label><Camera size={14} style={{ marginRight: 6, verticalAlign: "middle" }} /> つかうカメラ (Active Camera)</label>
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="control-select"
            >
              {devices.map((device, idx) => (
                <option key={device.deviceId || idx} value={device.deviceId}>
                  {device.label || `Camera ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Audio Volume Controls */}
        <div className="settings-group">
          <label>おと (Sound Cues)</label>
          <div className="volume-slider-container">
            <button onClick={toggleMute} className="volume-btn">
              {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
            />
          </div>
        </div>

        {/* Informational Footer */}
        <div style={{ 
          marginTop: 24, 
          paddingTop: 14, 
          borderTop: "1px solid var(--glass-border)", 
          fontSize: 11, 
          color: "var(--text-secondary)",
          display: "flex",
          gap: 8,
          lineHeight: 1.4
        }}>
          <Info size={16} style={{ flexShrink: 0, color: "var(--color-right)" }} />
          <div>
            To reset manually, raise both hands above your head for 1.5 seconds.
          </div>
        </div>
      </div>
    </>
  );
};
export default ControlPanel;
